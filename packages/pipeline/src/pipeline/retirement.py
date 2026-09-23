"""Evidence-backed retirement; source absence is never inferred from parse failure."""

from __future__ import annotations

import fcntl
import hashlib
import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from pipeline.corpus_manifest import load_corpus_manifest

RETIREMENT_SCHEMA = """
CREATE TABLE IF NOT EXISTS source_retirements (
  id INTEGER PRIMARY KEY,
  source_url TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  evidence_json TEXT NOT NULL,
  retired_at TEXT NOT NULL,
  reactivated_at TEXT,
  recovered_hash TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS source_retirements_active
ON source_retirements(source_url) WHERE reactivated_at IS NULL;
"""


@contextmanager
def corpus_writer_lock(root: Path):
    if not root.is_dir():
        raise ValueError("An existing corpus root is required")
    path = root / ".locks/corpus-job.lock"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def canonical_url(url: str) -> str:
    parsed = urlsplit(url)
    if (
        parsed.scheme not in {"https", "http"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        raise ValueError("Invalid source URL")
    return urlunsplit(
        (parsed.scheme, parsed.netloc.lower(), parsed.path or "/", parsed.query, "")
    )


def undocumented_removals(db_path: Path) -> list[dict]:
    """Older crawler tombstones do not establish evidence-backed retirement."""
    if not db_path.exists():
        return []
    retired = {
        row["source_url"]
        for row in read_retirements(db_path)
        if row["reactivated_at"] is None
    }
    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as db:
        db.row_factory = sqlite3.Row
        return [
            dict(row)
            for row in db.execute(
                "SELECT source_url,source_type,local_path FROM documents "
                "WHERE status='removed' ORDER BY source_url"
            )
            if row["source_url"] not in retired
        ]


def require_documented_removals(db_path: Path) -> None:
    unresolved = undocumented_removals(db_path)
    if unresolved:
        raise RuntimeError(
            f"{len(unresolved)} removed sources lack retirement evidence; "
            "recover them or complete the official-source investigation"
        )
    for row in read_retirements(db_path):
        evidence = json.loads(row["evidence_json"])
        if row["schema_version"] != 1 or evidence.get("schema_version") != 1:
            raise RuntimeError("Incompatible retirement evidence version")
        for item in evidence["evidence"]:
            relative = Path(item["capture_path"])
            capture = db_path.parent.parent / relative
            if (
                relative.is_absolute()
                or ".." in relative.parts
                or not capture.is_file()
                or hashlib.sha256(capture.read_bytes()).hexdigest() != item["sha256"]
            ):
                raise RuntimeError("Retirement evidence changed after investigation")


def retire_source(root: Path, evidence: dict, *, apply: bool = False) -> dict:
    """Validate an operator-authored evidence bundle, then atomically retire."""
    with corpus_writer_lock(root):
        db_path = root / "crawler/crawler.db"
        with sqlite3.connect(
            f"file:{db_path}?mode={'rw' if apply else 'ro'}", uri=True
        ) as db:
            db.row_factory = sqlite3.Row
            url = canonical_url(evidence["source_url"])
            row = db.execute(
                "SELECT * FROM documents WHERE source_url=?", (url,)
            ).fetchone()
            if row is None:
                raise ValueError("Unknown source identity")
            if (
                evidence.get("schema_version") != 1
                or len(evidence.get("reason", "").strip()) < 20
            ):
                raise ValueError(
                    "Versioned evidence and a substantive retirement reason are required"
                )
            rel = Path(row["local_path"] or "")
            source = root / "crawler/documents" / rel
            if (
                not rel.parts
                or rel.is_absolute()
                or ".." in rel.parts
                or not source.is_file()
            ):
                raise ValueError("Original source artifact is required")
            digest = "sha256:" + hashlib.sha256(source.read_bytes()).hexdigest()
            if digest != evidence.get("original_artifact_hash"):
                raise ValueError("Original artifact changed")
            family = next(
                f
                for f in load_corpus_manifest().source_families
                if f.source_type == row["source_type"]
            )
            findings = set()
            for item in evidence.get("evidence", []):
                official = urlsplit(canonical_url(item["url"]))
                if official.hostname not in family.allowed_domains:
                    raise ValueError(
                        "Retirement evidence must come from an allowed official domain"
                    )
                checked = datetime.fromisoformat(
                    item["checked_at"].replace("Z", "+00:00")
                )
                if checked.tzinfo is None or checked > datetime.now(UTC):
                    raise ValueError("Invalid evidence timestamp")
                if (
                    len(item.get("finding", "").strip()) < 20
                    or len(item.get("sha256", "")) != 64
                ):
                    raise ValueError(
                        "Evidence needs a finding and captured response hash"
                    )
                int(item["sha256"], 16)
                capture = Path(item.get("capture_path", ""))
                if not capture.parts or capture.is_absolute() or ".." in capture.parts:
                    raise ValueError("Captured official response is required")
                artifact = root / capture
                if (
                    not artifact.is_file()
                    or hashlib.sha256(artifact.read_bytes()).hexdigest()
                    != item["sha256"]
                ):
                    raise ValueError("Captured official response hash mismatch")
                findings.add(item.get("kind"))
            if "index_investigation" not in findings:
                raise ValueError(
                    "Official-index and replacement investigation is required"
                )
            basis = evidence.get("basis")
            if basis == "not_found":
                if int(row["consecutive_not_found"]) < 3:
                    raise ValueError("Three consecutive confirmed 404s are required")
            elif basis in {"withdrawn", "superseded"}:
                if "withdrawal_notice" not in findings:
                    raise ValueError(
                        "Explicit official withdrawal or supersession evidence is required"
                    )
            else:
                raise ValueError(
                    "Temporary failures and missing attachments cannot justify retirement"
                )
            replacement = evidence.get("replacement_url")
            if (
                replacement
                and urlsplit(canonical_url(replacement)).hostname
                not in family.allowed_domains
            ):
                raise ValueError("Replacement must be an official source")
            result = {"source_url": url, "apply": apply, "status": "validated"}
            if apply:
                db.executescript(RETIREMENT_SCHEMA)
                encoded = json.dumps({**evidence, "source_url": url}, sort_keys=True)
                current = db.execute(
                    "SELECT evidence_json FROM source_retirements WHERE source_url=? AND reactivated_at IS NULL",
                    (url,),
                ).fetchone()
                if current:
                    if current["evidence_json"] != encoded:
                        raise ValueError("An existing retirement cannot be overwritten")
                    return {**result, "status": "already_retired"}
                db.execute(
                    "INSERT INTO source_retirements(source_url,evidence_json,retired_at) VALUES(?,?,?)",
                    (url, encoded, datetime.now(UTC).isoformat()),
                )
                db.execute(
                    "UPDATE documents SET status='removed', removed_at=datetime('now') WHERE source_url=?",
                    (url,),
                )
                result["status"] = "retired"
            return result


def read_retirements(db_path: Path) -> list[dict]:
    if not db_path.exists():
        return []
    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as db:
        if not db.execute(
            "SELECT 1 FROM sqlite_master WHERE name='source_retirements'"
        ).fetchone():
            return []
        db.row_factory = sqlite3.Row
        return [
            dict(row)
            for row in db.execute("SELECT * FROM source_retirements ORDER BY id")
        ]
