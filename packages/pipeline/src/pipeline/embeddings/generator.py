"""Generate embeddings from the exact versioned contextual input plan."""

from rich.console import Console

from pipeline.config import (
    VOYAGE_API_KEY,
    EMBEDDING_MODEL,
    EMBEDDING_DIMENSIONS,
    EMBED_BATCH_SIZE,
)
from pipeline.embeddings.chunker import MAX_BATCH_BYTES, plan_inputs
from pipeline.embeddings.plan_graph import (
    embedding_coverage,
    input_id,
    iter_sections,
    plan_matches,
    stored_inputs,
    valid_vector,
)
from pipeline.embeddings.voyage_client import embed as voyage_embed
from pipeline.graph.connection import get_session
from pipeline.utils.batching import chunked
from pipeline.config import GRAPH_BATCH_SIZE

console = Console()


def _persist_plan(section_id, parts, model, dimensions):
    """Replace an incompatible section plan in a single transaction."""

    def replace(tx):
        tx.run(
            """
        MATCH (s:Section {id:$id}) OPTIONAL MATCH (s)-[:HAS_CHUNK]->(ch:Chunk)
        WITH s, collect(ch) AS chunks
        FOREACH (ch IN chunks | DETACH DELETE ch)
        REMOVE s.embedding, s.embedding_fingerprint
        """,
            id=section_id,
        ).consume()
        if parts and parts[0].kind == "section":
            tx.run(
                "MATCH (s:Section {id:$id}) SET s.embedding_fingerprint=$fingerprint",
                id=section_id,
                fingerprint=parts[0].fingerprint(model, dimensions),
            ).consume()
        else:
            rows = [
                {
                    "id": input_id(section_id, p),
                    "index": p.index,
                    "text": p.text,
                    "fingerprint": p.fingerprint(model, dimensions),
                }
                for p in parts
            ]
            for batch in chunked(rows, GRAPH_BATCH_SIZE):
                tx.run(
                    """
                MATCH (s:Section {id:$id}) UNWIND $rows AS row
                CREATE (ch:Chunk {id:row.id, section_id:$id, chunk_index:row.index,
                    content_text:row.text, content_length:size(row.text),
                    embedding_fingerprint:row.fingerprint})
                CREATE (s)-[:HAS_CHUNK]->(ch)
                """,
                    id=section_id,
                    rows=batch,
                ).consume()

    with get_session() as session:
        session.execute_write(replace)


def _flush_batch(model, items, stats):
    if not items:
        return
    vectors = voyage_embed(
        [i["text"] for i in items], model=model, input_type="document"
    )
    if len(vectors) != len(items) or not all(
        valid_vector(v, EMBEDDING_DIMENSIONS) for v in vectors
    ):
        raise RuntimeError("Voyage returned an invalid embedding batch")
    rows = [{**item, "embedding": vector} for item, vector in zip(items, vectors)]

    def write(tx):
        for kind, label in (("section", "Section"), ("chunk", "Chunk")):
            selected = [r for r in rows if r["kind"] == kind]
            if not selected:
                continue
            result = tx.run(
                f"""
            UNWIND $rows AS row MATCH (n:{label} {{id:row.id}})
            WHERE n.embedding_fingerprint = row.fingerprint
            SET n.embedding=row.embedding RETURN count(n) AS written
            """,
                rows=selected,
            ).single()
            if not result or result["written"] != len(selected):
                raise RuntimeError("Embedding plan changed during guarded vector write")

    with get_session() as session:
        session.execute_write(write)
    stats["embedded"] += len(items)


def validate_embedding_coverage(model: str = EMBEDDING_MODEL) -> tuple[int, int]:
    result = embedding_coverage(model=model)
    if result["covered"] != result["total"]:
        raise RuntimeError(
            f"Embedding coverage incomplete: {result['covered']}/{result['total']} sections"
        )
    return result["total"], result["covered"]


def embed_all(model: str | None = None) -> dict:
    """Plan first, resume exact inputs only; legacy vectors require a fresh candidate.

    This command performs paid calls. Offline preparation uses plan_inputs only.
    """
    model = model or EMBEDDING_MODEL
    if not VOYAGE_API_KEY:
        raise RuntimeError("VOYAGE_API_KEY not set")
    # Fail before graph writes or provider calls on unversioned vectors or invalid
    # contexts/topology. Qualification builds use a fresh inactive graph.
    with get_session() as session:
        legacy = session.run("""
        MATCH (n) WHERE (n:Section OR n:Chunk) AND n.embedding IS NOT NULL
        AND n.embedding_fingerprint IS NULL RETURN count(n) AS total
        """).single()
        if legacy and legacy["total"]:
            raise RuntimeError(
                "Unversioned embeddings: rebuild a fresh inactive candidate"
            )
        shared = session.run("""
        MATCH (ch:Chunk) OPTIONAL MATCH (s:Section)-[:HAS_CHUNK]->(ch)
        WITH ch, count(s) AS owners WHERE owners <> 1 RETURN count(ch) AS invalid
        """).single()
        if shared and shared["invalid"]:
            raise RuntimeError(
                "Invalid chunk ownership: rebuild a fresh inactive candidate"
            )
    for section in iter_sections():
        previous_end = 0
        body_bytes = section["body"].encode()
        for part in plan_inputs(section["body"], section["context"]):
            novel = body_bytes[previous_end : part.body_end]
            if not novel.decode().strip():
                raise ValueError(
                    f"Whitespace-only embedding input requires representation review: {section['section_id']}"
                )
            previous_end = part.body_end

    stats = {"embedded": 0, "errors": 0, "chunks_created": 0}
    batch = []
    batch_bytes = 0
    try:
        for section in iter_sections():
            sid = section["section_id"]
            parts = list(plan_inputs(section["body"], section["context"]))
            stored = stored_inputs(sid)
            if not plan_matches(
                sid, parts, stored, model, EMBEDDING_DIMENSIONS, require_vectors=False
            ):
                _persist_plan(sid, parts, model, EMBEDDING_DIMENSIONS)
                stats["chunks_created"] += sum(p.kind == "chunk" for p in parts)
                stored = []
            completed = {
                r["id"]
                for r in stored
                if valid_vector(r["vector"], EMBEDDING_DIMENSIONS)
            }
            for part in parts:
                nid = input_id(sid, part)
                if nid in completed:
                    continue
                size = len(part.text.encode())
                if batch and (
                    batch_bytes + size > MAX_BATCH_BYTES
                    or len(batch) >= EMBED_BATCH_SIZE
                ):
                    _flush_batch(model, batch, stats)
                    batch, batch_bytes = [], 0
                batch.append(
                    {
                        "id": nid,
                        "text": part.text,
                        "kind": part.kind,
                        "fingerprint": part.fingerprint(model, EMBEDDING_DIMENSIONS),
                    }
                )
                batch_bytes += size
        _flush_batch(model, batch, stats)
        validate_embedding_coverage(model)
    except Exception:
        stats["errors"] += len(batch)
        raise
    return stats
