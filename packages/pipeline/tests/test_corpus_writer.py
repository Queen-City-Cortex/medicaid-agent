"""Tests for the graph write boundary."""

from contextlib import contextmanager

from pipeline.graph import queries
from pipeline.graph.corpus_types import (
    AmendmentEdge,
    ConceptLink,
    DocumentBundle,
    DocumentNode,
    ReferenceEdge,
    SectionNode,
)
from pipeline.graph.corpus_writer import CorpusGraphWriter


class FakeSession:
    def __init__(self):
        self.calls: list[tuple[str, dict]] = []

    def run(self, query: str, params: dict | None = None):
        self.calls.append((query, params or {}))
        return []


def test_upsert_document_bundle_writes_document_and_section_structure():
    session = FakeSession()

    @contextmanager
    def fake_session_factory():
        yield session

    writer = CorpusGraphWriter(fake_session_factory)
    bundle = DocumentBundle(
        document=DocumentNode(
            id="doc:test",
            title="Policy 8C",
            document_type="dhhs_policy",
            policy_number="8C",
            category="eligibility",
            status="current",
            source_url="https://example.com/8C",
            local_path="/tmp/doc.json",
            pdf_path="/tmp/doc.pdf",
            page_count=5,
            section_count=2,
            effective_date="2025-01-01",
        ),
        sections=[
            SectionNode(
                id="sec:1",
                document_id="doc:test",
                section_number="1",
                title="Intro",
                level=1,
                content_text="Intro text",
                content_length=10,
                has_tables=False,
                has_definitions=False,
            ),
            SectionNode(
                id="sec:2",
                document_id="doc:test",
                section_number="1.1",
                title="Child",
                level=2,
                content_text="Child text",
                content_length=10,
                has_tables=False,
                has_definitions=False,
                parent_id="sec:1",
                prev_sibling_id="sec:1",
            ),
        ],
    )

    writer.upsert_document_bundle(bundle)

    assert [query for query, _ in session.calls] == [
        queries.MERGE_DOCUMENT,
        queries.MERGE_SECTIONS_BATCH,
        queries.MERGE_HAS_SECTION_BATCH,
        queries.MERGE_PARENT_OF_BATCH,
        queries.MERGE_NEXT_SIBLING_BATCH,
    ]
    assert session.calls[0][1]["id"] == "doc:test"
    assert session.calls[1][1]["sections"][0]["id"] == "sec:1"
    assert session.calls[2][1] == {"doc_id": "doc:test", "section_ids": ["sec:1", "sec:2"]}


def test_merge_reference_edges_batches_by_edge_type():
    session = FakeSession()

    @contextmanager
    def fake_session_factory():
        yield session

    writer = CorpusGraphWriter(fake_session_factory)

    count = writer.merge_reference_edges([
        ReferenceEdge(
            source_id="sec:1",
            target_id="sec:2",
            edge_type="REFERENCES",
            reference_text="see section 2",
            reference_type="section",
            extraction_method="regex",
        ),
        ReferenceEdge(
            source_id="sec:1",
            target_id="doc:8c",
            edge_type="REFERENCES_DOCUMENT",
            reference_text="see policy 8C",
            reference_type=None,
            extraction_method="regex",
        ),
    ])

    assert count == 2
    assert [query for query, _ in session.calls] == [
        queries.MERGE_REFERENCES_BATCH,
        queries.MERGE_REFERENCES_DOCUMENT_BATCH,
    ]


def test_merge_amendments_and_concept_links_write_through_boundary():
    session = FakeSession()

    @contextmanager
    def fake_session_factory():
        yield session

    writer = CorpusGraphWriter(fake_session_factory)

    amendment_count = writer.merge_amendments(
        [AmendmentEdge(source_id="doc:cn", target_id="doc:8c", change_description="Updated limits")],
        ["doc:cn"],
    )
    concept_count = writer.merge_concept_links(
        [ConceptLink(section_id="sec:1", concept_id="concept:epsdt", relationship_type="DEFINES")]
    )

    assert amendment_count == 1
    assert concept_count == 1
    assert session.calls[0][0] == queries.MERGE_AMENDS_BATCH
    assert session.calls[1][0] == queries.SET_DOCUMENT_STATUS_BATCH
    assert "MERGE (s)-[:DEFINES]->(c)" in session.calls[2][0]
