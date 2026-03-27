"""Generate vector embeddings for Section nodes using Voyage AI.

Large sections (>= MAX_CHUNK_CHARS) are split into Chunk nodes and embedded
per-chunk. Small sections are embedded directly on the Section node.
"""

import voyageai
from rich.console import Console
from rich.progress import track

from pipeline.config import VOYAGE_API_KEY, EMBEDDING_MODEL, EMBED_BATCH_SIZE
from pipeline.graph.connection import get_session
from pipeline.graph import queries
from pipeline.embeddings.chunker import chunk_text, MAX_CHUNK_CHARS

console = Console()

# Rough chars-per-token estimate; used to stay under Voyage's 120K token limit.
# Using 3 chars/token (conservative for legal text) and a 60K limit gives ample
# headroom below Voyage's 120K maximum.
_CHARS_PER_TOKEN = 3
_MAX_BATCH_TOKENS = 60_000  # conservative flush threshold (Voyage limit: 120K)


def build_embedding_text(section_id: str) -> tuple[str, str]:
    """Build contextualized embedding text for a section.

    Prepends the heading hierarchy (ancestors) to the section content.
    Returns (section_id, embedding_text).
    """
    with get_session() as session:
        result = session.run("""
            MATCH (s:Section {id: $sid})
            OPTIONAL MATCH path = (ancestor:Section)-[:PARENT_OF*]->(s)
            WITH s, collect(ancestor) AS ancestors
            MATCH (d:Document)-[:HAS_SECTION]->(s)
            RETURN d.title AS doc_title, s.title AS sec_title,
                   s.content_text AS content,
                   [a IN ancestors | a.title] AS ancestor_titles
        """, {"sid": section_id})

        record = result.single()
        if not record:
            return section_id, ""

        chain_parts = [record["doc_title"]] if record["doc_title"] else []
        if record["ancestor_titles"]:
            chain_parts.extend([t for t in record["ancestor_titles"] if t])
        if record["sec_title"]:
            chain_parts.append(record["sec_title"])

        heading_chain = " > ".join(chain_parts)
        content = record["content"] or ""

        return section_id, f"{heading_chain}\n{content}"


def _create_chunks_in_neo4j(
    section_id: str, heading_prefix: str, chunks: list[str]
) -> list[str]:
    """Persist Chunk nodes linked to their Section. Returns list of chunk IDs."""
    chunk_ids: list[str] = []
    with get_session() as session:
        for idx, chunk_text_content in enumerate(chunks):
            chunk_id = f"{section_id}:chunk:{idx}"
            session.run(
                queries.MERGE_CHUNK,
                {
                    "id": chunk_id,
                    "section_id": section_id,
                    "chunk_index": idx,
                    "content_text": chunk_text_content,
                    "content_length": len(chunk_text_content),
                },
            )
            session.run(
                queries.MERGE_HAS_CHUNK,
                {"section_id": section_id, "chunk_id": chunk_id},
            )
            chunk_ids.append(chunk_id)
    return chunk_ids


def _flush_batch(
    client: voyageai.Client,
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
        result = client.embed(batch_texts, model=model, input_type="document")
        with get_session() as session:
            for node_id, emb, kind in zip(batch_ids, result.embeddings, batch_kinds):
                if kind == "section":
                    session.run(
                        "MATCH (s:Section {id: $id}) SET s.embedding = $embedding",
                        {"id": node_id, "embedding": emb},
                    )
                else:  # chunk
                    session.run(
                        "MATCH (ch:Chunk {id: $id}) SET ch.embedding = $embedding",
                        {"id": node_id, "embedding": emb},
                    )
        stats["embedded"] += len(batch_ids)
    except Exception as e:
        console.print(f"[red]Batch error: {e}[/red]")
        stats["errors"] += len(batch_ids)


def embed_all(model: str | None = None) -> dict:
    """Generate embeddings for all sections without embeddings.

    Sections whose text fits within MAX_CHUNK_CHARS are embedded directly.
    Larger sections are split into Chunk nodes and each chunk is embedded.
    Previously truncated embeddings (content_length > MAX_CHUNK_CHARS but
    embedding is set) are cleared first so they get re-embedded as chunks.
    """
    model = model or EMBEDDING_MODEL
    if not VOYAGE_API_KEY:
        console.print("[red]VOYAGE_API_KEY not set. Export it as an environment variable.[/red]")
        return {"embedded": 0, "errors": 0, "chunks_created": 0}

    client = voyageai.Client(api_key=VOYAGE_API_KEY)

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
            "MATCH (s:Section) WHERE s.embedding IS NULL AND s.content_length < $max_chars RETURN s.id",
            {"max_chars": MAX_CHUNK_CHARS},
        )
        section_ids = [r["s.id"] for r in result]

    # Also find large sections that haven't been chunked yet (no HAS_CHUNK rel)
    with get_session() as session:
        result = session.run(
            """
            MATCH (s:Section) WHERE s.embedding IS NULL AND s.content_length >= $max_chars
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
            _flush_batch(client, model, batch_ids, batch_texts, batch_kinds, stats)
            batch_ids, batch_texts, batch_kinds = [], [], []
            batch_token_estimate = 0

    def _add_item(item_id: str, text: str, kind: str):
        nonlocal batch_ids, batch_texts, batch_kinds, batch_token_estimate
        token_est = len(text) // _CHARS_PER_TOKEN
        if batch_texts and batch_token_estimate + token_est > _MAX_BATCH_TOKENS:
            _flush_batch(client, model, batch_ids, batch_texts, batch_kinds, stats)
            batch_ids, batch_texts, batch_kinds = [], [], []
            batch_token_estimate = 0
        batch_ids.append(item_id)
        batch_texts.append(text)
        batch_kinds.append(kind)
        batch_token_estimate += token_est

    # 1. Embed small sections directly
    for sid in track(section_ids, description="Small sections..."):
        _, text = build_embedding_text(sid)
        if not text.strip():
            continue
        _add_item(sid, text, "section")
        _maybe_flush()

    # 2. Chunk large sections and queue their chunks
    for sid in track(large_section_ids, description="Chunking large sections..."):
        _, text = build_embedding_text(sid)
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
        _flush_batch(client, model, batch_ids, batch_texts, batch_kinds, stats)

    return stats


def _store_embeddings(section_ids: list[str], embeddings: list[list[float]]):
    """Write embeddings back to Neo4j Section nodes (legacy helper)."""
    with get_session() as session:
        for sid, emb in zip(section_ids, embeddings):
            session.run(
                "MATCH (s:Section {id: $sid}) SET s.embedding = $embedding",
                {"sid": sid, "embedding": emb},
            )
