"""Single write-side boundary for corpus graph mutations.

Every public method runs its statements inside a single managed write
transaction via ``session.execute_write``. Two properties matter here:

1. Atomicity. A Neo4j session in auto-commit mode commits each
   ``session.run`` separately, so a multi-statement mutation (e.g.
   delete-then-rewrite a document's sections) could be interrupted between
   statements and leave the graph structurally incomplete. A managed
   transaction commits only if the whole unit of work succeeds and rolls
   back otherwise.

2. Resilience. ``execute_write`` re-runs the unit of work on transient
   failures (leader switches, deadlocks, lost connections). Every write
   here is MERGE-based with deterministic, doc-scoped cleanup, so the work
   functions are idempotent and safe to retry — re-running a rolled-back
   attempt produces the same end state.
"""

import logging
from contextlib import AbstractContextManager
from typing import Callable, Protocol

from neo4j import ManagedTransaction, Session

from pipeline.config import GRAPH_BATCH_SIZE
from pipeline.graph.connection import get_session
from pipeline.graph import queries
from pipeline.graph.corpus_types import (
    AmendmentEdge,
    ConceptLink,
    DocumentBundle,
    ReferenceEdge,
    SupersessionEdge,
)
from pipeline.utils.batching import chunked

logger = logging.getLogger(__name__)


class SessionFactory(Protocol):
    def __call__(self) -> AbstractContextManager[Session]: ...


class CorpusGraphWriter:
    def __init__(self, session_factory: SessionFactory = get_session):
        self._session_factory = session_factory

    def _execute_write(self, session: Session, work: Callable, op: str, *args) -> None:
        """Run a managed write, logging (and re-raising) on final failure.

        ``execute_write`` already retries transient errors; this wraps the
        ultimate outcome so a write that exhausts retries is attributable to its
        operation instead of failing silently (the affected document's sections
        or edges simply never land in the graph).
        """
        try:
            session.execute_write(work, *args)
        except Exception:
            logger.error("neo4j write failed: op=%s", op, exc_info=True)
            raise

    def upsert_document_bundle(self, bundle: DocumentBundle) -> None:
        document = bundle.document

        def _work(tx: ManagedTransaction) -> None:
            tx.run(queries.MERGE_DOCUMENT, {
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
                "source_checked_at": document.source_checked_at,
                "source_changed_at": document.source_changed_at,
            })
            self._write_sections(tx, bundle.sections, document.id)

        with self._session_factory() as session:
            self._execute_write(session, _work, "upsert_document_bundle")

    def delete_document(self, document_id: str) -> None:
        """Remove a source document and all retrievable descendants."""

        def _work(tx: ManagedTransaction) -> None:
            tx.run(queries.DELETE_DOCUMENT, {"doc_id": document_id})

        with self._session_factory() as session:
            self._execute_write(session, _work, "delete_document")

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

        def _work(tx: ManagedTransaction) -> None:
            for batch in chunked(section_edges, GRAPH_BATCH_SIZE):
                tx.run(queries.MERGE_REFERENCES_BATCH, {"edges": batch})
            for batch in chunked(document_edges, GRAPH_BATCH_SIZE):
                tx.run(queries.MERGE_REFERENCES_DOCUMENT_BATCH, {"edges": batch})

        with self._session_factory() as session:
            self._execute_write(session, _work, "merge_reference_edges")

        return len(edges)

    def merge_amendments(self, edges: list[AmendmentEdge], amendment_doc_ids: list[str]) -> int:
        pairs = [
            {
                "source_id": edge.source_id,
                "target_id": edge.target_id,
                "change_description": edge.change_description,
            }
            for edge in edges
        ]

        def _work(tx: ManagedTransaction) -> None:
            for batch in chunked(pairs, GRAPH_BATCH_SIZE):
                tx.run(queries.MERGE_AMENDS_BATCH, {"pairs": batch})
            self._mark_document_statuses(tx, amendment_doc_ids, "amendment")

        with self._session_factory() as session:
            self._execute_write(session, _work, "merge_amendments")

        return len(edges)

    def merge_supersessions(self, edges: list[SupersessionEdge]) -> int:
        if not edges:
            return 0

        payload = [
            {
                "source_id": edge.source_id,
                "target_id": edge.target_id,
                "effective": edge.effective,
                "reason": edge.reason,
            }
            for edge in edges
        ]

        def _work(tx: ManagedTransaction) -> None:
            for batch in chunked(payload, GRAPH_BATCH_SIZE):
                tx.run(queries.MERGE_SUPERSEDED_BY_BATCH, {"edges": batch})

        with self._session_factory() as session:
            self._execute_write(session, _work, "merge_supersessions")

        return len(edges)

    def merge_concept_links(self, links: list[ConceptLink]) -> int:
        if not links:
            return 0

        def _work(tx: ManagedTransaction) -> None:
            for relationship_type in ("COVERS", "DEFINES", "RESTRICTS"):
                rel_edges = [
                    {"section_id": link.section_id, "concept_id": link.concept_id}
                    for link in links
                    if link.relationship_type == relationship_type
                ]
                for batch in chunked(rel_edges, GRAPH_BATCH_SIZE):
                    tx.run(
                        f"""
                        UNWIND $edges AS edge
                        MATCH (s:Section {{id: edge.section_id}})
                        MATCH (c:PolicyConcept {{id: edge.concept_id}})
                        MERGE (s)-[:{relationship_type}]->(c)
                        """,
                        {"edges": batch},
                    )

        with self._session_factory() as session:
            self._execute_write(session, _work, "merge_concept_links")

        return len(links)

    def _write_sections(self, tx: ManagedTransaction, sections: list, doc_id: str) -> None:
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

        existing_content = self._fetch_existing_section_content(tx, section_ids)
        changed_section_ids = [
            row["id"]
            for row in section_rows
            if row["id"] in existing_content
            and existing_content[row["id"]] != row["content_text"]
        ]

        self._cleanup_document_sections(tx, doc_id, section_ids, changed_section_ids)

        for batch in chunked(section_rows, GRAPH_BATCH_SIZE):
            tx.run(queries.MERGE_SECTIONS_BATCH, {"sections": batch})

        for batch in chunked(section_ids, GRAPH_BATCH_SIZE):
            tx.run(queries.MERGE_HAS_SECTION_BATCH, {"doc_id": doc_id, "section_ids": batch})

        for batch in chunked(parent_pairs, GRAPH_BATCH_SIZE):
            tx.run(queries.MERGE_PARENT_OF_BATCH, {"pairs": batch})

        for batch in chunked(sibling_pairs, GRAPH_BATCH_SIZE):
            tx.run(queries.MERGE_NEXT_SIBLING_BATCH, {"pairs": batch})

    def _fetch_existing_section_content(
        self, tx: ManagedTransaction, section_ids: list[str]
    ) -> dict[str, str]:
        """Fetch content_text for sections that already exist in the graph."""
        existing: dict[str, str] = {}
        for batch in chunked(section_ids, GRAPH_BATCH_SIZE):
            result = tx.run(queries.GET_SECTION_CONTENT_BATCH, {"section_ids": batch})
            for record in result:
                existing[record["id"]] = record["content_text"]
        return existing

    def _cleanup_document_sections(
        self,
        tx: ManagedTransaction,
        doc_id: str,
        section_ids: list[str],
        changed_section_ids: list[str],
    ) -> None:
        tx.run(
            queries.DELETE_STALE_DOCUMENT_SECTIONS,
            {"doc_id": doc_id, "section_ids": section_ids},
        )
        tx.run(queries.CLEAR_DOCUMENT_SECTION_STRUCTURE, {"doc_id": doc_id})

        # Only sections whose content actually changed lose their embedding and
        # chunks — unchanged sections keep them, so re-running the loader never
        # forces a full corpus re-embed.
        for batch in chunked(changed_section_ids, GRAPH_BATCH_SIZE):
            tx.run(
                queries.CLEAR_SECTION_CHUNKS_AND_EMBEDDINGS_BATCH,
                {"section_ids": batch},
            )

    def _mark_document_statuses(
        self, tx: ManagedTransaction, document_ids: list[str], status: str
    ) -> None:
        if not document_ids:
            return

        for batch in chunked(sorted(set(document_ids)), GRAPH_BATCH_SIZE):
            tx.run(
                queries.SET_DOCUMENT_STATUS_BATCH,
                {"doc_ids": batch, "status": status},
            )


graph_writer = CorpusGraphWriter()
