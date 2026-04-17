"""Write and read the SchemaVersion node — a single row marking what the graph contains.

The SchemaVersion node stores the hash of the corpus-manifest.json that drove the
current load, when the load finished, and the pipeline package version. The agent /
policy-corpus can read this back (via `getSchemaVersion` in TS) to detect drift
between the manifest and the graph (e.g. when a corpus source family is added to
the manifest but the pipeline has not yet re-loaded it).
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from pathlib import Path

from pipeline.graph.connection import get_session


# schema_version.py lives at packages/pipeline/src/pipeline/graph/schema_version.py —
# parents[5] is the repo root.
REPO_ROOT = Path(__file__).resolve().parents[5]
MANIFEST_PATH = REPO_ROOT / "corpus-manifest.json"


def compute_manifest_hash(manifest_path: Path = MANIFEST_PATH) -> str:
    """SHA-256 of the raw manifest bytes. Empty string when the file is missing."""
    try:
        data = manifest_path.read_bytes()
    except FileNotFoundError:
        return ""
    return hashlib.sha256(data).hexdigest()


def get_pipeline_version() -> str:
    """Read the pipeline package version from pyproject.toml; empty string on failure."""
    pyproject = Path(__file__).resolve().parents[3] / "pyproject.toml"
    try:
        text = pyproject.read_text()
    except FileNotFoundError:
        return ""
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("version"):
            _, _, rest = stripped.partition("=")
            return rest.strip().strip('"').strip("'")
    return ""


def write_schema_version(
    *,
    manifest_hash: str | None = None,
    pipeline_version: str | None = None,
    loaded_at: datetime | None = None,
) -> dict:
    """Upsert the single `SchemaVersion {id: "current"}` node.

    Returns the written values so the caller can log them.
    """
    effective_hash = manifest_hash if manifest_hash is not None else compute_manifest_hash()
    effective_version = (
        pipeline_version if pipeline_version is not None else get_pipeline_version()
    )
    effective_loaded_at = (loaded_at or datetime.now(timezone.utc)).isoformat()

    with get_session() as session:
        session.run(
            """
            MERGE (v:SchemaVersion {id: 'current'})
            SET v.manifest_hash = $manifest_hash,
                v.loaded_at = $loaded_at,
                v.pipeline_version = $pipeline_version
            """,
            {
                "manifest_hash": effective_hash,
                "loaded_at": effective_loaded_at,
                "pipeline_version": effective_version,
            },
        )

    return {
        "manifest_hash": effective_hash,
        "loaded_at": effective_loaded_at,
        "pipeline_version": effective_version,
    }


def read_schema_version() -> dict | None:
    """Return the current SchemaVersion row, or None if it was never written."""
    with get_session() as session:
        record = session.run(
            "MATCH (v:SchemaVersion {id: 'current'}) RETURN v.manifest_hash AS h, v.loaded_at AS l, v.pipeline_version AS p"
        ).single()
    if not record:
        return None
    return {
        "manifest_hash": record["h"],
        "loaded_at": record["l"],
        "pipeline_version": record["p"],
    }
