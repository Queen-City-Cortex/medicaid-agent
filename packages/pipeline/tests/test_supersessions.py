"""Supersession provenance: loading, graph writes, and stub documents.

The 45 CFR 74→75→2 CFR 200 chain narrative lived in cfr-supersessions.json but
was discarded at load time — the agent could resolve old citations to the
current part yet could never explain the history. These tests pin that the
provenance survives loading, lands on a SUPERSEDED_BY edge, and that the stub
documents for superseded parts can never leak into retrieval.
"""

from contextlib import contextmanager
from unittest.mock import patch

from pipeline.graph import queries
from pipeline.graph.corpus_types import SupersessionEdge
from pipeline.graph.corpus_writer import CorpusGraphWriter
from pipeline.references.supersessions import load_cfr_supersessions


class FakeSession:
    def __init__(self):
        self.calls: list[tuple[str, dict]] = []

    def run(self, query: str, params: dict | None = None):
        self.calls.append((query, params or {}))
        return []


def _writer_for(session: FakeSession) -> CorpusGraphWriter:
    @contextmanager
    def fake_session_factory():
        yield session

    return CorpusGraphWriter(fake_session_factory)


def test_load_cfr_supersessions_includes_provenance():
    supersessions = load_cfr_supersessions()
    entry = supersessions.get((45, 74))
    assert entry is not None
    assert (entry.new_title, entry.new_part) == (2, 200)
    # Presence, not exact prose — the narrative is data, not code.
    assert entry.effective
    assert entry.reason and "superseded" in entry.reason.lower()

    entry_75 = supersessions.get((45, 75))
    assert entry_75 is not None
    assert (entry_75.new_title, entry_75.new_part) == (2, 200)


def test_merge_supersessions_runs_batch_merge_with_provenance():
    session = FakeSession()
    writer = _writer_for(session)

    count = writer.merge_supersessions([
        SupersessionEdge(
            source_id="doc:federal_regulation:45-CFR-74",
            target_id="doc:federal_regulation:2-CFR-200",
            effective="2025-10-01",
            reason="Superseded by the OMB Uniform Guidance.",
        ),
    ])

    assert count == 1
    assert len(session.calls) == 1
    query, params = session.calls[0]
    assert query == queries.MERGE_SUPERSEDED_BY_BATCH
    assert params["edges"][0]["source_id"] == "doc:federal_regulation:45-CFR-74"
    assert params["edges"][0]["target_id"] == "doc:federal_regulation:2-CFR-200"
    assert params["edges"][0]["effective"] == "2025-10-01"
    assert params["edges"][0]["reason"] == "Superseded by the OMB Uniform Guidance."


def test_merge_supersessions_no_edges_is_a_noop():
    session = FakeSession()
    writer = _writer_for(session)
    assert writer.merge_supersessions([]) == 0
    assert session.calls == []


def test_stub_documents_are_superseded_and_not_retrievable():
    from pipeline.federal import loader as federal_loader

    bundles = []
    edges = []

    class FakeWriter:
        def upsert_document_bundle(self, bundle):
            bundles.append(bundle)

        def merge_supersessions(self, batch):
            edges.extend(batch)
            return len(batch)

    with patch.object(federal_loader, "graph_writer", FakeWriter()):
        stats = federal_loader.load_cfr_supersession_stubs()

    assert stats["stubs"] == len(bundles) >= 2
    for bundle in bundles:
        document = bundle.document
        # The stub must never enter search, embedding, or answer evidence.
        assert document.status == "superseded"
        assert document.answer_ready is False
        assert document.retrieval_ready is False
        assert bundle.sections == []
        assert document.policy_number in {"45-CFR-74", "45-CFR-75"}

    targets = {edge.target_id for edge in edges}
    assert targets == {"doc:federal_regulation:2-CFR-200"}
    assert all(edge.reason for edge in edges)
    assert all(edge.effective for edge in edges)
