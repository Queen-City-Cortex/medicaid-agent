"""Generate vector embeddings for Section nodes using Voyage AI.

Contextual plans determine direct or chunk vectors, with lossless source windows.
"""


from rich.console import Console

from pipeline.config import (
    VOYAGE_API_KEY,
    EMBEDDING_MODEL,
    EMBED_BATCH_SIZE,
    EMBED_WRITE_BATCH_SIZE,
    EMBEDDING_DIMENSIONS,
)
from pipeline.embeddings.voyage_client import embed as voyage_embed
from pipeline.graph.connection import get_session
from pipeline.embeddings.planner import plan_inputs, plan_hash
from pipeline.embeddings.tokenizer import BATCH_TOKENS
from pipeline.embeddings.plan_graph import (
    iter_sections, validate_plan_topology, valid_vector, stored_plan, plan_matches, embedding_coverage,
)
from pipeline.utils.batching import chunked

console = Console()

def iter_section_contexts(section_ids=None):
    """Use the authoritative context reader; retain the diagnostic tuple API."""
    for row in iter_sections(section_ids, session_factory=get_session):
        yield row["section_id"], row["heading"], row["body"], row["source_epoch"]


def _flush_batch(
    model: str,
    batch_ids: list[str],
    batch_texts: list[str],
    batch_kinds: list[str],  # "section" or "chunk"
    stats: dict,
    batch_plans: list[str],
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
        if not all(valid_vector(embedding, EMBEDDING_DIMENSIONS) for embedding in embeddings):
            raise RuntimeError(
                "Voyage returned an invalid embedding; expected "
                f"{EMBEDDING_DIMENSIONS} finite dimensions"
            )
        with get_session() as session:
            def store(tx):
                for kind, label in (("section", "Section"), ("chunk", "Chunk")):
                    rows = [
                        {"id": node_id, "embedding": emb, "plan": digest}
                        for node_id, emb, node_kind, digest in zip(
                            batch_ids, embeddings, batch_kinds, batch_plans, strict=True
                        ) if node_kind == kind
                    ]
                    for batch in chunked(rows, EMBED_WRITE_BATCH_SIZE):
                        owner_match = "WITH n AS owner,n,row" if kind == "section" else "MATCH (owner:Section)-[:HAS_CHUNK]->(n) WITH owner,n,row"
                        result = tx.run(f"""
                            UNWIND $rows AS row MATCH (n:{label} {{id:row.id}})
                            {owner_match}
                            SET owner.embedding_write_lock = true
                            WITH owner,n,row WHERE n.embedding_plan_hash=row.plan
                              AND owner.embedding_plan_hash=row.plan
                              AND owner.embedding_source_epoch IS NOT NULL
                              AND owner.embedding_plan_source_epoch=owner.embedding_source_epoch
                              AND n.embedding_plan_source_epoch=owner.embedding_source_epoch
                            SET n.embedding=row.embedding
                            REMOVE owner.embedding_write_lock
                            RETURN count(n) AS written
                        """, rows=batch).single()
                        if not result or result["written"] != len(batch):
                            raise RuntimeError("Embedding plan changed or target disappeared during provider call")
            session.execute_write(store)
        stats["embedded"] += len(batch_ids)
    except Exception as e:
        console.print(f"[red]Batch error: {e}[/red]")
        stats["errors"] += len(batch_ids)
        raise


def validate_embedding_coverage(model=EMBEDDING_MODEL) -> tuple[int, int]:
    result = embedding_coverage(model, EMBEDDING_DIMENSIONS)
    if result["covered"] != result["total"]:
        raise RuntimeError(f"Embedding coverage incomplete: {result['covered']}/{result['total']} sections")
    return result["total"], result["covered"]


def persist_plan(section_id, inputs, digest, source_epoch):
    """Invalidate changed inputs atomically; unchanged pending plans can resume."""
    rows = [{"id":f"{section_id}:chunk:{i}","chunk_index":i,
             "content_text":item.text,"content_length":len(item.text),
             "body_start":item.body_start,"body_end":item.body_end,
             "input_hash":item.input_hash} for i,item in enumerate(inputs)]
    with get_session() as session:
        def reconcile(tx):
            current = tx.run("MATCH (s:Section {id:$sid}) SET s.embedding_write_lock=true RETURN s.embedding_plan_hash AS hash,s.embedding_source_epoch AS source_epoch",
                             sid=section_id).single()
            if not current:
                raise ValueError("Embedding section disappeared: " + section_id)
            if (inputs and not source_epoch) or current["source_epoch"] != source_epoch:
                raise ValueError("Embedding source changed after preflight: " + section_id)
            stored = stored_plan(tx, section_id)
            changed = not plan_matches(section_id, inputs, digest, source_epoch, stored)
            if changed:
                tx.run("""MATCH (s:Section {id:$sid})
                    OPTIONAL MATCH (s)-[:HAS_CHUNK]->(ch:Chunk)
                    DETACH DELETE ch
                    SET s.embedding=NULL,s.embedding_plan_hash=$hash,s.embedding_input_count=$count,
                        s.embedding_plan_source_epoch=$epoch
                """,sid=section_id,hash=digest if inputs else None,count=len(inputs) if inputs else None,epoch=source_epoch if inputs else None).consume()
                if len(inputs)>1:
                    tx.run("""MATCH (s:Section {id:$sid}) UNWIND $rows AS row
                        CREATE (ch:Chunk) SET ch=row,ch.section_id=$sid,ch.embedding_plan_hash=$hash,ch.embedding_plan_source_epoch=$epoch
                        CREATE (s)-[:HAS_CHUNK]->(ch)
                    """,sid=section_id,rows=rows,hash=digest,epoch=source_epoch).consume()
            actual = stored_plan(tx, section_id)
            pending = {row["id"] for row in actual
                       if (len(inputs) == 1 or row["kind"] == "chunk")
                       and not valid_vector(row["vector"], EMBEDDING_DIMENSIONS)}
            tx.run("MATCH (s:Section {id:$sid}) REMOVE s.embedding_write_lock", sid=section_id).consume()
            return pending, len(rows) if changed and len(inputs)>1 else 0
        return session.execute_write(reconcile)


def embed_all(model: str | None = None) -> dict:
    """Plan contextual inputs, replace stale vectors, and resume matching work."""
    model = model or EMBEDDING_MODEL
    if not VOYAGE_API_KEY:
        raise RuntimeError("VOYAGE_API_KEY not set")
    stats = {"embedded":0,"errors":0,"chunks_created":0}
    # Complete pure validation precedes all mutations and provider calls.
    validate_plan_topology()
    expected = {}
    for sid, heading, body, epoch in iter_section_contexts():
        if body.strip() and not epoch:
            raise ValueError("Reload unversioned embedding source before generation: " + sid)
        inputs = list(plan_inputs(heading, body, model))
        previous = 0
        for item in inputs:
            if not body[previous:item.body_end].strip():
                raise ValueError("Whitespace-only novel embedding input requires representation review: " + sid)
            previous = item.body_end
        expected[sid] = (plan_hash(inputs, model, EMBEDDING_DIMENSIONS), epoch)
    ids, texts, kinds, plans = [], [], [], []
    token_total = 0

    def flush():
        nonlocal token_total
        _flush_batch(model,ids,texts,kinds,stats,plans)
        ids.clear()
        texts.clear()
        kinds.clear()
        plans.clear()
        token_total=0

    for sid,heading,body,epoch in iter_section_contexts():
        try:
            inputs=list(plan_inputs(heading,body,model))
        except ValueError as error:
            raise ValueError(f"Invalid embedding plan for {sid}: {error}") from error
        digest=plan_hash(inputs,model,EMBEDDING_DIMENSIONS)
        if expected.pop(sid, None) != (digest,epoch):
            raise ValueError("Embedding source changed after preflight: " + sid)
        pending, created = persist_plan(sid,inputs,digest,epoch)
        stats["chunks_created"] += created
        for i,item in enumerate(inputs):
            item_id=sid if len(inputs)==1 else f"{sid}:chunk:{i}"
            if item_id not in pending:
                continue
            if texts and (len(texts)>=EMBED_BATCH_SIZE or token_total+item.tokens>BATCH_TOKENS):
                flush()
            ids.append(item_id)
            texts.append(item.text)
            kinds.append("section" if len(inputs)==1 else "chunk")
            plans.append(digest)
            token_total+=item.tokens
    if expected:
        raise ValueError("Embedding sections disappeared after preflight")
    if texts:
        flush()
    validate_embedding_coverage(model)
    return stats
