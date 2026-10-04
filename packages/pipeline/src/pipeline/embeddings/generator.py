"""Generate vector embeddings for Section nodes using Voyage AI.

Contextual plans determine direct or chunk vectors, with lossless source windows.
"""

import math

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
from pipeline.utils.batching import chunked

console = Console()

def iter_section_contexts(section_ids=None):
    """Read at most ten bodies per query and stream one Bolt record at a time, with deterministic ancestor order."""
    if section_ids is None:
        with get_session() as session:
            section_ids = [r["id"] for r in session.run(
                "MATCH (s:Section) WHERE s.content_length > 0 RETURN s.id AS id ORDER BY s.id"
            )]
    for ids in chunked(section_ids, 10):
        with get_session(default_access_mode="READ", fetch_size=1) as session:
            records = session.run("""
                UNWIND $section_ids AS sid
                MATCH (s:Section {id: sid})
                OPTIONAL MATCH path=(ancestor:Section)-[:PARENT_OF*]->(s)
                WITH sid,s,ancestor,length(path) AS depth
                ORDER BY depth DESC, ancestor.id
                WITH sid,s,collect(DISTINCT ancestor.title) AS ancestor_titles
                MATCH (d:Document)-[:HAS_SECTION]->(s)
                RETURN sid,d.title AS doc_title,s.title AS sec_title,
                       s.content_text AS content,ancestor_titles
                ORDER BY sid
            """, {"section_ids": ids})
            for row in records:
                chain = [row["doc_title"]] if row["doc_title"] else []
                chain.extend(t for t in row["ancestor_titles"] or [] if t)
                if row["sec_title"]:
                    chain.append(row["sec_title"])
                yield row["sid"], " > ".join(chain), row["content"] or ""


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
            def store(tx):
                for kind, label in (("section", "Section"), ("chunk", "Chunk")):
                    rows = [
                        {"id": node_id, "embedding": emb, "plan": digest}
                        for node_id, emb, node_kind, digest in zip(
                            batch_ids, embeddings, batch_kinds, batch_plans, strict=True
                        ) if node_kind == kind
                    ]
                    for batch in chunked(rows, EMBED_WRITE_BATCH_SIZE):
                        result = tx.run(f"""
                            UNWIND $rows AS row MATCH (n:{label} {{id:row.id}})
                            SET n.embedding_write_lock = true
                            WITH n,row WHERE n.embedding_plan_hash=row.plan
                            SET n.embedding=row.embedding
                            REMOVE n.embedding_write_lock
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


def validate_embedding_coverage() -> tuple[int, int]:
    """Require every nonempty section to have its complete planned vector path."""
    with get_session() as session:
        coverage = session.run("""
            MATCH (s:Section) WHERE s.content_length > 0
            OPTIONAL MATCH (s)-[:HAS_CHUNK]->(ch:Chunk)
            WITH s,collect(ch) AS chunks
            WITH count(s) AS total,
                 sum(CASE WHEN s.embedding_plan_hash IS NOT NULL AND
                    ((s.embedding IS NOT NULL AND size(s.embedding)=$dimensions
                      AND s.embedding_input_count = 1 AND size(chunks)=0)
                     OR (s.embedding IS NULL AND s.embedding_input_count = size(chunks)
                         AND size(chunks)>0 AND all(ch IN chunks WHERE ch.embedding IS NOT NULL
                             AND size(ch.embedding)=$dimensions
                             AND ch.embedding_plan_hash=s.embedding_plan_hash)))
                    THEN 1 ELSE 0 END) AS covered
            RETURN total,covered
        """, {"dimensions": EMBEDDING_DIMENSIONS}).single()
    total = int(coverage["total"]) if coverage else 0
    covered = int(coverage["covered"]) if coverage else 0
    if covered != total:
        raise RuntimeError(f"Embedding coverage incomplete: {covered}/{total} sections")
    return total, covered


def persist_plan(section_id, inputs, digest):
    """Invalidate changed inputs atomically; unchanged pending plans can resume."""
    rows = [{"id":f"{section_id}:chunk:{i}","chunk_index":i,
             "content_text":item.text,"content_length":len(item.text),
             "body_start":item.body_start,"body_end":item.body_end,
             "input_hash":item.input_hash} for i,item in enumerate(inputs)]
    with get_session() as session:
        def reconcile(tx):
            current = tx.run("MATCH (s:Section {id:$sid}) SET s.embedding_write_lock=true RETURN s.embedding_plan_hash AS hash",
                             sid=section_id).single()
            if not current:
                raise ValueError("Embedding section disappeared: " + section_id)
            changed = current["hash"] != digest
            if not changed and len(inputs)>1:
                existing = list(tx.run("""MATCH (:Section {id:$sid})-[:HAS_CHUNK]->(ch:Chunk)
                    RETURN ch.id AS id,ch.input_hash AS input_hash,
                           ch.embedding_plan_hash AS plan ORDER BY ch.chunk_index""", sid=section_id))
                changed = len(existing) != len(rows) or any(
                    actual["id"] != expected["id"] or actual["input_hash"] != expected["input_hash"]
                    or actual["plan"] != digest for actual,expected in zip(existing, rows)
                )
            if changed:
                tx.run("""MATCH (s:Section {id:$sid})
                    OPTIONAL MATCH (s)-[:HAS_CHUNK]->(ch:Chunk)
                    DETACH DELETE ch
                    SET s.embedding=NULL,s.embedding_plan_hash=$hash,s.embedding_input_count=$count
                """,sid=section_id,hash=digest,count=len(inputs)).consume()
                if len(inputs)>1:
                    tx.run("""MATCH (s:Section {id:$sid}) UNWIND $rows AS row
                        CREATE (ch:Chunk) SET ch=row,ch.section_id=$sid,ch.embedding_plan_hash=$hash
                        CREATE (s)-[:HAS_CHUNK]->(ch)
                    """,sid=section_id,rows=rows,hash=digest).consume()
            if len(inputs)==1:
                result=tx.run("MATCH (s:Section {id:$sid}) WHERE s.embedding IS NULL RETURN s.id AS id",sid=section_id)
            else:
                result=tx.run("""MATCH (:Section {id:$sid})-[:HAS_CHUNK]->(ch:Chunk)
                    WHERE ch.embedding IS NULL RETURN ch.id AS id ORDER BY ch.chunk_index""",sid=section_id)
            pending = {row["id"] for row in result}
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
    expected = {}
    for sid, heading, body in iter_section_contexts():
        inputs = list(plan_inputs(heading, body, model))
        if not inputs:
            raise ValueError("Nonempty section has no embedding inputs: " + sid)
        expected[sid] = plan_hash(inputs, model, EMBEDDING_DIMENSIONS)
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

    for sid,heading,body in iter_section_contexts():
        try:
            inputs=list(plan_inputs(heading,body,model))
        except ValueError as error:
            raise ValueError(f"Invalid embedding plan for {sid}: {error}") from error
        if not inputs:
            raise ValueError("Nonempty section has no embedding inputs: " + sid)
        digest=plan_hash(inputs,model,EMBEDDING_DIMENSIONS)
        if expected.pop(sid, None) != digest:
            raise ValueError("Embedding source changed after preflight: " + sid)
        pending, created = persist_plan(sid,inputs,digest)
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
    validate_embedding_coverage()
    return stats
