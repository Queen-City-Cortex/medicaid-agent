"""Shared access to the crawler's SQLite registry and its canonical path key.

Registry rows, downloaded files, parsed artifacts, and graph nodes are joined
on `local_path`. The crawler writes that column relative to its documents dir
with posix separators, so every consumer must normalize to that same form —
divergent normalizers silently drop join matches.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from pipeline.config import CRAWLER_DATA_DIR, CRAWLER_DB_PATH


def normalize_local_path(path_value: str | None, data_dir: Path = CRAWLER_DATA_DIR) -> str | None:
    """Canonical join key: path relative to the crawler data dir, posix separators."""
    if not path_value:
        return None
    path = Path(str(path_value).replace("\\", "/"))
    if path.is_absolute():
        try:
            path = path.relative_to(data_dir)
        except ValueError:
            pass
    return path.as_posix()


def read_registry_rows(db_path: Path = CRAWLER_DB_PATH) -> list[dict[str, Any]]:
    if not db_path.exists():
        return []

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        order = "id" if any(row[1] == "id" for row in conn.execute("PRAGMA table_info(documents)")) else "source_url"
        rows = [dict(row) for row in conn.execute(f"SELECT * FROM documents ORDER BY {order}")]
        if conn.execute("SELECT 1 FROM sqlite_master WHERE name='source_classifications'").fetchone():
            from pipeline.source_audit import validate_classifications
            validate_classifications(db_path)
            roles = dict(conn.execute("SELECT source_url,resource_role FROM source_classifications"))
            for row in rows:
                row["resource_role"] = roles.get(row["source_url"], "document")
                if row["resource_role"] == "index":
                    row["registry_status"] = row["status"]
                    row["status"] = "index"
        return rows
    finally:
        conn.close()


def read_source_freshness(
    db_path: Path = CRAWLER_DB_PATH,
) -> list[dict[str, Any]]:
    """Read per-family successful discovery timestamps from newer registries."""
    if not db_path.exists():
        return []

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        try:
            return [
                dict(row)
                for row in conn.execute(
                    "SELECT * FROM source_freshness ORDER BY source_type"
                )
            ]
        except sqlite3.OperationalError:
            return []
    finally:
        conn.close()
