"""Parsed artifact naming shared by ingestion and lightweight evidence checks."""

from pathlib import Path


def artifact_stem_for_source_path(source_path: Path) -> str:
    """Keep PDF stems and distinguish non-PDF artifacts with their format."""
    suffix = source_path.suffix.lower()
    if suffix == ".pdf":
        return source_path.stem
    return f"{source_path.stem}__{suffix.lstrip('.')}"
