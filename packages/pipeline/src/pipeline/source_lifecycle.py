"""Private source evidence shared by auditing, loading and backup verification."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path

CLASSIFICATION_SCHEMA = """
CREATE TABLE IF NOT EXISTS source_classifications (
 source_url TEXT PRIMARY KEY, schema_version INTEGER NOT NULL,
 resource_role TEXT NOT NULL CHECK(resource_role IN ('document','index')),
 evidence_json TEXT NOT NULL, classified_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS source_audit_actions (
 action_id TEXT PRIMARY KEY, source_url TEXT NOT NULL,
 disposition TEXT NOT NULL, evidence_hash TEXT NOT NULL,
 result_json TEXT NOT NULL, completed_at TEXT NOT NULL
);
"""


def stable_hash(value: object) -> str:
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode()
    ).hexdigest()


def private_path(root: Path, relative: str) -> Path:
    path = Path(relative)
    if not path.parts or path.is_absolute() or ".." in path.parts:
        raise ValueError("A corpus-relative evidence path is required")
    resolved = (root / path).resolve()
    if not resolved.is_relative_to(root.resolve()):
        raise ValueError("Evidence cannot escape the corpus root")
    return resolved


def verify_capture(root: Path, item: dict) -> Path:
    path = private_path(root, item.get("capture_path", ""))
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != item.get(
        "sha256"
    ):
        raise ValueError("Captured response hash mismatch")
    return path


def read_table(db_path: Path, table: str) -> list[dict]:
    if table not in {
        "source_classifications",
        "source_audit_actions",
        "source_retirements",
    }:
        raise ValueError("Unknown lifecycle table")
    if not db_path.exists():
        return []
    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as db:
        db.row_factory = sqlite3.Row
        if not db.execute(
            "SELECT 1 FROM sqlite_master WHERE name=?", (table,)
        ).fetchone():
            return []
        return [
            dict(row)
            for row in db.execute(f"SELECT * FROM {table} ORDER BY source_url")
        ]


def validate_never_downloaded(root: Path, row: dict, proof: dict) -> None:
    # Null local_path alone also describes a lost file; require the complete
    # successful-download history and independent retained snapshots instead.
    required = {
        "source_url",
        "first_seen_at",
        "local_path",
        "file_hash",
        "file_size",
        "last_downloaded_at",
        "last_changed_at",
        "download_attempts",
    }

    def empty_history(record: dict) -> bool:
        return (
            required <= record.keys()
            and record["source_url"] == row["source_url"]
            and all(
                record[k] is None
                for k in [
                    "local_path",
                    "file_hash",
                    "file_size",
                    "last_downloaded_at",
                    "last_changed_at",
                ]
            )
            and record["download_attempts"] == 0
            and record["first_seen_at"] == row["first_seen_at"]
        )

    if not empty_history(row) or proof.get("history_complete") is not True:
        raise ValueError(
            "Lost originals or uncertain download history cannot be retired without a hash"
        )
    snapshots = proof.get("retained_snapshots", [])
    if not snapshots:
        raise ValueError("Retained snapshot evidence is required for never_downloaded")
    for snapshot in snapshots:
        payload = json.loads(verify_capture(root, snapshot).read_text())
        receipt = json.loads(
            verify_capture(root, snapshot["restore_receipt"]).read_text()
        )
        if (
            payload.get("schema_version") != 1
            or receipt.get("decryptionVerified") is not True
            or len(receipt.get("archiveSha256", "")) != 64
            or receipt.get("sqliteIntegrity") != "ok"
            or payload.get("archive_sha256") != receipt["archiveSha256"]
        ):
            raise ValueError(
                "Never-downloaded evidence must identify a tested retained archive"
            )
        matches = [
            r
            for r in payload.get("documents", [])
            if r["source_url"] == row["source_url"]
        ]
        if (
            len(matches) != 1
            or not empty_history(matches[0])
            or payload.get("source_artifacts", {}).get(row["source_url"]) != []
        ):
            raise ValueError(
                "Retained history contradicts never_downloaded or lacks an artifact inventory"
            )


def lifecycle_snapshot(db_path: Path, artifact_hashes: dict[str, str]) -> dict:
    """Stable identity and disposition state, including missing/removed sources.

    Routine availability timestamps do not change content identity. Evidence
    records themselves retain timestamps and history in full.
    """
    if not db_path.exists():
        return {
            "schema_version": 2,
            "sources": [],
            "classifications": [],
            "retirements": [],
            "artifacts": {},
        }
    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as db:
        db.row_factory = sqlite3.Row
        sources = []
        for record in db.execute("SELECT * FROM documents ORDER BY source_url"):
            row = dict(record)
            relative = row.get("local_path")
            identity = {
                k: row.get(k)
                for k in [
                    "source_url",
                    "source_type",
                    "discovered_from",
                    "local_path",
                    "file_hash",
                    "last_downloaded_at",
                    "removed_at",
                ]
            }
            identity["status"] = (
                "available"
                if row.get("status") in {"downloaded", "updated", "unchanged"}
                else row.get("status")
            )
            identity["artifact_hash"] = (
                artifact_hashes.get("crawler/documents/" + relative)
                if relative
                else None
            )
            sources.append(identity)
    return {
        "schema_version": 2,
        "artifacts": {
            k: v
            for k, v in sorted(artifact_hashes.items())
            if k.startswith("crawler/documents/")
        },
        "sources": sources,
        "classifications": read_table(db_path, "source_classifications"),
        "retirements": read_table(db_path, "source_retirements"),
    }
