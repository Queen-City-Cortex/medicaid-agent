"""Bulk Neo4j helpers for chunk persistence."""

from neo4j import Session

from pipeline.config import GRAPH_BATCH_SIZE
from pipeline.graph import queries
from pipeline.utils.batching import chunked


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
