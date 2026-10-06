"""The crawler's schema.sql is the one declaration of the registry tables."""

import sqlite3
from fnmatch import fnmatch
from pathlib import Path

import pytest

from pipeline.retirement import REGISTRY_SCHEMA_PATH, registry_ddl

REPO_ROOT = Path(__file__).resolve().parents[3]


def test_shared_schema_is_the_crawler_file():
    assert REGISTRY_SCHEMA_PATH == REPO_ROOT / "packages/crawler/src/db/schema.sql"
    assert REGISTRY_SCHEMA_PATH.is_file()


def test_fixture_registry_has_the_crawler_columns(crawler_registry):
    with sqlite3.connect(crawler_registry) as db:
        columns = [row[1] for row in db.execute("PRAGMA table_info(documents)")]
        tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"source_url", "discovered_from", "local_path", "file_hash", "removed_at", "consecutive_not_found"} <= set(columns)
    assert len(columns) == 27
    assert {
        "documents", "source_retirements", "source_classifications", "crawl_runs",
        "rejected_urls", "source_freshness", "source_listings", "source_index_checks",
    } <= tables


def test_retirement_takes_only_its_own_statements_from_the_shared_file(tmp_path):
    ddl = registry_ddl("source_retirements")
    statements = [s.strip() for s in ddl.split(";") if s.strip()]
    assert [s.split("\n")[0] for s in statements] == [
        "CREATE TABLE IF NOT EXISTS source_retirements (",
        "CREATE UNIQUE INDEX IF NOT EXISTS source_retirements_active",
    ]
    # Runnable on its own: a retirement never creates or indexes another table.
    with sqlite3.connect(tmp_path / "registry.db") as db:
        db.executescript(ddl)
        assert {row[0] for row in db.execute("SELECT name FROM sqlite_master")} == {
            "source_retirements", "source_retirements_active",
        }
    with pytest.raises(ValueError, match="declares no table"):
        registry_ddl("no_such_table")


def _dockerignored(relative: str) -> bool:
    """Whether a .dockerignore pattern excludes ``relative`` (a file) or one of
    its parent directories, ignoring the negations that re-include paths."""
    patterns = [
        line.strip()
        for line in (REPO_ROOT / ".dockerignore").read_text().splitlines()
        if line.strip() and not line.startswith("#") and not line.startswith("!")
    ]
    parts = relative.split("/")
    candidates = ["/".join(parts[: i + 1]) for i in range(len(parts))]
    for pattern in patterns:
        for candidate in candidates:
            if fnmatch(candidate, pattern) or (
                pattern.startswith("**/") and fnmatch(candidate.split("/")[-1], pattern[3:])
            ):
                return True
    return False


def test_corpus_job_image_ships_the_shared_schema():
    # retirement.py reads the file at run time in the image, from
    # /app/packages/crawler/src/db/schema.sql; the Dockerfile copies `packages`
    # whole and .dockerignore must not drop the crawler source or SQL files.
    dockerfile = (REPO_ROOT / "packages/pipeline/Dockerfile").read_text()
    assert "COPY packages ./packages" in dockerfile
    assert not _dockerignored("packages/crawler/src/db/schema.sql")
    assert _dockerignored("packages/crawler/dist/db/schema.sql")
