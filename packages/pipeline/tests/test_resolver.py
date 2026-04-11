"""Tests for reference resolution and batched write planning."""

import json
from contextlib import contextmanager

from pipeline.references.extractor import ReferenceMatch
from pipeline.references import extractor, resolver


class FakeResult(list):
    def single(self):
        return self[0] if self else None


class FakeSession:
    def __init__(self, handlers):
        self.handlers = handlers
        self.calls: list[tuple[str, dict]] = []

    def run(self, query: str, params: dict | None = None):
        params = params or {}
        self.calls.append((query, params))
        for match, result in self.handlers:
            if match(query, params):
                return FakeResult(result)
        return FakeResult()


def test_resolve_reference_uses_normalized_policy_number_fallback(monkeypatch):
    session = FakeSession([
        (lambda query, params: "MATCH (d:Document {policy_number: $pn})" in query, []),
        (
            lambda query, params: "REPLACE(d.policy_number, '-', '') = $normalized" in query,
            [{"d.id": "doc:clinical:1H"}],
        ),
    ])

    @contextmanager
    def fake_get_session():
        yield session

    monkeypatch.setattr(resolver, "get_session", fake_get_session)

    result = resolver.resolve_reference(
        ReferenceMatch(
            ref_type="cross_document",
            target_id="1-H",
            matched_text="Clinical Coverage Policy 1-H",
            start=0,
            end=27,
        ),
        source_section_id="sec:source",
        source_document_id="doc:source",
    )

    assert result == {
        "resolved": True,
        "target_node_id": "doc:clinical:1H",
        "target_type": "document",
        "edge_type": "REFERENCES_DOCUMENT",
    }
    assert len(session.calls) == 2


def test_resolve_reference_resolves_spa_documents(monkeypatch):
    session = FakeSession([
        (
            lambda query, params: "d.document_type = 'state_plan_amendment'" in query,
            [{"d.id": "doc:spa:24-0001"}],
        ),
    ])

    @contextmanager
    def fake_get_session():
        yield session

    monkeypatch.setattr(resolver, "get_session", fake_get_session)

    result = resolver.resolve_reference(
        ReferenceMatch(
            ref_type="spa",
            target_id="24-0001",
            matched_text="SPA 24-0001",
            start=0,
            end=11,
        ),
        source_section_id="sec:source",
        source_document_id="doc:source",
    )

    assert result == {
        "resolved": True,
        "target_node_id": "doc:spa:24-0001",
        "target_type": "document",
        "edge_type": "REFERENCES_DOCUMENT",
    }


def test_resolve_reference_uses_attachment_title_fallback(monkeypatch):
    session = FakeSession([
        (
            lambda query, params: "section_number: $sn" in query and params.get("sn") == "Attachment I",
            [],
        ),
        (
            lambda query, params: "CONTAINS toLower($needle)" in query and params.get("needle") == "Attachment I",
            [{"s.id": "sec:attachment-i"}],
        ),
    ])

    @contextmanager
    def fake_get_session():
        yield session

    monkeypatch.setattr(resolver, "get_session", fake_get_session)

    result = resolver.resolve_reference(
        ReferenceMatch(
            ref_type="attachment",
            target_id="I",
            matched_text="Attachment I",
            start=0,
            end=12,
        ),
        source_section_id="sec:source",
        source_document_id="doc:source",
    )

    assert result == {
        "resolved": True,
        "target_node_id": "sec:attachment-i",
        "target_type": "section",
        "edge_type": "REFERENCES",
    }


def test_extract_and_resolve_all_batches_edges_through_graph_writer(monkeypatch, tmp_path):
    session = FakeSession([
        (
            lambda query, params: "MATCH (s:Section) RETURN s.id, s.document_id, s.content_text" in query,
            [{"s.id": "sec:1", "s.document_id": "doc:1", "s.content_text": "Policy 8C"}],
        ),
    ])

    @contextmanager
    def fake_get_session():
        yield session

    class FakeWriter:
        def __init__(self):
            self.edges = None

        def merge_reference_edges(self, edges):
            self.edges = list(edges)
            return len(edges)

    fake_writer = FakeWriter()
    monkeypatch.setattr(resolver, "get_session", fake_get_session)
    monkeypatch.setattr(resolver, "graph_writer", fake_writer)
    monkeypatch.setattr(extractor, "extract_references", lambda text: [
        ReferenceMatch(
            ref_type="cross_document",
            target_id="8C",
            matched_text="Policy 8C",
            start=0,
            end=9,
        )
    ])
    monkeypatch.setattr(
        resolver,
        "resolve_reference",
        lambda ref, source_section_id, source_document_id: {
            "resolved": True,
            "target_node_id": "doc:8c",
            "target_type": "document",
            "edge_type": "REFERENCES_DOCUMENT",
        },
    )
    monkeypatch.setattr(resolver, "PARSED_DATA_DIR", tmp_path / "parsed")

    stats = resolver.extract_and_resolve_all()

    assert stats == {"extracted": 1, "resolved": 1, "unresolved": 0}
    assert len(fake_writer.edges) == 1
    assert fake_writer.edges[0].target_id == "doc:8c"
    unresolved_path = tmp_path / "unresolved-references.json"
    assert json.loads(unresolved_path.read_text()) == []


def test_extract_and_resolve_all_uses_cross_document_context_for_section_refs(monkeypatch, tmp_path):
    session = FakeSession([
        (
            lambda query, params: "MATCH (s:Section) RETURN s.id, s.document_id, s.content_text" in query,
            [{
                "s.id": "sec:source",
                "s.document_id": "doc:source",
                "s.content_text": "See Clinical Coverage Policy 3K-2, Section 5.1 for details.",
            }],
        ),
        (
            lambda query, params: "MATCH (d:Document {policy_number: $pn})" in query and params.get("pn") == "3K-2",
            [{"d.id": "doc:clinical:3K-2"}],
        ),
        (
            lambda query, params: "section_number: $sn" in query
            and params.get("doc_id") == "doc:clinical:3K-2"
            and params.get("sn") == "5.1",
            [{"s.id": "sec:clinical:3K-2:5.1"}],
        ),
    ])

    @contextmanager
    def fake_get_session():
        yield session

    class FakeWriter:
        def __init__(self):
            self.edges = None

        def merge_reference_edges(self, edges):
            self.edges = list(edges)
            return len(edges)

    fake_writer = FakeWriter()
    monkeypatch.setattr(resolver, "get_session", fake_get_session)
    monkeypatch.setattr(resolver, "graph_writer", fake_writer)
    monkeypatch.setattr(resolver, "PARSED_DATA_DIR", tmp_path / "parsed")

    stats = resolver.extract_and_resolve_all()

    assert stats == {"extracted": 2, "resolved": 2, "unresolved": 0}
    assert [(edge.edge_type, edge.target_id) for edge in fake_writer.edges] == [
        ("REFERENCES_DOCUMENT", "doc:clinical:3K-2"),
        ("REFERENCES", "sec:clinical:3K-2:5.1"),
    ]
