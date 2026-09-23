"""Reconcile registry download failures with the parser's file inventory."""

from pathlib import Path

from pipeline.corpus_manifest import load_corpus_manifest


def missing_source_payloads(db_path: Path) -> list[dict]:
    if not db_path.exists():
        return []
    families = {f.source_type: f for f in load_corpus_manifest().source_families}
    from pipeline.crawler_registry import read_registry_rows
    return [
        {**row, "required_for_answering": families[row["source_type"]].required_for_answering if row["source_type"] in families else True}
        for row in read_registry_rows(db_path)
        if row["status"] not in {"removed", "index"} and (not row.get("local_path") or not (db_path.parent / "documents" / row["local_path"]).is_file())
    ]


def require_downloaded_sources(db_path: Path) -> None:
    count = sum(
        row["required_for_answering"] for row in missing_source_payloads(db_path)
    )
    if count:
        raise RuntimeError(f"{count} required sources have no downloaded payload")
