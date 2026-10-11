"""Shared access to the crawler's SQLite registry and its canonical path key.

Registry rows, downloaded files, parsed artifacts, and graph nodes are joined
on `local_path`. The crawler writes that column relative to its documents dir
with posix separators, so every consumer must normalize to that same form —
divergent normalizers silently drop join matches.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pipeline.config import CRAWLER_DATA_DIR, CRAWLER_DB_PATH

# Statuses that keep whatever payload the crawler last fetched, so the row stays
# in the corpus. `error` is one of them: a failed check or download leaves
# `local_path` and `file_hash` untouched (both null if nothing was ever fetched).
PAYLOAD_RETAINED_STATUSES = frozenset({"downloaded", "updated", "unchanged", "error"})

# Index membership is an observation, not a crawl status: a de-listed row keeps
# its `status`, payload and evidence and is only left out of the release graph.
# Enforced for the one family whose index was measured.
DELISTED_FROM_INDEX = "delisted_from_index"
DELISTING_ENFORCED_SOURCE_TYPES = frozenset({"dhhs_policy"})
_MANUAL_DISCOVERY = "manual"
# The agency's own mark on a superseded document it still publishes.
_ARCHIVED_TAG = "archived"


@dataclass(frozen=True)
class IndexListing:
    delisted: bool
    tags: tuple[str, ...] = ()

    @property
    def archived(self) -> bool:
        return _ARCHIVED_TAG in self.tags


def bare_sha256(value: Any) -> str:
    return str(value or "").removeprefix("sha256:")


def parsed_from_registry_payload(registry_row: dict[str, Any], sidecar: dict[str, Any]) -> bool:
    """True when the parsed bytes are the last bytes the crawler fetched."""
    registry_hash = bare_sha256(registry_row.get("file_hash"))
    parsed_hash = bare_sha256(
        sidecar.get("source_file_hash") or sidecar.get("source_pdf_hash")
    )
    return bool(registry_hash and parsed_hash == registry_hash)


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
    elif path.parts[:1] == ("..",) and data_dir.name in path.parts:
        # A sidecar written from another working directory names the crawler
        # data directory relatively ("../crawler/data/documents/..."): the join
        # key is what follows that directory.
        path = Path(*path.parts[path.parts.index(data_dir.name) + 1 :])
    return path.as_posix()


def read_index_listings(db_path: Path = CRAWLER_DB_PATH) -> dict[str, IndexListing]:
    """Derive each registry row's index membership from the crawler's listings.

    A row is de-listed only on positive evidence: its index page was listed in
    full by a later run than the one that last returned the row. One such
    absence is enough, and the next run that lists the row again restores it,
    because nothing is stored. A row discovered from that page before listings
    were recorded counts as listed before the first check. Failed, partial and
    dry runs never stamp a check, so they prove nothing. Manually added rows,
    manifest seeds and rows whose page has no complete check are exempt.
    """
    if not db_path.exists():
        return {}

    from pipeline.corpus_manifest import load_corpus_manifest

    seeds = {
        url
        for family in load_corpus_manifest().source_families
        for url in family.seed_urls
    }
    conn = sqlite3.connect(str(db_path))
    try:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE name IN "
                "('source_listings', 'source_index_checks')"
            )
        }
        if tables != {"source_listings", "source_index_checks"}:
            return {}
        listings: dict[str, IndexListing] = {}
        for source_url, source_type, discovered_from, listed_run, tags, checked_run in conn.execute(
            """
            SELECT d.source_url, d.source_type, d.discovered_from,
                   l.last_listed_run_id, l.tags, c.last_complete_run_id
            FROM documents d
            LEFT JOIN source_listings l ON l.source_url = d.source_url
            LEFT JOIN source_index_checks c
              ON c.index_url = COALESCE(l.index_url, d.discovered_from)
             AND c.source_type = d.source_type
            """
        ):
            delisted = (
                source_type in DELISTING_ENFORCED_SOURCE_TYPES
                and checked_run is not None
                and (listed_run is None or listed_run < checked_run)
                and discovered_from != _MANUAL_DISCOVERY
                and source_url not in seeds
            )
            listings[source_url] = IndexListing(
                delisted=delisted,
                tags=tuple(json.loads(tags)) if tags else (),
            )
        return listings
    finally:
        conn.close()


def read_registry_rows(
    db_path: Path = CRAWLER_DB_PATH, *, validate_classification_evidence: bool = True
) -> list[dict[str, Any]]:
    """Registry rows as the loader sees them: index roles and de-listing applied.

    A restored archive has no capture files beside its registry, so the backup
    inspector derives the same view without re-reading classification evidence,
    which it verifies separately from the archive's own hashes.
    """
    if not db_path.exists():
        return []

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        order = "id" if any(row[1] == "id" for row in conn.execute("PRAGMA table_info(documents)")) else "source_url"
        rows = [dict(row) for row in conn.execute(f"SELECT * FROM documents ORDER BY {order}")]
        if conn.execute("SELECT 1 FROM sqlite_master WHERE name='source_classifications'").fetchone():
            if validate_classification_evidence:
                from pipeline.source_audit import validate_classifications
                validate_classifications(db_path)
            roles = dict(conn.execute("SELECT source_url,resource_role FROM source_classifications"))
            for row in rows:
                row["resource_role"] = roles.get(row["source_url"], "document")
                if row["resource_role"] == "index":
                    row["registry_status"] = row["status"]
                    row["status"] = "index"
    finally:
        conn.close()
    listings = read_index_listings(db_path)
    for row in rows:
        listing = listings.get(row["source_url"])
        row[DELISTED_FROM_INDEX] = bool(listing and listing.delisted)
    return rows


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
