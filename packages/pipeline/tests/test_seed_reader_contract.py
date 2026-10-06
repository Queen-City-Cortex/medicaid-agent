"""The reader-contract seed drives the real loader; here against the fakes."""

import pytest

from tests.fakes import RecordingGraphWriter, RecordingSession, session_factory
from tests.support import seed_reader_contract as seed


@pytest.fixture
def graph(monkeypatch, tmp_path):
    writer = RecordingGraphWriter()
    session = RecordingSession([
        (lambda query, params: "DETACH DELETE" in query, [{"count": 3}]),
    ])
    monkeypatch.setattr("pipeline.graph.loader.graph_writer", writer)
    monkeypatch.setattr("pipeline.graph.corpus_writer.graph_writer", writer)
    monkeypatch.setattr("pipeline.graph.loader.CRAWLER_DB_PATH", tmp_path / "absent/crawler.db")
    monkeypatch.setattr("pipeline.graph.schema.get_session", session_factory(session))
    monkeypatch.setattr("pipeline.graph.connection.get_session", session_factory(session))
    return writer, session


def test_seed_loads_the_fixture_under_the_test_identity(graph):
    writer, session = graph

    printed = seed.seed()

    (bundle,) = writer.received("upsert_document_bundle")
    document = bundle.document
    assert document.id == seed.DOCUMENT_ID == printed["document_id"]
    assert document.source_url == seed.SOURCE_URL == printed["source_url"]
    assert document.document_type == "clinical_policy" == printed["document_type"]
    assert document.policy_number == seed.POLICY_NUMBER == printed["policy_number"]
    assert document.title == seed.TITLE == printed["title"]
    assert (document.authority_tier, document.answer_role) == ("authoritative", "coverage")
    assert (printed["authority_tier"], printed["answer_role"]) == ("authoritative", "coverage")
    assert (document.status, document.answer_ready, document.archived) == ("current", True, False)
    assert printed["section_count"] == len(bundle.sections) == document.section_count > 1
    assert all(section.id.startswith(f"sec:{seed.DOCUMENT_ID}:") for section in bundle.sections)
    assert any("ambiguous genitalia" in section.content_text.lower() for section in bundle.sections)
    assert any(section.parent_id for section in bundle.sections)
    # The schema every load runs, then the index wait, before the write.
    assert any(query.startswith("CREATE FULLTEXT INDEX section_fulltext") for query in session.queries)
    assert session.queries[-1] == "CALL db.awaitIndexes()"


def test_cleanup_deletes_through_the_writer_and_sweeps_only_the_test_identity(graph):
    writer, session = graph

    assert seed.cleanup() == {"document_id": seed.DOCUMENT_ID, "swept": 3}

    assert writer.received("delete_document") == [seed.DOCUMENT_ID]
    (sweep, params), = session.calls
    assert "n.id = $id OR n.id STARTS WITH $section_prefix" in sweep
    assert params == {"id": seed.DOCUMENT_ID, "section_prefix": f"sec:{seed.DOCUMENT_ID}:"}


def test_seed_refuses_without_the_test_identity_or_with_a_registry(graph, monkeypatch, tmp_path):
    monkeypatch.setattr(seed, "DOCUMENT_ID", "doc:clinical_policy:0123456789abcdef")
    with pytest.raises(SystemExit, match="lacks the test prefix"):
        seed.seed()
    monkeypatch.setattr(seed, "DOCUMENT_ID", f"{seed.ID_PREFIX}doc:1a-14")

    registry = tmp_path / "crawler/crawler.db"
    registry.parent.mkdir()
    registry.write_bytes(b"")
    monkeypatch.setattr("pipeline.graph.loader.CRAWLER_DB_PATH", registry)
    with pytest.raises(SystemExit, match="must not read one"):
        seed.cleanup()
    assert graph[0].calls == {}
