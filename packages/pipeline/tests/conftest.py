import sqlite3
from pathlib import Path

import pytest

from pipeline.retirement import REGISTRY_SCHEMA_PATH


@pytest.fixture
def crawler_registry(tmp_path: Path) -> Path:
    """An empty crawler registry at ``<root>/crawler/crawler.db`` with every
    table the crawler's schema.sql declares, so a writer test runs against the
    columns and constraints the crawler creates rather than a reduced copy."""
    db_path = tmp_path / "crawler/crawler.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as db:
        db.executescript(REGISTRY_SCHEMA_PATH.read_text())
    return db_path
