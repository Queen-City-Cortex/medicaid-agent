"""Year-stamped editions: titles are the DHHS index rows measured on 2026-10-05."""

import json
import sqlite3
from datetime import date

import pytest

from pipeline.editions import build_superseded_editions, edition_key
from pipeline.graph.loader import load_all, load_document
from pipeline.identity import build_document_id
from pipeline.graph import queries
from pipeline.graph.corpus_types import SupersessionEdge
from pipeline.graph.corpus_writer import CorpusGraphWriter
from tests.fakes import RecordingGraphWriter, RecordingSession, session_factory

TODAY = date(2026, 10, 6)
UPLOADS = "https://policies.ncdhhs.gov/wp-content/uploads/"

NON_MAGI = [
    ("MA-2252 2019 NON-MAGI MEDICAID INCOME/RESERVE LIMITS", "non-magi-medicaid-income-reserve-limits-7.pdf"),
    ("MA-2252 2023 NON-MAGI MEDICAID INCOME/RESERVE LIMITS", "ma-2252-6.pdf"),
    ("2024 NON- MAGI MEDICAID INCOME/RESERVE LIMITS", "MA-3321-2.pdf"),
    ("2024 NON-MAGI MEDICAID INCOME/RESERVE LIMITS", "MA-2252-1.pdf"),
    ("2025 NON-MAGI MEDICAID INCOME/RESERVE LIMITS", "MA-2252-1-1.pdf"),
    ("2026 NON-MAGI MEDICAID INCOME/RESERVE LIMITS", "MA-2252-Non-MAGI-Income-1.pdf"),
    # Undated: the agency leaves it untagged and no year says which edition it is.
    ("MA-2252 NON-MAGI MEDICAID INCOME/RESERVE LIMITS", "MA-2252-Non-MAGI-Income-2.pdf"),
]


def _row(title, file_name, **overrides):
    return {
        "source_type": "dhhs_policy",
        "source_url": UPLOADS + file_name,
        "title": title,
        "local_path": "dhhs-policies/" + file_name,
        "status": "unchanged",
        **overrides,
    }


def _superseded(rows, **kwargs):
    editions = build_superseded_editions(rows, today=TODAY, **kwargs)
    return {url.removeprefix(UPLOADS): edition for url, edition in editions.items()}


def test_every_edition_but_the_newest_is_superseded_by_it():
    superseded = _superseded([_row(*entry) for entry in NON_MAGI])

    assert sorted(superseded) == sorted(
        [
            "non-magi-medicaid-income-reserve-limits-7.pdf",
            "ma-2252-6.pdf",
            "MA-3321-2.pdf",
            "MA-2252-1.pdf",
            "MA-2252-1-1.pdf",
        ]
    )
    edition = superseded["ma-2252-6.pdf"]
    assert (edition.group, edition.year, edition.by_year) == (
        "non magi medicaid income reserve limits",
        2023,
        2026,
    )
    assert edition.by_title == "2026 NON-MAGI MEDICAID INCOME/RESERVE LIMITS"
    assert edition.by_source_url == UPLOADS + "MA-2252-Non-MAGI-Income-1.pdf"


def test_ampersand_and_the_word_are_one_table():
    superseded = _superseded(
        [
            _row("2024 MAGI MEDICAID & MEDICAID EXPANSION INCOME LIMITS", "ma-3321-2.pdf"),
            _row("2025 MAGI MEDICAID AND MEDICAID EXPANSION INCOME LIMITS", "MA-3321-1.pdf"),
            _row("2026 MAGI MEDICAID & MEDICAID EXPANSION INCOME LIMITS", "MA-3321-MAGI-Income-2.pdf"),
        ]
    )

    assert sorted(superseded) == ["MA-3321-1.pdf", "ma-3321-2.pdf"]


@pytest.mark.parametrize(
    "title",
    [
        # A change notice or letter is numbered, not re-issued under one title.
        "CHANGE NOTICE FOR MANUAL NO. 08-25, 2025 Spousal Impoverishment Standards",
        "DHB ADMINISTRATIVE LETTER NO. 05-22, 2022 Spousal Impoverishment Standards",
        "Achieving a Better Life Experience Accounts – June 6, 2026 Listserv",
        # A publication date, a range, a session law and a form number.
        "MA-2251 Reasonable Compatibility Calculator-20% Effective January 16, 2023",
        "dhb-7098-I DMA-7098 – Additional Information and Instructions   Feb 23, 2021",
        "MA-3560 2023 – 2024 COUNTY INTERNAL INSPECTION SCHEDULE",
        "dma-3085-ia Session Law 2013-306 PCS Training Attestation Form",
        "DHB-2025 Request for Review",
        "MA-2252 NON-MAGI MEDICAID INCOME/RESERVE LIMITS",
        # Not published yet as far as the load date knows.
        "2027 NON-MAGI MEDICAID INCOME/RESERVE LIMITS",
    ],
)
def test_titles_that_are_not_editions(title):
    assert edition_key(title, today=TODAY) is None


def test_policy_number_is_dropped_from_the_stem_and_kept_as_a_guard():
    assert edition_key("MA-2252 2023 NON-MAGI MEDICAID INCOME/RESERVE LIMITS", today=TODAY) == (
        "non magi medicaid income reserve limits",
        2023,
        "MA-2252",
    )
    # Two manuals that happen to share a table name are two tables.
    assert not _superseded(
        [
            _row("MA-2252 2022 INCOME LIMITS", "a.pdf"),
            _row("MA-3321 2023 INCOME LIMITS", "b.pdf"),
        ]
    )


def test_groups_that_supersede_nothing():
    # One member; different tables; a typo the agency never corrected; two
    # documents for one year, which are alternates.
    assert not _superseded(
        [
            _row("MA-2180 HEALTH COVERAGE FOR WORKERS WITH DISABILITIES – 2019 HCWD Premiums", "hcwd.pdf"),
            _row("MA-2180 HEALTH COVERAGE FOR WORKERS WITH DISABILITIES", "ma-2180-3.pdf"),
            _row("MA-3321 2022 MAGI MEDICIAD/NCHC INCOME LIMITS", "ma-3321.pdf"),
            _row("MA-3321 2023 MAGI MEDICAID INCOME LIMITS", "ma-3321-1.pdf"),
            _row("MA-3321 2023 MAGI MEDICAID INCOME LIMITS WITH MXP", "ma-3321_mxp-1.pdf"),
            _row("2024 NON- MAGI MEDICAID INCOME/RESERVE LIMITS", "MA-3321-2.pdf"),
            _row("2024 NON-MAGI MEDICAID INCOME/RESERVE LIMITS", "MA-2252-1.pdf"),
        ]
    )


def test_only_a_document_the_loader_would_load_supersedes_another():
    """Registry facts are the first filter only.

    The loader excludes documents for more reasons than the registry records,
    so the mark itself waits for the newer edition to load: see the
    ``load_all`` tests below.
    """
    older = _row("2025 Basic Medicaid Eligibility Requirements", "Basic-Medicaid-Eligibility-6.pdf")
    newer = ("2026 Basic Medicaid Eligibility Requirements", "Basic-Medicaid-Eligibility-9.pdf")

    assert _superseded([older, _row(*newer)])
    assert not _superseded([older, _row(*newer, status="removed")])
    assert not _superseded([older, _row(*newer, local_path=None)])
    assert not _superseded([older, _row(*newer)], delisted_urls=frozenset({UPLOADS + newer[1]}))
    assert not _superseded([older, _row(*newer, source_type="bulletin")])
    assert not _superseded([older, _row("2027 Basic Medicaid Eligibility Requirements", "next.pdf")])


def _registry(tmp_path, entries):
    """A registry with listings; ``entries`` are (title, file name, tags)."""
    db_path = tmp_path / "crawler.db"
    index_url = "https://policies.ncdhhs.gov/index/"
    with sqlite3.connect(db_path) as db:
        db.executescript(
            """
            CREATE TABLE documents (id INTEGER PRIMARY KEY, source_url TEXT UNIQUE,
              discovered_from TEXT, source_type TEXT, title TEXT, local_path TEXT,
              status TEXT, file_hash TEXT);
            CREATE TABLE source_listings (source_url TEXT PRIMARY KEY, index_url TEXT,
              last_listed_at TEXT, last_listed_run_id INTEGER, tags TEXT);
            CREATE TABLE source_index_checks (index_url TEXT PRIMARY KEY, source_type TEXT,
              last_complete_at TEXT, last_complete_run_id INTEGER);
            INSERT INTO source_index_checks VALUES
              ('https://policies.ncdhhs.gov/index/', 'dhhs_policy', 'now', 2);
            """
        )
        for title, file_name, tags in entries:
            db.execute(
                "INSERT INTO documents"
                " (source_url, discovered_from, source_type, title, local_path, status)"
                " VALUES (?, ?, 'dhhs_policy', ?, ?, 'unchanged')",
                (UPLOADS + file_name, index_url, title, "dhhs-policies/" + file_name),
            )
            db.execute(
                "INSERT INTO source_listings VALUES (?, ?, 'then', 2, ?)",
                (UPLOADS + file_name, index_url, json.dumps(tags)),
            )
    return db_path


def _parsed(directory, file_name):
    json_path = directory / (file_name.rsplit(".", 1)[0] + ".json")
    json_path.write_text("{}")
    json_path.with_suffix(".meta.json").write_text(
        json.dumps(
            {
                "source_file": "dhhs-policies/" + file_name,
                "parse_status": "parsed",
                "answer_ready": True,
                "section_count": 1,
            }
        )
    )
    return json_path


@pytest.fixture
def loader(monkeypatch):
    writer = RecordingGraphWriter()
    monkeypatch.setattr("pipeline.graph.loader.graph_writer", writer)
    monkeypatch.setattr(
        "pipeline.graph.loader.build_sections_from_items",
        lambda doc_dict, document_id: [
            {"id": f"{document_id}:sec:1", "title": "Income limits", "content_text": "x"}
        ],
    )
    return writer


BASIC = [
    ("2024 Basic Medicaid Eligibility Requirements", "MEDICAID-ELIGIBILITY_9-9-2024.pdf", ["archived", "manual"]),
    ("2025 Basic Medicaid Eligibility Requirements", "Basic-Medicaid-Eligibility-6.pdf", ["manual"]),
    ("2026 Basic Medicaid Eligibility Requirements", "Basic-Medicaid-Eligibility-9.pdf", ["manual"]),
    ("MA-2240 TRANSFER OF ASSETS", "ma-2240.pdf", ["manual"]),
]


def _doc_id(file_name):
    return build_document_id("dhhs_policy", UPLOADS + file_name, "dhhs-policies/" + file_name)


OLDER, NEWER = "Basic-Medicaid-Eligibility-6.pdf", "Basic-Medicaid-Eligibility-9.pdf"


def _load_all(monkeypatch, tmp_path, entries, *, parsed=None):
    """Run ``load_all`` over ``entries``; ``parsed`` names the files that have an artifact."""
    parsed_dir = tmp_path / "dhhs-policies"
    parsed_dir.mkdir(exist_ok=True)
    for _, file_name, _ in entries:
        if parsed is None or file_name in parsed:
            _parsed(parsed_dir, file_name)
    monkeypatch.setattr("pipeline.graph.loader.CRAWLER_DB_PATH", _registry(tmp_path, entries))
    monkeypatch.setattr("pipeline.graph.loader.PARSED_DATA_DIR", tmp_path)
    monkeypatch.setattr("pipeline.graph.loader.SOURCE_TYPE_DIRS", {"dhhs_policy": "dhhs-policies"})
    monkeypatch.setattr("pipeline.graph.schema.ensure_schema", lambda: None)
    return load_all(source_type="dhhs_policy")


def _written(loader):
    """Each document as ``load_document`` wrote it, by file name."""
    return {
        bundle.document.source_url.removeprefix(UPLOADS): bundle.document
        for bundle in loader.received("upsert_document_bundle")
    }


def _pass(loader):
    """The one post-family call: (edges, document type, ids of the documents loaded)."""
    ((args, kwargs),) = loader.calls["supersede_editions"]
    return args[0], kwargs["document_type"], kwargs["loaded_ids"]


@pytest.mark.parametrize("file_name", [name for _, name, _ in BASIC])
def test_load_document_writes_every_edition_as_it_would_without_the_rule(
    monkeypatch, tmp_path, loader, file_name
):
    """Outside ``load_all`` nothing is marked: nobody knows yet what else loads."""
    monkeypatch.setattr("pipeline.graph.loader.CRAWLER_DB_PATH", _registry(tmp_path, BASIC))
    archived = file_name == "MEDICAID-ELIGIBILITY_9-9-2024.pdf"

    result = load_document(_parsed(tmp_path, file_name), "dhhs_policy")

    (bundle,) = loader.received("upsert_document_bundle")
    assert bundle.document.status == ("archived" if archived else "current")
    assert bundle.document.archived is archived
    assert bundle.document.retrieval_ready is True
    assert bundle.document.answer_ready is True
    assert bundle.document.variant_group is None
    # Only the untagged older edition is reported as a candidate.
    assert ("newer_edition" in result) is (file_name == OLDER)
    assert "supersede_editions" not in loader.calls


def test_load_all_marks_an_older_untagged_edition_once_the_newest_has_loaded(
    monkeypatch, tmp_path, loader, capsys
):
    stats = _load_all(monkeypatch, tmp_path, BASIC)

    assert (stats["loaded"], stats["superseded"]) == (4, 1)
    # Every document is written current and ready (or as the agency's tag made
    # it); the mark is the post-family statement alone.
    assert {name: (doc.status, doc.retrieval_ready) for name, doc in _written(loader).items()} == {
        NEWER: ("current", True),
        OLDER: ("current", True),
        "MEDICAID-ELIGIBILITY_9-9-2024.pdf": ("archived", True),
        "ma-2240.pdf": ("current", True),
    }
    (edge,), document_type, loaded_ids = _pass(loader)
    # The agency-tagged 2024 edition is no candidate: one edge, not two.
    assert (edge.source_id, edge.target_id) == (_doc_id(OLDER), _doc_id(NEWER))
    assert edge.effective is None
    assert "2026 edition" in edge.reason
    assert document_type == "dhhs_policy"
    assert loaded_ids == sorted(_doc_id(name) for _, name, _ in BASIC)
    log = " ".join(capsys.readouterr().out.split())
    assert "SUPERSEDED 2025 edition of 'basic medicaid eligibility requirements'" in log
    assert "by the 2026 edition: 2026 Basic Medicaid Eligibility Requirements" in log
    assert "NOT SUPERSEDED" not in log


def test_an_archived_newest_edition_still_supersedes_and_nothing_is_promoted(
    monkeypatch, tmp_path, loader
):
    """The older edition is no more current because the agency retired its successor."""
    entries = [
        ("2025 Basic Medicaid Eligibility Requirements", OLDER, ["manual"]),
        ("2026 Basic Medicaid Eligibility Requirements", NEWER, ["archived"]),
    ]

    stats = _load_all(monkeypatch, tmp_path, entries)

    assert stats["superseded"] == 1
    newest = _written(loader)[NEWER]
    assert (newest.status, newest.archived) == ("archived", True)
    (edge,), _, _ = _pass(loader)
    assert (edge.source_id, edge.target_id) == (_doc_id(OLDER), _doc_id(NEWER))


def _no_parsed_artifact(monkeypatch, tmp_path):
    return {"parsed": {OLDER}}


def _not_answer_ready(monkeypatch, tmp_path):
    parsed_dir = tmp_path / "dhhs-policies"
    parsed_dir.mkdir()
    meta_path = _parsed(parsed_dir, NEWER).with_suffix(".meta.json")
    meta_path.write_text(json.dumps({**json.loads(meta_path.read_text()), "answer_ready": False}))
    return {"parsed": {OLDER}}


def _load_document_raises(monkeypatch, tmp_path):
    def build(doc_dict, document_id):
        if document_id == _doc_id(NEWER):
            raise ValueError("unreadable table")
        return [{"id": f"{document_id}:sec:1", "title": "Income limits", "content_text": "x"}]

    monkeypatch.setattr("pipeline.graph.loader.build_sections_from_items", build)
    return {}


@pytest.mark.parametrize(
    ("exclude_newer", "loaded", "skipped", "errors"),
    [
        (_no_parsed_artifact, 1, 0, 0),
        (_not_answer_ready, 1, 1, 0),
        (_load_document_raises, 1, 0, 1),
    ],
)
def test_an_older_edition_stays_current_when_the_newer_edition_does_not_load(
    monkeypatch, tmp_path, loader, capsys, exclude_newer, loaded, skipped, errors
):
    """The year-rollover case: a new table that fails to load must not hide last year's."""
    entries = [entry for entry in BASIC if entry[1] in (OLDER, NEWER)]

    stats = _load_all(monkeypatch, tmp_path, entries, **exclude_newer(monkeypatch, tmp_path))

    assert (stats["loaded"], stats["skipped"], stats["errors"]) == (loaded, skipped, errors)
    assert stats["superseded"] == 0
    (older,) = loader.received("upsert_document_bundle")
    assert older.document.id == _doc_id(OLDER)
    assert (older.document.status, older.document.retrieval_ready) == ("current", True)
    edges, _, loaded_ids = _pass(loader)
    assert edges == []
    assert loaded_ids == [_doc_id(OLDER)]
    assert "merge_supersessions" not in loader.calls
    log = " ".join(capsys.readouterr().out.split())
    assert "NOT SUPERSEDED 2025 edition of 'basic medicaid eligibility requirements' stays current" in log
    assert _doc_id(OLDER) in log
    assert "the 2026 edition did not load: 2026 Basic Medicaid Eligibility Requirements" in log
    assert UPLOADS + NEWER in log
    assert "SUPERSEDED 2025 edition of 'basic medicaid eligibility requirements' by" not in log


def test_a_reload_clears_the_edition_edges_of_every_document_it_rewrote(
    monkeypatch, tmp_path, loader
):
    """No reset: an edition superseded by an earlier load whose superseder has since
    been withdrawn is rewritten current, and its old edge is removed even though
    this load has no edition to mark."""
    withdrawn = [("2025 Basic Medicaid Eligibility Requirements", OLDER, ["manual"])]

    stats = _load_all(monkeypatch, tmp_path, withdrawn)

    assert stats["superseded"] == 0
    (older,) = loader.received("upsert_document_bundle")
    assert (older.document.status, older.document.retrieval_ready) == ("current", True)
    assert _pass(loader) == ([], "dhhs_policy", [_doc_id(OLDER)])


def test_the_edition_pass_runs_for_the_edition_family_alone(monkeypatch, tmp_path, loader):
    (tmp_path / "bulletins").mkdir()
    monkeypatch.setattr("pipeline.graph.loader.PARSED_DATA_DIR", tmp_path)
    monkeypatch.setattr("pipeline.graph.loader.SOURCE_TYPE_DIRS", {"bulletin": "bulletins"})
    monkeypatch.setattr("pipeline.graph.schema.ensure_schema", lambda: None)

    assert load_all()["superseded"] == 0
    assert "supersede_editions" not in loader.calls


def _session_marking(marked):
    return RecordingSession(
        [(lambda query, params: query == queries.MARK_SUPERSEDED_EDITIONS_BATCH, [{"marked": marked}])]
    )


def test_supersede_editions_clears_old_edges_then_marks_and_links_in_one_statement():
    session = _session_marking(1)
    edges = [
        SupersessionEdge(source_id="doc:older", target_id="doc:newer", effective=None, reason="r"),
        SupersessionEdge(source_id="doc:other", target_id="doc:absent", effective=None, reason="r"),
    ]

    marked = CorpusGraphWriter(session_factory(session)).supersede_editions(
        edges, document_type="dhhs_policy", loaded_ids=["doc:newer", "doc:older", "doc:other"]
    )

    # The count is what the graph matched, not the number of edges sent.
    assert marked == 1
    assert session.commits == 1
    (delete, delete_params), (mark, mark_params) = session.calls
    assert delete == queries.DELETE_EDITION_SUPERSEDED_BY_BATCH
    assert delete_params == {
        "ids": ["doc:newer", "doc:older", "doc:other"],
        "document_type": "dhhs_policy",
    }
    assert mark == queries.MARK_SUPERSEDED_EDITIONS_BATCH
    assert [row["source_id"] for row in mark_params["edges"]] == ["doc:older", "doc:other"]


def test_supersede_editions_with_no_edges_still_clears_old_edges():
    session = _session_marking(5)

    marked = CorpusGraphWriter(session_factory(session)).supersede_editions(
        [], document_type="dhhs_policy", loaded_ids=["doc:older"]
    )

    assert marked == 0
    assert session.queries == [queries.DELETE_EDITION_SUPERSEDED_BY_BATCH]


def test_edition_statements_cannot_reach_another_family_and_mark_only_beside_the_newer_node():
    delete = " ".join(queries.DELETE_EDITION_SUPERSEDED_BY_BATCH.split())
    # Both ends carry the edition family's type, and the source is a document
    # this load wrote: a federal stub's edge matches neither.
    assert (
        "MATCH (old:Document {id: document_id, document_type: $document_type}) "
        "-[r:SUPERSEDED_BY]->(:Document {document_type: $document_type}) DELETE r"
    ) in delete
    mark = queries.MARK_SUPERSEDED_EDITIONS_BATCH
    # The status is set after both nodes have matched, never before.
    assert mark.index("MATCH (new:Document {id: edge.target_id})") < mark.index("SET old.status")
    assert "OPTIONAL" not in mark
