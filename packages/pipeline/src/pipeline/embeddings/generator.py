"""Generate vector embeddings for Section nodes using Voyage AI."""

import voyageai
from rich.console import Console
from rich.progress import track

from pipeline.config import VOYAGE_API_KEY, EMBEDDING_MODEL, EMBED_BATCH_SIZE
from pipeline.graph.connection import get_session

console = Console()


def build_embedding_text(section_id: str) -> tuple[str, str]:
    """
    Build contextualized embedding text for a section.

    Prepends the heading hierarchy (ancestors) to the section content.
    Returns (section_id, embedding_text).
    """
    with get_session() as session:
        # Get section and its ancestor chain
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

        # Build heading chain: doc title > ancestor titles > section title
        chain_parts = [record["doc_title"]] if record["doc_title"] else []
        if record["ancestor_titles"]:
            chain_parts.extend([t for t in record["ancestor_titles"] if t])
        if record["sec_title"]:
            chain_parts.append(record["sec_title"])

        heading_chain = " > ".join(chain_parts)
        content = record["content"] or ""

        return section_id, f"{heading_chain}\n{content}"


def embed_all(model: str | None = None) -> dict:
    """Generate embeddings for all sections without embeddings."""
    model = model or EMBEDDING_MODEL
    if not VOYAGE_API_KEY:
        console.print("[red]VOYAGE_API_KEY not set. Export it as an environment variable.[/red]")
        return {"embedded": 0, "errors": 0}

    client = voyageai.Client(api_key=VOYAGE_API_KEY)

    # Find sections without embeddings
    with get_session() as session:
        result = session.run(
            "MATCH (s:Section) WHERE s.embedding IS NULL RETURN s.id"
        )
        section_ids = [r["s.id"] for r in result]

    if not section_ids:
        console.print("All sections already have embeddings.")
        return {"embedded": 0, "errors": 0}

    console.print(f"Generating embeddings for {len(section_ids)} sections using {model}...")

    stats = {"embedded": 0, "errors": 0}

    # Build texts in batches
    batch_ids: list[str] = []
    batch_texts: list[str] = []

    for sid in track(section_ids, description="Building texts..."):
        _, text = build_embedding_text(sid)
        if text.strip():
            batch_ids.append(sid)
            batch_texts.append(text)

        # Process batch when full
        if len(batch_texts) >= EMBED_BATCH_SIZE:
            try:
                result = client.embed(batch_texts, model=model, input_type="document")
                _store_embeddings(batch_ids, result.embeddings)
                stats["embedded"] += len(batch_ids)
            except Exception as e:
                console.print(f"[red]Batch error: {e}[/red]")
                stats["errors"] += len(batch_ids)
            batch_ids = []
            batch_texts = []

    # Process remaining batch
    if batch_texts:
        try:
            result = client.embed(batch_texts, model=model, input_type="document")
            _store_embeddings(batch_ids, result.embeddings)
            stats["embedded"] += len(batch_ids)
        except Exception as e:
            console.print(f"[red]Batch error: {e}[/red]")
            stats["errors"] += len(batch_ids)

    return stats


def _store_embeddings(section_ids: list[str], embeddings: list[list[float]]):
    """Write embeddings back to Neo4j Section nodes."""
    with get_session() as session:
        for sid, emb in zip(section_ids, embeddings):
            session.run(
                "MATCH (s:Section {id: $sid}) SET s.embedding = $embedding",
                {"sid": sid, "embedding": emb},
            )
