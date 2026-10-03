"""Reviewed product limitations; never source retirement or family optionality."""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from pipeline.source_lifecycle import private_path, stable_hash

POLICY_PATH = (
    Path(__file__).resolve().parents[4] / "packages/policy-corpus/src/scope/policy.json"
)
SCOPE_SCHEMA = """
CREATE TABLE IF NOT EXISTS source_answer_scopes (
 action_id TEXT PRIMARY KEY, source_url TEXT NOT NULL UNIQUE,
 policy_hash TEXT NOT NULL, registry_hash TEXT NOT NULL,
 artifact_hash TEXT, evidence_json TEXT NOT NULL, applied_at TEXT NOT NULL
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
        "packages/policy-corpus/src/scope/coverage.ts",
        "packages/policy-corpus/src/frame/service.ts",
        "packages/agent/src/processors/coverage-boundary.ts",
        "packages/agent/src/processors/verifier/run.ts",
        "packages/agent/src/processors/verifier/verify.ts",
        "packages/agent/src/processors/verifier/processor.ts",
        "packages/agent/src/tools/answer-frame.ts",
        "packages/agent/src/index.ts",
        "packages/agent/src/deep-research/agents.ts",
        "packages/pipeline/src/pipeline/answer_scope.py",
        "packages/pipeline/src/pipeline/eval/answer_scope.py",
        "packages/pipeline/src/pipeline/cli/release.py",
        "packages/pipeline/src/pipeline/release.py",
        "packages/pipeline/src/pipeline/recovery_inventory.py",
        "packages/pipeline/src/pipeline/parse/converter.py",
        "packages/pipeline/src/pipeline/audit.py",
        "packages/pipeline/src/pipeline/source_lifecycle.py",
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


def scope_records(db_path: Path) -> list[dict]:
    if not db_path.exists():
        return []
    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as db:
        db.row_factory = sqlite3.Row
        if not db.execute(
            "SELECT 1 FROM sqlite_master WHERE name='source_answer_scopes'"
        ).fetchone():
            return []
        return [
            dict(row)
            for row in db.execute(
                "SELECT * FROM source_answer_scopes ORDER BY source_url"
            )
        ]


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
        if not re.fullmatch(
            r"[a-f0-9]{64}", qualification.get("implementation_hash", "")
        ) or (
            current_policy is not None
            and qualification["implementation_hash"] != implementation_hash()
        ):
            raise ValueError(
                "Answer scope implementation changed; fresh qualification is required"
            )
        receipt = qualification.get("baseline_backup_receipt", {})
        if (
            receipt.get("decryptionVerified") is not True
            or receipt.get("sqliteIntegrity") != "ok"
            or not re.fullmatch(r"[a-f0-9]{64}", receipt.get("archiveSha256", ""))
            or not receipt.get("archiveObject")
            or receipt.get("sourceSnapshotHash")
            != "sha256:" + qualification["source_snapshot_hash"]
        ):
            raise ValueError(
                "A tested retained backup matching the pre-scope snapshot is required"
            )
        required_artifacts = set()
        for obligation in [*policy["required_coverage"], policy["required_bulletin"]]:
            source = by_url.get(obligation["source_url"])
            if not source or not source.get("local_path"):
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
            stem = Path(source["local_path"]).with_suffix("").as_posix()
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


def approved_scope_map(db_path: Path) -> dict[str, str]:
    records = scope_records(db_path)
    if not records:
        return {}
    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as db:
        db.row_factory = sqlite3.Row
        registry = [dict(row) for row in db.execute("SELECT * FROM documents")]
    return validate_scope_records(
        records,
        registry,
        _artifact_hashes(db_path.parent.parent, records),
        current_policy=scope_policy(),
    )


def scoped_failure_count(failures: list[dict], db_path: Path) -> int:
    from pipeline.crawler_registry import normalize_local_path

    approved = approved_scope_map(db_path)
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


def apply_answer_scope(root: Path, bundle: dict, *, apply: bool = False) -> dict:
    """Validate everything before changing only the dedicated scope records."""
    from pipeline.retirement import corpus_writer_lock

    db_path = root / "crawler/crawler.db"
    policy = scope_policy()
    if bundle.get("policy_hash") != stable_hash(policy) or not bundle.get("action_id"):
        raise ValueError("A reviewed action ID and current policy hash are required")
    qualification = bundle.get("qualification", {})
    with corpus_writer_lock(root), sqlite3.connect(db_path) as db:
        db.row_factory = sqlite3.Row
        registry = [dict(row) for row in db.execute("SELECT * FROM documents")]
        by_url = {row["source_url"]: row for row in registry}
        coverage_artifacts = {}
        obligations = [*policy["required_coverage"], policy["required_bulletin"]]
        for obligation in obligations:
            row = by_url.get(obligation["source_url"])
            if (
                not row
                or not row.get("local_path")
                or row["status"] not in {"downloaded", "unchanged", "updated"}
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
            stem = Path(row["local_path"]).with_suffix("").as_posix()
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
        from pipeline.freshness import build_answer_ready_snapshot
        from pipeline.config import CRAWLER_DB_PATH

        if CRAWLER_DB_PATH.resolve() != db_path.resolve():
            raise ValueError("CORPUS_DATA_ROOT must match the scoped corpus")
        existing = scope_records(db_path)
        if existing:
            if [(r["action_id"], r["evidence_json"]) for r in existing] != [
                (r["action_id"], r["evidence_json"])
                for r in sorted(records, key=lambda r: r["source_url"])
            ]:
                raise ValueError(
                    "Existing scope evidence differs; do not overwrite its history"
                )
            return {"status": "already_applied", "limitations": len(records)}
        if (
            build_answer_ready_snapshot(root / "pipeline/parsed")["snapshot_hash"]
            != qualification["source_snapshot_hash"]
        ):
            raise ValueError(
                "Scope qualification does not match the current source snapshot"
            )
        if apply:
            db.executescript(SCOPE_SCHEMA)
            db.executemany(
                "INSERT INTO source_answer_scopes VALUES(:action_id,:source_url,:policy_hash,:registry_hash,:artifact_hash,:evidence_json,:applied_at)",
                records,
            )
    return {
        "status": "applied" if apply else "validated",
        "limitations": len(records),
        "policy_hash": stable_hash(policy),
    }
