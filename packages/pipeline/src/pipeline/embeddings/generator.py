"""Generate vector embeddings for Section nodes using Voyage AI.

Large sections (>= MAX_CHUNK_CHARS) are split into Chunk nodes and embedded
per-chunk. Small sections are embedded directly on the Section node.
"""

import math

from rich.console import Console
from rich.progress import track

from pipeline.config import (
    VOYAGE_API_KEY,
    EMBEDDING_MODEL,
    EMBED_BATCH_SIZE,
    EMBED_WRITE_BATCH_SIZE,
    EMBEDDING_DIMENSIONS,
)
from pipeline.embeddings.voyage_client import embed as voyage_embed
from pipeline.graph.bulk import write_chunks
from pipeline.graph.connection import get_session
from pipeline.graph import queries
from pipeline.embeddings.chunker import chunk_text, MAX_CHUNK_CHARS
from pipeline.utils.batching import chunked

console = Console()

# Rough chars-per-token estimate; used to stay under Voyage's 120K token limit.
# Using 3 chars/token (conservative for legal text) and a 60K limit gives ample
# headroom below Voyage's 120K maximum.
_CHARS_PER_TOKEN = 3
_MAX_BATCH_TOKENS = 60_000  # conservative flush threshold (Voyage limit: 120K)


def build_embedding_texts(section_ids: list[str]) -> dict[str, str]:
    """Read contextualized embedding text for many sections in one query."""
    if not section_ids:
        return {}

    with get_session() as session:
        result = session.run(
            """
            UNWIND $section_ids AS sid
            MATCH (s:Section {id: sid})
            OPTIONAL MATCH (ancestor:Section)-[:PARENT_OF*]->(s)
            WITH sid, s, collect(DISTINCT ancestor.title) AS ancestor_titles
            MATCH (d:Document)-[:HAS_SECTION]->(s)
            RETURN sid, d.title AS doc_title, s.title AS sec_title,
                   s.content_text AS content, ancestor_titles
            """,
            {"section_ids": section_ids},
        )
        texts: dict[str, str] = {}
        for record in result:
            chain = [record["doc_title"]] if record["doc_title"] else []
            chain.extend(
                title
                for title in (record["ancestor_titles"] or [])
                if title
            )
            if record["sec_title"]:
                chain.append(record["sec_title"])
            texts[record["sid"]] = (
                f"{' > '.join(chain)}\n{record['content'] or ''}"
            )
        return texts


def _create_chunks_in_neo4j(
    section_id: str, heading_prefix: str, chunks: list[str]
) -> list[str]:
    """Persist Chunk nodes linked to their Section. Returns list of chunk IDs."""
    with get_session() as session:
        return write_chunks(session, section_id, chunks)


def _flush_batch(
    model: str,
    batch_ids: list[str],
    batch_texts: list[str],
    batch_kinds: list[str],  # "section" or "chunk"
    stats: dict,
):
    """Embed a batch and store results in Neo4j."""
    if not batch_texts:
        return
    try:
        embeddings = voyage_embed(batch_texts, model=model, input_type="document")
        if len(embeddings) != len(batch_texts):
            raise RuntimeError(
                "Voyage returned "
                f"{len(embeddings)} embeddings for {len(batch_texts)} inputs"
            )
        if any(
            len(embedding) != EMBEDDING_DIMENSIONS
            or any(
                not isinstance(value, (int, float))
                or not math.isfinite(value)
                for value in embedding
            )
            for embedding in embeddings
        ):
            raise RuntimeError(
                "Voyage returned an invalid embedding; expected "
                f"{EMBEDDING_DIMENSIONS} finite dimensions"
            )
        with get_session() as session:
            section_rows = [
                {"id": node_id, "embedding": emb}
                for node_id, emb, kind in zip(batch_ids, embeddings, batch_kinds)
                if kind == "section"
            ]
            chunk_rows = [
                {"id": node_id, "embedding": emb}
                for node_id, emb, kind in zip(batch_ids, embeddings, batch_kinds)
                if kind == "chunk"
            ]
            for batch in chunked(section_rows, EMBED_WRITE_BATCH_SIZE):
                session.run(queries.SET_SECTION_EMBEDDINGS_BATCH, {"rows": batch})
            for batch in chunked(chunk_rows, EMBED_WRITE_BATCH_SIZE):
                session.run(queries.SET_CHUNK_EMBEDDINGS_BATCH, {"rows": batch})
        stats["embedded"] += len(batch_ids)
    except Exception as e:
        console.print(f"[red]Batch error: {e}[/red]")
        stats["errors"] += len(batch_ids)
        raise


def validate_embedding_coverage() -> tuple[int, int]:
    """Require every non-empty section to have a complete embedding path."""
    with get_session() as session:
        coverage = session.run(
            """
            MATCH (s:Section)
            WHERE s.content_length > 0
            OPTIONAL MATCH (s)-[:HAS_CHUNK]->(ch:Chunk)
            WITH s, collect(ch) AS chunks
            WITH count(s) AS total,
                 sum(
                   CASE
                     WHEN s.content_length < $max_chars
                       AND s.embedding IS NOT NULL
                     THEN 1
                     WHEN s.content_length >= $max_chars
                       AND size(chunks) > 0
                       AND all(ch IN chunks WHERE ch.embedding IS NOT NULL)
                     THEN 1
                     ELSE 0
                   END
                 ) AS covered
            RETURN total, covered
            """,
            {"max_chars": MAX_CHUNK_CHARS},
        ).single()

    total = int(coverage["total"]) if coverage else 0
    covered = int(coverage["covered"]) if coverage else 0
    if covered != total:
        raise RuntimeError(
            f"Embedding coverage incomplete: {covered}/{total} sections"
        )
    return total, covered


def embed_all(model: str | None = None) -> dict:
    """Generate embeddings for all sections without embeddings.

    Sections whose text fits within MAX_CHUNK_CHARS are embedded directly.
    Larger sections are split into Chunk nodes and each chunk is embedded.
    Previously truncated embeddings (content_length > MAX_CHUNK_CHARS but
    embedding is set) are cleared first so they get re-embedded as chunks.
    """
    model = model or EMBEDDING_MODEL
    if not VOYAGE_API_KEY:
        raise RuntimeError("VOYAGE_API_KEY not set")

    # Clear stale truncated embeddings (sections that are too large but were
    # previously embedded via truncation)
    with get_session() as session:
        clear_result = session.run("""
            MATCH (s:Section)
            WHERE s.embedding IS NOT NULL AND s.content_length > $max_chars
            SET s.embedding = NULL
            RETURN count(s) AS cleared
        """, {"max_chars": MAX_CHUNK_CHARS})
        cleared = clear_result.single()["cleared"]
    if cleared:
        console.print(f"Cleared {cleared} stale truncated embeddings for re-processing.")

    # Find sections without embeddings (small sections only — large ones use chunks)
    with get_session() as session:
        result = session.run(
            "MATCH (s:Section) WHERE s.embedding IS NULL AND s.content_length > 0 AND s.content_length < $max_chars RETURN s.id",
            {"max_chars": MAX_CHUNK_CHARS},
        )
        section_ids = [r["s.id"] for r in result]

    # Also find large sections that haven't been chunked yet (no HAS_CHUNK rel)
    with get_session() as session:
        result = session.run(
            """
            MATCH (s:Section) WHERE s.embedding IS NULL AND s.content_length > 0 AND s.content_length >= $max_chars
            AND NOT (s)-[:HAS_CHUNK]->()
            RETURN s.id
            """,
            {"max_chars": MAX_CHUNK_CHARS},
        )
        large_section_ids = [r["s.id"] for r in result]

    # Find existing chunks without embeddings (e.g., from a failed previous run)
    with get_session() as session:
        result = session.run(
            "MATCH (ch:Chunk) WHERE ch.embedding IS NULL RETURN ch.id, ch.content_text"
        )
        pending_chunks = [(r["ch.id"], r["ch.content_text"]) for r in result]

    total_work = len(section_ids) + len(large_section_ids) + len(pending_chunks)
    if total_work == 0:
        validate_embedding_coverage()
        console.print("All sections and chunks already have embeddings.")
        return {"embedded": 0, "errors": 0, "chunks_created": 0}

    console.print(
        f"Work: {len(section_ids)} small sections, {len(large_section_ids)} large sections to chunk, "
        f"{len(pending_chunks)} existing chunks needing embeddings (using {model})..."
    )

    stats: dict = {"embedded": 0, "errors": 0, "chunks_created": 0}

    batch_ids: list[str] = []
    batch_texts: list[str] = []
    batch_kinds: list[str] = []
    batch_token_estimate: int = 0

    def _maybe_flush():
        nonlocal batch_ids, batch_texts, batch_kinds, batch_token_estimate
        if len(batch_texts) >= EMBED_BATCH_SIZE:
            _flush_batch(model, batch_ids, batch_texts, batch_kinds, stats)
            batch_ids, batch_texts, batch_kinds = [], [], []
            batch_token_estimate = 0

    def _add_item(item_id: str, text: str, kind: str):
        nonlocal batch_ids, batch_texts, batch_kinds, batch_token_estimate
        token_est = len(text) // _CHARS_PER_TOKEN
        if batch_texts and batch_token_estimate + token_est > _MAX_BATCH_TOKENS:
            _flush_batch(model, batch_ids, batch_texts, batch_kinds, stats)
            batch_ids, batch_texts, batch_kinds = [], [], []
            batch_token_estimate = 0
        batch_ids.append(item_id)
        batch_texts.append(text)
        batch_kinds.append(kind)
        batch_token_estimate += token_est

    # 1. Embed small sections directly
    section_texts = build_embedding_texts(section_ids)
    for sid in track(section_ids, description="Small sections..."):
        text = section_texts.get(sid, "")
        if not text.strip():
            continue
        _add_item(sid, text, "section")
        _maybe_flush()

    # 2. Chunk large sections and queue their chunks
    large_section_texts = build_embedding_texts(large_section_ids)
    for sid in track(large_section_ids, description="Chunking large sections..."):
        text = large_section_texts.get(sid, "")
        if not text.strip():
            continue
        heading_prefix = text.split("\n")[0]
        chunks = chunk_text(text, max_chars=MAX_CHUNK_CHARS)
        chunk_ids = _create_chunks_in_neo4j(sid, heading_prefix, chunks)
        stats["chunks_created"] += len(chunk_ids)
        for chunk_id, chunk_content in zip(chunk_ids, chunks):
            _add_item(chunk_id, chunk_content, "chunk")
            _maybe_flush()

    # 3. Embed existing chunks that are missing embeddings (retry after failures)
    for chunk_id, chunk_content in track(pending_chunks, description="Retrying chunks..."):
        if not chunk_content or not chunk_content.strip():
            continue
        _add_item(chunk_id, chunk_content, "chunk")
        _maybe_flush()

    # Flush remaining
    if batch_texts:
        _flush_batch(model, batch_ids, batch_texts, batch_kinds, stats)

    validate_embedding_coverage()

    return stats
