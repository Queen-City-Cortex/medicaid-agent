"""Review and apply source dispositions under the single corpus writer lock."""

from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit

from pipeline.corpus_manifest import load_corpus_manifest
from pipeline.retirement import canonical_url, corpus_writer_lock, retire_source_locked
from pipeline.source_lifecycle import (
    CLASSIFICATION_SCHEMA,
    private_path,
    stable_hash,
    verify_capture,
)


class DocumentLinks(HTMLParser):
    def __init__(self, base: str):
        super().__init__()
        self.base, self.links = base, set()
        self.titles, self.current, self.text = {}, None, []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.current, self.text = None, []
        href = dict(attrs).get("href")
        if tag != "a" or not href:
            return
        url = urljoin(self.base, href)
        parsed = urlsplit(url)
        if parsed.scheme != "https":
            return
        if (
            "/document/" in parsed.path
            or "/download" in parsed.path
            or Path(parsed.path).suffix.lower()
            in {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".pptx"}
        ):
            self.current = canonical_url(url)
            self.links.add(self.current)

    def handle_data(self, data):
        if self.current:
            self.text.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self.current:
            title = " ".join(" ".join(self.text).split())
            if title:
                self.titles[self.current] = title
            self.current, self.text = None, []


def validate_classification(root: Path, row: dict, evidence: dict) -> list[str]:
    if (
        evidence.get("schema_version") != 1
        or evidence.get("resource_role") not in {"document", "index"}
        or len(evidence.get("finding", "")) < 20
    ):
        raise ValueError(
            "Classification requires a version, role and substantive finding"
        )
    capture = evidence["capture"]
    if (
        canonical_url(capture["url"]) != row["source_url"]
        or capture.get("status_code") != 200
    ):
        raise ValueError(
            "Classification needs a successful capture of this exact source"
        )
    family = next(
        f
        for f in load_corpus_manifest().source_families
        if f.source_type == row["source_type"]
    )
    for url in [
        capture["url"],
        capture.get("final_url", capture["url"]),
        *[r["location"] for r in capture.get("redirects", [])],
    ]:
        if urlsplit(url).hostname not in family.allowed_domains:
            raise ValueError("Classification redirected to an unapproved official host")
    body = verify_capture(root, capture).read_text()
    parser = DocumentLinks(capture.get("final_url", capture["url"]))
    parser.feed(body)
    children = sorted(set(evidence.get("children", [])))
    if evidence["resource_role"] == "index":
        if not children or children != sorted(parser.links - {row["source_url"]}):
            raise ValueError(
                "Every actual document link must be investigated and registered before index exclusion"
            )
        family = next(
            f
            for f in load_corpus_manifest().source_families
            if f.source_type == row["source_type"]
        )
        if any(
            urlsplit(url).hostname not in family.allowed_domains for url in children
        ):
            raise ValueError("Index links include an unapproved official host")
    elif children:
        raise ValueError("Document classification cannot supply discovery children")
    return children


def validate_classifications(db_path: Path) -> None:
    from pipeline.source_lifecycle import read_table

    root = db_path.parent.parent
    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as db:
        db.row_factory = sqlite3.Row
        for classification in read_table(db_path, "source_classifications"):
            row = db.execute(
                "SELECT * FROM documents WHERE source_url=?",
                (classification["source_url"],),
            ).fetchone()
            if row is None:
                raise ValueError("Classification has no source identity")
            evidence = json.loads(classification["evidence_json"])
            children = validate_classification(root, dict(row), evidence)
            if any(
                not db.execute(
                    "SELECT 1 FROM documents WHERE source_url=?", (url,)
                ).fetchone()
                for url in children
            ):
                raise ValueError("Classified index has unregistered document children")


def apply_source_audit(
    root: Path, reviewed: dict, *, apply: bool = False
) -> list[dict]:
    if reviewed.get("schema_version") != 1:
        raise ValueError("Incompatible audit version")
    actions = reviewed.get("actions", [])
    if len({a["action_id"] for a in actions}) != len(actions):
        raise ValueError("Audit action IDs must be unique")
    results = []
    with corpus_writer_lock(root):
        db_path = root / "crawler/crawler.db"
        with sqlite3.connect(
            f"file:{db_path}?mode={'rw' if apply else 'ro'}", uri=True
        ) as db:
            db.row_factory = sqlite3.Row
            if apply:
                db.executescript(CLASSIFICATION_SCHEMA)
            for action in actions:
                fingerprint = stable_hash(action)
                journal_exists = db.execute(
                    "SELECT 1 FROM sqlite_master WHERE name='source_audit_actions'"
                ).fetchone()
                previous = (
                    db.execute(
                        "SELECT * FROM source_audit_actions WHERE action_id=?",
                        (action["action_id"],),
                    ).fetchone()
                    if journal_exists
                    else None
                )
                if previous:
                    if previous["evidence_hash"] != fingerprint:
                        raise ValueError(
                            "An audit action cannot be reused with different evidence"
                        )
                    results.append(json.loads(previous["result_json"]))
                    continue
                row = db.execute(
                    "SELECT * FROM documents WHERE source_url=?",
                    (canonical_url(action["source_url"]),),
                ).fetchone()
                if row is None:
                    raise ValueError("Unknown audited source")
                row = dict(row)
                if stable_hash(row) != action["registry_hash"]:
                    # Retirement and journal are separate commits; recognize only
                    # the exact already-applied evidence after an interruption.
                    existing = db.execute(
                        "SELECT 1 FROM sqlite_master WHERE name='source_retirements'"
                    ).fetchone()
                    retired = (
                        db.execute(
                            "SELECT evidence_json FROM source_retirements WHERE source_url=? AND reactivated_at IS NULL",
                            (row["source_url"],),
                        ).fetchone()
                        if existing
                        else None
                    )
                    if (
                        action["disposition"] != "retire"
                        or not retired
                        or json.loads(retired[0]) != action["evidence"]
                    ):
                        raise ValueError(
                            "Registry changed since evidence collection; review again"
                        )
                if row.get("local_path"):
                    import hashlib

                    source = private_path(root / "crawler/documents", row["local_path"])
                    actual = (
                        "sha256:" + hashlib.sha256(source.read_bytes()).hexdigest()
                        if source.is_file()
                        else None
                    )
                    if actual is None or actual != action.get("original_artifact_hash"):
                        raise ValueError(
                            "Original artifact changed or disappeared since review"
                        )
                disposition = action["disposition"]
                if disposition == "retire":
                    if action["evidence"]["source_url"] != row["source_url"]:
                        raise ValueError("Retirement evidence identity mismatch")
                    result = retire_source_locked(root, action["evidence"], apply=apply)
                elif disposition == "classify":
                    children = validate_classification(root, row, action["evidence"])
                    result = {
                        "source_url": row["source_url"],
                        "status": "classified" if apply else "validated",
                        "children": children,
                        "resource_role": action["evidence"]["resource_role"],
                    }
                    if apply:
                        current = db.execute(
                            "SELECT evidence_json FROM source_classifications WHERE source_url=?",
                            (row["source_url"],),
                        ).fetchone()
                        encoded = json.dumps(action["evidence"], sort_keys=True)
                        if current and current[0] != encoded:
                            raise ValueError(
                                "Existing classification evidence cannot be overwritten"
                            )
                        capture = action["evidence"]["capture"]
                        parsed_links = DocumentLinks(
                            capture.get("final_url", capture["url"])
                        )
                        parsed_links.feed(verify_capture(root, capture).read_text())
                        for url in children:
                            db.execute(
                                "INSERT INTO documents(source_url,discovered_from,source_type,title) VALUES(?,?,?,?) ON CONFLICT(source_url) DO NOTHING",
                                (
                                    url,
                                    row["source_url"],
                                    row["source_type"],
                                    parsed_links.titles.get(url),
                                ),
                            )
                        db.execute(
                            "INSERT OR IGNORE INTO source_classifications VALUES(?,?,?,?,?)",
                            (
                                row["source_url"],
                                1,
                                result["resource_role"],
                                encoded,
                                datetime.now(UTC).isoformat(),
                            ),
                        )
                elif disposition == "unresolved":
                    result = {
                        "source_url": row["source_url"],
                        "status": "unresolved",
                        "finding": action.get("finding"),
                    }
                else:
                    raise ValueError(
                        "Unsupported disposition; use guarded reactivate-source for payload recovery"
                    )
                if apply:
                    db.execute(
                        "INSERT INTO source_audit_actions VALUES(?,?,?,?,?,?)",
                        (
                            action["action_id"],
                            row["source_url"],
                            disposition,
                            fingerprint,
                            json.dumps(result, sort_keys=True),
                            datetime.now(UTC).isoformat(),
                        ),
                    )
                    db.commit()
                results.append(result)
    return results
