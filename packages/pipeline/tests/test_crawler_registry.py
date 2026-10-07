"""Tests for index-membership derivation from the crawler registry."""

import sqlite3
from pathlib import Path
from types import SimpleNamespace

import pytest

from pipeline.crawler_registry import (
    normalize_local_path,
    read_index_listings,
    read_registry_rows,
)

INDEX = "https://policies.ncdhhs.gov/divisional-a-m/health-benefits-nc-medicaid/"
UPLOADS = "https://policies.ncdhhs.gov/wp-content/uploads/"


def _registry(tmp_path: Path, *, listing_tables: bool = True) -> Path:
    db_path = tmp_path / "crawler.db"
    with sqlite3.connect(db_path) as db:
        db.execute(
            "CREATE TABLE documents (id INTEGER PRIMARY KEY, source_url TEXT UNIQUE,"
            " discovered_from TEXT, source_type TEXT, status TEXT)"
        )
        if listing_tables:
            db.execute(
                "CREATE TABLE source_listings (source_url TEXT PRIMARY KEY, index_url TEXT,"
                " last_listed_at TEXT, last_listed_run_id INTEGER, tags TEXT)"
            )
            db.execute(
                "CREATE TABLE source_index_checks (index_url TEXT PRIMARY KEY, source_type TEXT,"
                " last_complete_at TEXT, last_complete_run_id INTEGER)"
            )
    return db_path


def _document(
    db_path: Path,
    name: str,
    *,
    listed_run: int | None,
    source_type: str = "dhhs_policy",
    discovered_from: str = INDEX,
    tags: str = "[]",
) -> str:
    url = UPLOADS + name
    with sqlite3.connect(db_path) as db:
        db.execute(
            "INSERT INTO documents (source_url, discovered_from, source_type, status)"
            " VALUES (?, ?, ?, 'unchanged')",
            (url, discovered_from, source_type),
        )
        if listed_run is not None:
            db.execute(
                "INSERT INTO source_listings VALUES (?, ?, 'then', ?, ?)",
                (url, INDEX, listed_run, tags),
            )
    return url


def _check(db_path: Path, run_id: int, source_type: str = "dhhs_policy") -> None:
    with sqlite3.connect(db_path) as db:
        db.execute(
            "INSERT OR REPLACE INTO source_index_checks VALUES (?, ?, 'now', ?)",
            (INDEX, source_type, run_id),
        )


def test_document_absent_from_a_complete_listing_is_delisted(tmp_path):
    db_path = _registry(tmp_path)
    current = _document(db_path, "MA-2240-3.pdf", listed_run=2)
    superseded = _document(db_path, "MA-2240-2.pdf", listed_run=1)
    _check(db_path, 2)

    listings = read_index_listings(db_path)

    assert listings[current].delisted is False
    assert listings[superseded].delisted is True


def test_row_discovered_from_the_index_before_listings_existed_is_delisted(tmp_path):
    db_path = _registry(tmp_path)
    backlog = _document(db_path, "MA-2240-1.pdf", listed_run=None)
    _check(db_path, 1)

    assert read_index_listings(db_path)[backlog].delisted is True


def test_no_absence_is_inferred_without_a_complete_listing_of_the_page(tmp_path):
    """A failed, partial or dry run records listings but never a check."""
    db_path = _registry(tmp_path)
    unlisted = _document(db_path, "MA-2240-2.pdf", listed_run=1)
    never_listed = _document(db_path, "MA-2240-1.pdf", listed_run=None)
    _document(db_path, "MA-2240-3.pdf", listed_run=2)

    listings = read_index_listings(db_path)

    assert listings[unlisted].delisted is False
    assert listings[never_listed].delisted is False


def test_document_that_reappears_is_restored(tmp_path):
    db_path = _registry(tmp_path)
    url = _document(db_path, "MA-2240-2.pdf", listed_run=1)
    _check(db_path, 2)
    assert read_index_listings(db_path)[url].delisted is True

    with sqlite3.connect(db_path) as db:
        db.execute("UPDATE source_listings SET last_listed_run_id = 3")
    _check(db_path, 3)

    assert read_index_listings(db_path)[url].delisted is False


def test_manual_rows_seeds_and_other_families_are_exempt(tmp_path, monkeypatch):
    db_path = _registry(tmp_path)
    manual = _document(db_path, "manual.pdf", listed_run=1, discovered_from="manual")
    seed = _document(db_path, "seed.pdf", listed_run=1)
    waiver = _document(db_path, "waiver.pdf", listed_run=1, source_type="waiver")
    _check(db_path, 2)
    monkeypatch.setattr(
        "pipeline.corpus_manifest.load_corpus_manifest",
        lambda: SimpleNamespace(source_families=[SimpleNamespace(seed_urls=(seed,))]),
    )

    listings = read_index_listings(db_path)

    assert [listings[url].delisted for url in (manual, seed, waiver)] == [False] * 3


def test_registry_without_listing_tables_delists_nothing(tmp_path):
    db_path = _registry(tmp_path, listing_tables=False)
    url = _document(db_path, "MA-2240-1.pdf", listed_run=None)

    assert read_index_listings(db_path) == {}
    assert read_registry_rows(db_path)[0]["delisted_from_index"] is False
    assert read_registry_rows(db_path)[0]["source_url"] == url


def test_registry_rows_carry_the_derived_flag_and_keep_their_status(tmp_path):
    db_path = _registry(tmp_path)
    _document(db_path, "MA-2240-2.pdf", listed_run=1)
    _document(db_path, "MA-2240-3.pdf", listed_run=2)
    _check(db_path, 2)

    rows = read_registry_rows(db_path)

    assert [(row["delisted_from_index"], row["status"]) for row in rows] == [
        (True, "unchanged"),
        (False, "unchanged"),
    ]


@pytest.mark.parametrize(
    ("stored", "joined"),
    [
        ("clinical-policies/10a.pdf", "clinical-policies/10a.pdf"),
        ("/data/crawler/documents/clinical-policies/10a.pdf", "clinical-policies/10a.pdf"),
        # Two sidecars parsed on 2026-07-24 name the data directory relatively.
        ("../crawler/data/documents/clinical-policies/10a.pdf", "clinical-policies/10a.pdf"),
        ("../../elsewhere/clinical-policies/10a.pdf", "../../elsewhere/clinical-policies/10a.pdf"),
        ("C:\\data\\clinical-policies\\10a.pdf", "C:/data/clinical-policies/10a.pdf"),
    ],
)
def test_local_paths_join_on_the_part_below_the_crawler_data_directory(stored, joined):
    assert normalize_local_path(stored, Path("/data/crawler/documents")) == joined
