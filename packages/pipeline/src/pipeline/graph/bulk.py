"""Bulk Neo4j writers for sections and chunks."""

from neo4j import Session

from pipeline.config import GRAPH_BATCH_SIZE
from pipeline.graph import queries
from pipeline.utils.batching import chunked


def write_sections(session: Session, doc_id: str, sections: list[dict]) -> None:
    """Persist Section nodes and their structural edges in batches."""
    section_rows = [
        {
            "id": section["id"],
            "document_id": doc_id,
            "section_number": section.get("section_number"),
            "title": section.get("title"),
            "level": section.get("level"),
            "content_text": section.get("content_text", ""),
            "content_length": section.get("content_length", 0),
            "has_tables": section.get("has_tables", False),
            "has_definitions": section.get("has_definitions", False),
        }
        for section in sections
    ]
    section_ids = [section["id"] for section in sections]
    parent_pairs = [
        {"parent_id": section["parent_id"], "child_id": section["id"]}
        for section in sections
        if section.get("parent_id")
    ]
    sibling_pairs = [
        {"prev_id": section["prev_sibling_id"], "next_id": section["id"]}
        for section in sections
        if section.get("prev_sibling_id")
    ]

    for batch in chunked(section_rows, GRAPH_BATCH_SIZE):
        session.run(queries.MERGE_SECTIONS_BATCH, {"sections": batch})

    for batch in chunked(section_ids, GRAPH_BATCH_SIZE):
        session.run(queries.MERGE_HAS_SECTION_BATCH, {"doc_id": doc_id, "section_ids": batch})

    for batch in chunked(parent_pairs, GRAPH_BATCH_SIZE):
        session.run(queries.MERGE_PARENT_OF_BATCH, {"pairs": batch})

    for batch in chunked(sibling_pairs, GRAPH_BATCH_SIZE):
        session.run(queries.MERGE_NEXT_SIBLING_BATCH, {"pairs": batch})


def write_chunks(session: Session, section_id: str, chunks: list[str]) -> list[str]:
    """Persist Chunk nodes linked to their Section. Returns created chunk IDs."""
    chunk_rows = [
        {
            "id": f"{section_id}:chunk:{idx}",
            "section_id": section_id,
            "chunk_index": idx,
            "content_text": chunk_text,
            "content_length": len(chunk_text),
        }
        for idx, chunk_text in enumerate(chunks)
    ]
    chunk_ids = [row["id"] for row in chunk_rows]

    for batch in chunked(chunk_rows, GRAPH_BATCH_SIZE):
        session.run(queries.MERGE_CHUNKS_BATCH, {"chunks": batch})

    for batch in chunked(chunk_ids, GRAPH_BATCH_SIZE):
        session.run(queries.MERGE_HAS_CHUNK_BATCH, {"section_id": section_id, "chunk_ids": batch})

    return chunk_ids
