"""Reviewed product limitations; never source retirement or family optionality."""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from pipeline.crawler_registry import PAYLOAD_RETAINED_STATUSES
from pipeline.source_lifecycle import private_path, stable_hash
from pipeline.parse.artifact_paths import artifact_stem_for_source_path

POLICY_PATH = (
    Path(__file__).resolve().parents[4] / "packages/policy-corpus/src/scope/policy.json"
)
SCOPE_SCHEMA = """
CREATE TABLE IF NOT EXISTS source_answer_scopes (
 action_id TEXT PRIMARY KEY, source_url TEXT NOT NULL UNIQUE,
 policy_hash TEXT NOT NULL, registry_hash TEXT NOT NULL,
 artifact_hash TEXT, evidence_json TEXT NOT NULL, applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS source_answer_scopes_superseded (
 action_id TEXT PRIMARY KEY, source_url TEXT NOT NULL,
 policy_hash TEXT NOT NULL, registry_hash TEXT NOT NULL,
 artifact_hash TEXT, evidence_json TEXT NOT NULL, applied_at TEXT NOT NULL,
 superseded_by TEXT NOT NULL, superseded_at TEXT NOT NULL
);
"""


def scope_registry_hash(row: dict) -> str:
    # Retry timestamps/counters are observations, not new content identity.
    # A new payload, successful recovery, changed role/title/path, or removal
    # must invalidate approval; harmless availability retries must not.
    fields = [
        "source_url",
        "source_type",
        "title",
        "policy_number",
        "local_path",
        "file_hash",
        "file_size",
        "mime_type",
        "detected_content_type",
        "content_disposition_filename",
        "status",
        "first_seen_at",
        "last_downloaded_at",
        "last_changed_at",
        "removed_at",
    ]
    return stable_hash({key: row.get(key) for key in fields})


def implementation_hash() -> str:
    root = POLICY_PATH.parents[4]
    paths = [
        "corpus-manifest.json",
        "packages/crawler/src/crawl/downloader.ts",
        "packages/crawler/src/sources/bulletins.ts",
        "packages/policy-corpus/src/scope/coverage.ts",
        "packages/policy-corpus/src/frame/service.ts",
        "packages/agent/src/processors/coverage-boundary.ts",
        "packages/agent/src/processors/verifier/run.ts",
        "packages/agent/src/processors/verifier/verify.ts",
        "packages/agent/src/processors/verifier/processor.ts",
        "packages/agent/src/tools/answer-frame.ts",
        "packages/agent/src/index.ts",
        "packages/agent/src/runtime.ts",
        "packages/agent/src/cli.ts",
        "packages/agent/src/deep-research/agents.ts",
        "packages/agent/src/deep-research/routes.ts",
        "packages/pipeline/src/pipeline/answer_scope.py",
        "packages/pipeline/src/pipeline/eval/answer_scope.py",
        "packages/pipeline/src/pipeline/cli/release.py",
        "packages/pipeline/src/pipeline/cli/recovery.py",
        "packages/pipeline/src/pipeline/release.py",
        "packages/pipeline/src/pipeline/recovery_inventory.py",
        "packages/pipeline/src/pipeline/parse/converter.py",
        "packages/pipeline/src/pipeline/parse/artifact_paths.py",
        "packages/pipeline/src/pipeline/audit.py",
        "packages/pipeline/src/pipeline/source_lifecycle.py",
        "packages/pipeline/src/pipeline/freshness.py",
        "scripts/ops/verify-corpus-backup.py",
    ]
    return stable_hash(
        {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in paths}
    )


def scope_policy() -> dict:
    policy = json.loads(POLICY_PATH.read_text())
    if policy.get("schema_version") != 1 or not policy.get("limitations"):
        raise ValueError("Invalid answer scope policy")
    return policy


def _scope_table(db_path: Path, table: str, order: str) -> list[dict]:
    if not db_path.exists():
        return []
    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as db:
        db.row_factory = sqlite3.Row
        if not db.execute(
            "SELECT 1 FROM sqlite_master WHERE name=?", (table,)
        ).fetchone():
            return []
        return [dict(row) for row in db.execute(f"SELECT * FROM {table} ORDER BY {order}")]


def scope_records(db_path: Path) -> list[dict]:
    return _scope_table(db_path, "source_answer_scopes", "source_url")


def superseded_scope_records(db_path: Path) -> list[dict]:
    """Approvals a later one replaced; kept so an action ID is never reused."""
    return _scope_table(
        db_path, "source_answer_scopes_superseded", "action_id"
    )


def _approval_id(record: dict) -> str:
    return record["action_id"].rsplit(":", 1)[0]


def _approval_digest(records: list[dict]) -> str:
    """Every stored column of an approval's records, as they were when replaced."""
    columns = [
        "action_id",
        "source_url",
        "policy_hash",
        "registry_hash",
        "artifact_hash",
        "evidence_json",
        "applied_at",
    ]
    return stable_hash(
        sorted(
            ([record[column] for column in columns] for record in records),
            key=lambda row: row[0],
        )
    )


def _whole_approval(records: list[dict]) -> bool:
    """One approval's records: one per limitation of its policy, sharing one evidence."""
    evidence = {record["evidence_json"] for record in records}
    if len(evidence) != 1:
        return False
    approval = _approval_id(records[0])
    policy = json.loads(evidence.pop())["policy"]
    # Every stored column of every record is what the embedded policy says it was.
    stored = sorted(
        (r["action_id"], r["source_url"], r["registry_hash"], r["artifact_hash"], r["policy_hash"])
        for r in records
    )
    expected = sorted(
        (
            approval + ":" + item["id"],
            item["source_url"],
            item["registry_sha256"],
            item.get("retained_payload_sha256"),
            stable_hash(policy),
        )
        for item in policy["limitations"]
    )
    # Sorting mixed None/str artifact hashes is safe: the action ID is unique and sorts first.
    return [row[:3] for row in stored] == [row[:3] for row in expected] and stored == expected


def validate_superseded_records(superseded: list[dict], active: list[dict]) -> int:
    """The retained history is whole: every approval names the one it replaced.

    Each record's evidence commits to its predecessor, so the chain is walked
    back from the active approval. A deleted, altered or extra record breaks it,
    whether it is a whole approval or one limitation of one.
    """
    history: dict[str, list[dict]] = {}
    for record in superseded:
        if not record.get("superseded_at") or not re.fullmatch(
            r"[a-f0-9]{64}", record.get("registry_hash") or ""
        ):
            raise ValueError("Superseded answer scope history changed")
        history.setdefault(_approval_id(record), []).append(record)
    if any(not _whole_approval(group) for group in history.values()) or (
        active and not _whole_approval(active)
    ):
        raise ValueError("Superseded answer scope history changed")
    current, seen = active, set()
    while current:
        successor = _approval_id(current[0])
        if successor in seen:
            raise ValueError("Superseded answer scope history changed")
        seen.add(successor)
        evidence = json.loads(current[0]["evidence_json"])
        predecessor = evidence.get("supersedes")
        if predecessor is None:
            break
        current = history.get(predecessor, [])
        # The successor carries a digest of the evidence it replaced, so that
        # evidence cannot be rewritten afterwards, even consistently.
        if (
            not current
            or any(
                r["superseded_by"] != successor
                or r["superseded_at"] != evidence.get("superseded_at")
                for r in current
            )
            or _approval_digest(current) != evidence.get("supersedes_records_sha256")
        ):
            raise ValueError("Superseded answer scope history changed")
    if set(history) - seen:
        raise ValueError("Superseded answer scope history changed")
    return len(superseded)


def validate_scope_records(
    records: list[dict],
    registry: list[dict],
    hashes: dict[str, str],
    *,
    current_policy: dict | None = None,
) -> dict[str, str]:
    """Also used after archive restore, with recorded policy and archive hashes."""
    by_url = {row["source_url"]: row for row in registry}
    valid = {}
    for record in records:
        evidence = json.loads(record["evidence_json"])
        policy = evidence["policy"]
        if stable_hash(policy) != record["policy_hash"] or (
            current_policy is not None and policy != current_policy
        ):
            raise ValueError(
                "Answer scope policy changed; fresh qualification is required"
            )
        limitation = next(
            (
                item
                for item in policy["limitations"]
                if item["source_url"] == record["source_url"]
            ),
            None,
        )
        row = by_url.get(record["source_url"])
        if (
            not limitation
            or not row
            or scope_registry_hash(row) != record["registry_hash"]
            or record["registry_hash"] != limitation["registry_sha256"]
        ):
            raise ValueError("Answer scope registry guard changed")
        if (
            row.get("status") in {"removed", "index"}
            or row.get("source_type") != limitation["source_type"]
        ):
            raise ValueError(
                "Answer scope cannot exclude a removal, index, or different source family"
            )
        expected = limitation.get("retained_payload_sha256")
        actual = (
            hashes.get("crawler/documents/" + row["local_path"])
            if row.get("local_path")
            else None
        )
        if record["artifact_hash"] != expected or actual != (
            "sha256:" + expected if expected else None
        ):
            raise ValueError("Answer scope original artifact changed or was lost")
        qualification = evidence["qualification"]
        if (
            qualification.get("policy_hash") != record["policy_hash"]
            or set(qualification.get("cases", {})) != set(policy["qualification_cases"])
            or not all(value is True for value in qualification["cases"].values())
        ):
            raise ValueError("Answer scope qualification is incomplete")
        if not re.fullmatch(
            r"[a-f0-9]{40}", qualification.get("implementation_revision", "")
        ) or not re.fullmatch(
            r"[a-f0-9]{64}", qualification.get("source_snapshot_hash", "")
        ):
            raise ValueError("Answer scope qualification must identify code and corpus")
        # The code and corpus that were qualified are recorded, not re-compared:
        # an approval answers for its own sources (the guards above and below),
        # and the live acceptance gate in release-validate answers for the code.
        if not re.fullmatch(
            r"[a-f0-9]{64}", qualification.get("implementation_hash", "")
        ):
            raise ValueError("Answer scope qualification must identify code and corpus")
        required_artifacts = set()
        for obligation in [*policy["required_coverage"], policy["required_bulletin"]]:
            source = by_url.get(obligation["source_url"])
            # A removed or de-listed row keeps its file but leaves the graph:
            # it no longer supplies the coverage the approval rests on.
            if (
                not source
                or not source.get("local_path")
                or source.get("status") in {"removed", "index"}
                or source.get("delisted_from_index")
            ):
                raise ValueError("Required answer scope source is missing")
            name = "crawler/documents/" + source["local_path"]
            required_artifacts.add(name)
            if hashes.get(name) != "sha256:" + str(source.get("file_hash")):
                raise ValueError("Required answer scope source changed")
            if (
                obligation.get("payload_sha256")
                and source.get("file_hash") != obligation["payload_sha256"]
            ):
                raise ValueError("Reviewed answer scope source hash changed")
            source_path = Path(source["local_path"])
            stem = source_path.with_name(artifact_stem_for_source_path(source_path)).as_posix()
            required_artifacts.update(
                "pipeline/parsed/" + stem + suffix
                for suffix in [".json", ".md", ".meta.json"]
            )
        if set(evidence["coverage_artifacts"]) != required_artifacts:
            raise ValueError("Answer scope coverage evidence is incomplete")
        for artifact, expected_hash in evidence["coverage_artifacts"].items():
            if hashes.get(artifact) != expected_hash:
                raise ValueError(
                    "Required answer scope coverage artifact changed or was lost"
                )
        valid[record["source_url"]] = limitation["id"]
    return valid


def _artifact_hashes(root: Path, records: list[dict]) -> dict[str, str]:
    names = set()
    for record in records:
        evidence = json.loads(record["evidence_json"])
        names.update(evidence["coverage_artifacts"])
        limitation = next(
            item
            for item in evidence["policy"]["limitations"]
            if item["source_url"] == record["source_url"]
        )
        # The exact original path is frozen by the registry guard, checked below.
        if limitation.get("retained_payload_sha256"):
            with sqlite3.connect(
                f"file:{root / 'crawler/crawler.db'}?mode=ro", uri=True
            ) as db:
                row = db.execute(
                    "SELECT local_path FROM documents WHERE source_url=?",
                    (record["source_url"],),
                ).fetchone()
            if row and row[0]:
                names.add("crawler/documents/" + row[0])
    return {
        name: "sha256:"
        + hashlib.sha256(private_path(root, name).read_bytes()).hexdigest()
        for name in names
        if private_path(root, name).is_file()
    }


def qualification_snapshot_hash(root: Path) -> str:
    """The corpus hash a scope bundle records: every source and artifact, scope records left out.

    Scope records are what the bundle writes, so the hash is the same before an
    approval, after it, and when qualifying its replacement.
    """
    from pipeline.freshness import build_answer_ready_snapshot

    return build_answer_ready_snapshot(
        root / "pipeline/parsed",
        include_answer_scopes=False,
        db_path=root / "crawler/crawler.db",
    )["snapshot_hash"]


def _effective_registry(db_path: Path) -> list[dict]:
    """Registry rows as the graph loader sees them: index roles and de-listing applied."""
    from pipeline.crawler_registry import read_registry_rows

    return read_registry_rows(db_path)


def approved_scope_map(db_path: Path) -> dict[str, str]:
    records = scope_records(db_path)
    if not records:
        return {}
    return validate_scope_records(
        records,
        _effective_registry(db_path),
        _artifact_hashes(db_path.parent.parent, records),
        current_policy=scope_policy(),
    )


def usable_scope_map(db_path: Path) -> tuple[dict[str, str], str | None]:
    """The approved scopes, or none and the reason the approval no longer holds.

    An approval that has stopped matching its own sources, policy or coverage
    excludes nothing: every failure it covered blocks again. Withholding the
    exclusion is always safe, so callers that only count or report use this and
    keep running; `approved_scope_map` still raises for an operator applying.
    """
    try:
        return approved_scope_map(db_path), None
    except (ValueError, KeyError, OSError) as error:
        return {}, f"{type(error).__name__}: {error}"


def scoped_failure_count(failures: list[dict], db_path: Path) -> int:
    from pipeline.crawler_registry import normalize_local_path

    approved, _ = usable_scope_map(db_path)
    if not approved:
        return 0
    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as db:
        paths = {
            row[0]: row[1]
            for row in db.execute("SELECT local_path,source_url FROM documents")
            if row[0]
        }
    return sum(
        bool(row.get("required_for_answering"))
        and (
            row.get("source_url")
            or paths.get(normalize_local_path(row.get("source_file")))
        )
        in approved
        for row in failures
    )


def apply_answer_scope(
    root: Path,
    bundle: dict,
    *,
    apply: bool = False,
    supersede: str | None = None,
) -> dict:
    """Validate everything before changing only the dedicated scope records.

    `supersede` names the action id of the approval this one replaces. The
    replaced records move to `source_answer_scopes_superseded`; nothing is lost.
    """
    from pipeline.retirement import corpus_writer_lock

    db_path = root / "crawler/crawler.db"
    policy = scope_policy()
    if bundle.get("policy_hash") != stable_hash(policy) or not bundle.get("action_id"):
        raise ValueError("A reviewed action ID and current policy hash are required")
    qualification = bundle.get("qualification", {})
    with corpus_writer_lock(root), sqlite3.connect(db_path) as db:
        db.row_factory = sqlite3.Row
        registry = _effective_registry(db_path)
        by_url = {row["source_url"]: row for row in registry}
        coverage_artifacts = {}
        obligations = [*policy["required_coverage"], policy["required_bulletin"]]
        for obligation in obligations:
            row = by_url.get(obligation["source_url"])
            # A failed re-check keeps the payload, as it does for the graph
            # loader: the standing order's address now redirects, so every
            # crawl marks its row `error`. The hash checks below prove the
            # stored bytes are the reviewed ones.
            if (
                not row
                or not row.get("local_path")
                or row["status"] not in PAYLOAD_RETAINED_STATUSES
            ):
                raise ValueError("Required coverage has not been downloaded")
            name = "crawler/documents/" + row["local_path"]
            path = private_path(root, name)
            actual = hashlib.sha256(path.read_bytes()).hexdigest()
            if actual != row.get("file_hash") or (
                obligation.get("payload_sha256")
                and actual != obligation["payload_sha256"]
            ):
                raise ValueError("Required coverage source identity changed")
            coverage_artifacts[name] = "sha256:" + actual
            source_path = Path(row["local_path"])
            stem = source_path.with_name(artifact_stem_for_source_path(source_path)).as_posix()
            meta_name = "pipeline/parsed/" + stem + ".meta.json"
            meta = json.loads(private_path(root, meta_name).read_text())
            if (
                meta.get("parse_status") != "parsed"
                or meta.get("answer_ready") is not True
                or meta.get("quality_flags")
                or meta.get("source_file_hash") != "sha256:" + actual
            ):
                raise ValueError("Required coverage is not answer-ready")
            for kind, suffix in [
                ("json", ".json"),
                ("markdown", ".md"),
                ("metadata", ".meta.json"),
            ]:
                artifact = "pipeline/parsed/" + stem + suffix
                digest = (
                    "sha256:"
                    + hashlib.sha256(
                        private_path(root, artifact).read_bytes()
                    ).hexdigest()
                )
                if (
                    kind != "metadata"
                    and meta.get("artifacts", {}).get(kind, {}).get("sha256") != digest
                ):
                    raise ValueError("Required coverage parsed artifact changed")
                coverage_artifacts[artifact] = digest
            markdown = private_path(root, "pipeline/parsed/" + stem + ".md").read_text()
            if any(
                text not in markdown for text in obligation.get("required_text", [])
            ):
                raise ValueError("Full dated coverage-end evidence is required")
        evidence = {
            "policy": policy,
            "qualification": qualification,
            "coverage_artifacts": coverage_artifacts,
        }
        active = scope_records(db_path)
        active_ids = {_approval_id(r) for r in active}
        if supersede and active_ids == {supersede}:
            # Commits this approval to its predecessor and to that predecessor's
            # evidence; see validate_superseded_records.
            evidence["supersedes"] = supersede
            evidence["supersedes_records_sha256"] = _approval_digest(active)
            evidence["superseded_at"] = datetime.now(UTC).isoformat()
        elif supersede and active_ids == {bundle["action_id"]}:
            # A replay of the replacement: it already carries the commitment.
            applied = json.loads(active[0]["evidence_json"])
            if applied.get("supersedes") == supersede:
                for key in ["supersedes", "supersedes_records_sha256", "superseded_at"]:
                    evidence[key] = applied.get(key)
        records = [
            {
                "action_id": bundle["action_id"] + ":" + item["id"],
                "source_url": item["source_url"],
                "policy_hash": stable_hash(policy),
                "registry_hash": item["registry_sha256"],
                "artifact_hash": item.get("retained_payload_sha256"),
                "evidence_json": json.dumps(evidence, sort_keys=True),
                "applied_at": datetime.now(UTC).isoformat(),
            }
            for item in policy["limitations"]
        ]
        hashes = _artifact_hashes(root, records)
        validate_scope_records(records, registry, hashes, current_policy=policy)
        # Qualification is reviewed operator evidence, tied to the actual frozen source snapshot.
        from pipeline.config import CRAWLER_DB_PATH

        if CRAWLER_DB_PATH.resolve() != db_path.resolve():
            raise ValueError("CORPUS_DATA_ROOT must match the scoped corpus")
        existing = scope_records(db_path)
        same = [(r["action_id"], r["evidence_json"]) for r in existing] == [
            (r["action_id"], r["evidence_json"])
            for r in sorted(records, key=lambda r: r["source_url"])
        ]
        if existing and same:
            approved_scope_map(db_path)
            return {"status": "already_applied", "limitations": len(records)}
        if supersede and not existing:
            raise ValueError("No active scope approval exists to supersede")
        if existing:
            replaced = {_approval_id(r) for r in existing}
            if not supersede or replaced != {supersede}:
                raise ValueError(
                    "Existing scope evidence differs; name the approval to replace with --supersede"
                )
            used = {supersede} | {
                _approval_id(record) for record in superseded_scope_records(db_path)
            }
            # An ID names one approval for good, active or replaced.
            if bundle["action_id"] in used:
                raise ValueError("A superseding approval needs its own action ID")
            validate_superseded_records(superseded_scope_records(db_path), existing)
        # Compared once, here: the operator qualified this corpus.
        if qualification_snapshot_hash(root) != qualification["source_snapshot_hash"]:
            raise ValueError(
                "Scope qualification does not match the current source snapshot"
            )
        if apply:
            db.executescript(SCOPE_SCHEMA)
            if existing:
                now = evidence["superseded_at"]
                db.execute(
                    "INSERT INTO source_answer_scopes_superseded "
                    "SELECT action_id,source_url,policy_hash,registry_hash,artifact_hash,"
                    "evidence_json,applied_at,?,? FROM source_answer_scopes",
                    (bundle["action_id"], now),
                )
                db.execute("DELETE FROM source_answer_scopes")
            db.executemany(
                "INSERT INTO source_answer_scopes VALUES(:action_id,:source_url,:policy_hash,:registry_hash,:artifact_hash,:evidence_json,:applied_at)",
                records,
            )
    return {
        "status": "applied" if apply else "validated",
        "limitations": len(records),
        "policy_hash": stable_hash(policy),
        **({"superseded": supersede} if existing else {}),
    }
