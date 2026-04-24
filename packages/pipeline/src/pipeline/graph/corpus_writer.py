"""Single write-side boundary for corpus graph mutations."""

from contextlib import AbstractContextManager
from typing import Protocol

from neo4j import Session

from pipeline.config import GRAPH_BATCH_SIZE
from pipeline.graph.connection import get_session
from pipeline.graph import queries
from pipeline.graph.corpus_types import (
    AmendmentEdge,
    ConceptLink,
    DocumentBundle,
    ReferenceEdge,
)
from pipeline.utils.batching import chunked


class SessionFactory(Protocol):
    def __call__(self) -> AbstractContextManager[Session]: ...


class CorpusGraphWriter:
    def __init__(self, session_factory: SessionFactory = get_session):
        self._session_factory = session_factory

    def upsert_document_bundle(self, bundle: DocumentBundle) -> None:
        document = bundle.document
        with self._session_factory() as session:
            session.run(queries.MERGE_DOCUMENT, {
                "id": document.id,
                "title": document.title,
                "document_type": document.document_type,
                "policy_number": document.policy_number,
                "category": document.category,
                "status": document.status,
                "source_url": document.source_url,
                "local_path": document.local_path,
                "pdf_path": document.pdf_path,
                "page_count": document.page_count,
                "section_count": document.section_count,
                "effective_date": document.effective_date,
                "authority_tier": document.authority_tier,
                "answer_role": document.answer_role,
                "source_format": document.source_format,
                "answer_ready": document.answer_ready,
                "corpus_bucket": document.corpus_bucket,
                "variant_group": document.variant_group,
                "variant_date": document.variant_date,
                "retrieval_ready": document.retrieval_ready,
            })
            self._write_sections(session, bundle.sections, document.id)

    def merge_reference_edges(self, edges: list[ReferenceEdge]) -> int:
        if not edges:
            return 0

        section_edges = [
            {
                "source_id": edge.source_id,
                "target_id": edge.target_id,
                "reference_text": edge.reference_text,
                "reference_type": edge.reference_type,
                "extraction_method": edge.extraction_method,
            }
            for edge in edges
            if edge.edge_type == "REFERENCES"
        ]
        document_edges = [
            {
                "source_id": edge.source_id,
                "target_id": edge.target_id,
                "reference_text": edge.reference_text,
                "extraction_method": edge.extraction_method,
            }
            for edge in edges
            if edge.edge_type == "REFERENCES_DOCUMENT"
        ]

        with self._session_factory() as session:
            for batch in chunked(section_edges, GRAPH_BATCH_SIZE):
                session.run(queries.MERGE_REFERENCES_BATCH, {"edges": batch})
            for batch in chunked(document_edges, GRAPH_BATCH_SIZE):
                session.run(queries.MERGE_REFERENCES_DOCUMENT_BATCH, {"edges": batch})

        return len(edges)

    def merge_amendments(self, edges: list[AmendmentEdge], amendment_doc_ids: list[str]) -> int:
        with self._session_factory() as session:
            pairs = [
                {
                    "source_id": edge.source_id,
                    "target_id": edge.target_id,
                    "change_description": edge.change_description,
                }
                for edge in edges
            ]
            for batch in chunked(pairs, GRAPH_BATCH_SIZE):
                session.run(queries.MERGE_AMENDS_BATCH, {"pairs": batch})

            self._mark_document_statuses(session, amendment_doc_ids, "amendment")

        return len(edges)

    def merge_concept_links(self, links: list[ConceptLink]) -> int:
        if not links:
            return 0

        with self._session_factory() as session:
            for relationship_type in ("COVERS", "DEFINES", "RESTRICTS"):
                rel_edges = [
                    {"section_id": link.section_id, "concept_id": link.concept_id}
                    for link in links
                    if link.relationship_type == relationship_type
                ]
                for batch in chunked(rel_edges, GRAPH_BATCH_SIZE):
                    session.run(
                        f"""
                        UNWIND $edges AS edge
                        MATCH (s:Section {{id: edge.section_id}})
                        MATCH (c:PolicyConcept {{id: edge.concept_id}})
                        MERGE (s)-[:{relationship_type}]->(c)
                        """,
                        {"edges": batch},
                    )

        return len(links)

    def mark_document_status(self, document_ids: list[str], status: str) -> None:
        with self._session_factory() as session:
            self._mark_document_statuses(session, document_ids, status)

    def _write_sections(self, session: Session, sections: list, doc_id: str) -> None:
        section_rows = [
            {
                "id": section.id,
                "document_id": doc_id,
                "section_number": section.section_number,
                "title": section.title,
                "level": section.level,
                "content_text": section.content_text,
                "content_length": section.content_length,
                "has_tables": section.has_tables,
                "has_definitions": section.has_definitions,
                "federal_register_cite": section.federal_register_cite,
                "last_revised": section.last_revised,
            }
            for section in sections
        ]
        section_ids = [section.id for section in sections]
        parent_pairs = [
            {"parent_id": section.parent_id, "child_id": section.id}
            for section in sections
            if section.parent_id
        ]
        sibling_pairs = [
            {"prev_id": section.prev_sibling_id, "next_id": section.id}
            for section in sections
            if section.prev_sibling_id
        ]

        self._cleanup_document_sections(session, doc_id, section_ids)

        for batch in chunked(section_rows, GRAPH_BATCH_SIZE):
            session.run(queries.MERGE_SECTIONS_BATCH, {"sections": batch})

        for batch in chunked(section_ids, GRAPH_BATCH_SIZE):
            session.run(queries.MERGE_HAS_SECTION_BATCH, {"doc_id": doc_id, "section_ids": batch})

        for batch in chunked(parent_pairs, GRAPH_BATCH_SIZE):
            session.run(queries.MERGE_PARENT_OF_BATCH, {"pairs": batch})

        for batch in chunked(sibling_pairs, GRAPH_BATCH_SIZE):
            session.run(queries.MERGE_NEXT_SIBLING_BATCH, {"pairs": batch})

    def _cleanup_document_sections(self, session: Session, doc_id: str, section_ids: list[str]) -> None:
        session.run(
            queries.DELETE_STALE_DOCUMENT_SECTIONS,
            {"doc_id": doc_id, "section_ids": section_ids},
        )
        session.run(queries.CLEAR_DOCUMENT_SECTION_STRUCTURE, {"doc_id": doc_id})

        for batch in chunked(section_ids, GRAPH_BATCH_SIZE):
            session.run(
                queries.CLEAR_SECTION_CHUNKS_AND_EMBEDDINGS_BATCH,
                {"section_ids": batch},
            )

    def _mark_document_statuses(self, session: Session, document_ids: list[str], status: str) -> None:
        if not document_ids:
            return

        for batch in chunked(sorted(set(document_ids)), GRAPH_BATCH_SIZE):
            session.run(
                queries.SET_DOCUMENT_STATUS_BATCH,
                {"doc_ids": batch, "status": status},
            )


graph_writer = CorpusGraphWriter()
