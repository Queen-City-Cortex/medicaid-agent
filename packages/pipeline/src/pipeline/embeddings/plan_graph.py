"""Shared contextual graph reads and exact token-plan coverage checks."""

from collections.abc import Iterator
import math

from pipeline.config import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL
from pipeline.corpus_manifest import ARCHIVE_SOURCE_TYPES
from pipeline.embeddings.planner import plan_inputs, plan_hash
from pipeline.graph.connection import get_session
from pipeline.utils.batching import chunked

CONTEXT_QUERY = """
UNWIND $section_ids AS sid
MATCH (s:Section {id:sid})
CALL (s) {
  MATCH (d:Document)-[:HAS_SECTION]->(s)
  RETURN collect(d) AS documents
}
CALL (s) {
  OPTIONAL MATCH path=(a:Section)-[:PARENT_OF*]->(s)
  WITH a, length(path) AS depth ORDER BY depth DESC, a.id
  RETURN collect({id:a.id, title:a.title}) AS ancestors
}
RETURN s.id AS section_id, s.content_text AS body, s.title AS section_title,
       s.embedding_source_epoch AS source_epoch,
       [d IN documents | {id:d.id, title:d.title, family:d.document_type}] AS documents,
       ancestors
ORDER BY section_id
"""


# The sections an embedding run plans and a coverage check counts. An archive
# family is left out of both: it is searched only by name, lexically. A section
# with no document still comes through, so the scan below rejects it.
EMBEDDED_SECTION_IDS_QUERY = """
MATCH (s:Section)
OPTIONAL MATCH (d:Document)-[:HAS_SECTION]->(s)
WITH s, collect(d.document_type) AS families
WHERE none(family IN families WHERE family IN $unembedded)
RETURN s.id AS id ORDER BY s.id
"""


def validate_plan_topology() -> None:
    with get_session(default_access_mode="READ") as session:
        row = session.run("""
        MATCH (s:Section) OPTIONAL MATCH (p:Section)-[:PARENT_OF]->(s)
        WITH s, count(p) AS parents
        WHERE s.id IS NULL OR s.id='' OR parents > 1
        RETURN count(s) AS invalid
        """).single()
        if row and row["invalid"]:
            raise ValueError("Invalid embedding identities or ambiguous embedding ancestors")
        row = session.run("""
        MATCH (ch:Chunk) OPTIONAL MATCH (s:Section)-[:HAS_CHUNK]->(ch)
        WITH ch, count(s) AS owners WHERE owners <> 1
        RETURN count(ch) AS invalid
        """).single()
        if row and row["invalid"]:
            raise ValueError("Invalid chunk ownership")


def iter_sections(section_ids=None, *, session_factory=None) -> Iterator[dict]:
    """Read IDs first, then at most ten bodies with one-record driver fetches."""
    session_factory = session_factory or get_session
    if section_ids is None:
        validate_plan_topology()
        with session_factory(default_access_mode="READ") as session:
            section_ids = [r["id"] for r in session.run(
                EMBEDDED_SECTION_IDS_QUERY, unembedded=sorted(ARCHIVE_SOURCE_TYPES)
            )]
    for ids in chunked(section_ids, 10):
        with session_factory(default_access_mode="READ", fetch_size=1) as session:
            seen = set()
            for raw in session.run(CONTEXT_QUERY, section_ids=ids):
                row = dict(raw)
                sid = row["section_id"]
                if not sid or sid in seen or len(row["documents"]) != 1:
                    raise ValueError(f"Ambiguous embedding document: {sid}")
                seen.add(sid)
                ancestors = [a for a in row.pop("ancestors") if a["id"] is not None]
                ancestor_ids = [a["id"] for a in ancestors]
                if sid in ancestor_ids or len(set(ancestor_ids)) != len(ancestor_ids):
                    raise ValueError(f"Cyclic or ambiguous embedding ancestors: {sid}")
                doc = row.pop("documents")[0]
                titles = [doc["title"], *(a["title"] for a in ancestors), row["section_title"]]
                row.update(heading=" > ".join(t for t in titles if t),
                           document_id=doc["id"], source_family=doc["family"])
                row["body"] = row["body"] or ""
                yield row
            if seen != set(ids):
                raise ValueError("Embedding section scan incomplete")


def valid_vector(vector, dimensions):
    return (isinstance(vector, list) and len(vector) == dimensions
            and all(isinstance(v, (int, float)) and not isinstance(v, bool)
                    and math.isfinite(v) for v in vector)
            and any(v != 0 for v in vector))


def stored_plan(tx, section_id):
    return [dict(r) for r in tx.run("""
    MATCH (s:Section {id:$sid})
    RETURN s.id AS id, 'section' AS kind, null AS text,
           null AS input_hash, null AS body_start, null AS body_end, null AS chunk_index,
           s.embedding_plan_hash AS plan, s.embedding_plan_source_epoch AS epoch,
           s.embedding_input_count AS input_count, s.embedding AS vector
    UNION ALL
    MATCH (s:Section {id:$sid})-[:HAS_CHUNK]->(ch:Chunk)
    RETURN ch.id AS id, 'chunk' AS kind, ch.content_text AS text,
           ch.input_hash AS input_hash, ch.body_start AS body_start, ch.body_end AS body_end, ch.chunk_index AS chunk_index,
           ch.embedding_plan_hash AS plan, ch.embedding_plan_source_epoch AS epoch,
           null AS input_count, ch.embedding AS vector
    """, sid=section_id)]


def plan_matches(section_id, inputs, digest, epoch, stored):
    """Compare complete metadata and text, independently of stored vector presence."""
    sections = [r for r in stored if r['kind'] == 'section']
    chunks = [r for r in stored if r['kind'] == 'chunk']
    if len(sections) != 1:
        return False
    section = sections[0]
    if not inputs:
        return not chunks and section['vector'] is None and section['plan'] is None and section['epoch'] is None and section['input_count'] is None
    if (section['plan'] != digest or section['epoch'] != epoch
            or section['input_count'] != len(inputs)):
        return False
    if len(inputs) <= 1:
        return not chunks
    if section['vector'] is not None or len(chunks) != len(inputs):
        return False
    expected = {f'{section_id}:chunk:{i}': (i, item) for i, item in enumerate(inputs)}
    if len({r['id'] for r in chunks}) != len(inputs):
        return False
    for row in chunks:
        planned = expected.get(row['id'])
        if planned is None:
            return False
        index, part = planned
        if (row['chunk_index'] != index or row['plan'] != digest or row['epoch'] != epoch
                or row['text'] != part.text or row['input_hash'] != part.input_hash
                or row['body_start'] != part.body_start or row['body_end'] != part.body_end):
            return False
    return True


def embedding_coverage(model=EMBEDDING_MODEL, dimensions=EMBEDDING_DIMENSIONS):
    validate_plan_topology()
    counts = {'total': 0, 'covered': 0, 'direct': 0, 'chunked': 0, 'empty': 0}
    for row in iter_sections():
        sid = row['section_id']
        inputs = list(plan_inputs(row['heading'], row['body'], model))
        with get_session(default_access_mode='READ', fetch_size=1) as session:
            stored = stored_plan(session, sid)
        if not inputs:
            counts['empty'] += 1
            # Any stale plan/vector/chunk on an empty section prevents release.
            if any(r['kind'] == 'chunk' or r['vector'] is not None or r['plan'] is not None or r['epoch'] is not None or r['input_count'] is not None for r in stored):
                counts['total'] += 1
            continue
        counts['total'] += 1
        digest = plan_hash(inputs, model, dimensions)
        if not row['source_epoch'] or not plan_matches(sid, inputs, digest, row['source_epoch'], stored):
            continue
        vectors = [r['vector'] for r in stored if len(inputs) == 1 or r['kind'] == 'chunk']
        if all(valid_vector(v, dimensions) for v in vectors):
            counts['covered'] += 1
            counts['direct' if len(inputs) == 1 else 'chunked'] += 1
    return counts
