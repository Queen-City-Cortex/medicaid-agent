"""Reconcile registry download failures with the parser's file inventory."""

import sqlite3
from pathlib import Path

from pipeline.corpus_manifest import load_corpus_manifest


def missing_source_payloads(db_path: Path) -> list[dict]:
    if not db_path.exists():
        return []
    families = {f.source_type: f for f in load_corpus_manifest().source_families}
    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as db:
        db.row_factory = sqlite3.Row
        rows = db.execute(
            "SELECT source_url,source_type,status,error_message FROM documents "
            "WHERE status!='removed' AND (local_path IS NULL OR local_path='') "
            "ORDER BY source_url"
        )
        return [
            {
                **dict(row),
                "required_for_answering": (
                    families[row["source_type"]].required_for_answering
                    if row["source_type"] in families
                    else True
                ),
            }
            for row in rows
        ]


def require_downloaded_sources(db_path: Path) -> None:
    count = sum(
        row["required_for_answering"] for row in missing_source_payloads(db_path)
    )
    if count:
        raise RuntimeError(f"{count} required sources have no downloaded payload")
