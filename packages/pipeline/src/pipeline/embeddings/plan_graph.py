"""Shared contextual graph reads and exact embedding-plan coverage checks."""

from collections.abc import Iterator
import math

from pipeline.config import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL
from pipeline.embeddings.chunker import PlannedInput, plan_inputs
from pipeline.graph.connection import get_session


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
       [d IN documents | {id:d.id, title:d.title, family:d.document_type}] AS documents,
       ancestors
"""


def validate_plan_topology() -> None:
    with get_session() as session:
        row = session.run("""
        MATCH (s:Section) OPTIONAL MATCH (p:Section)-[:PARENT_OF]->(s)
        WITH s, count(p) AS parents WHERE parents > 1
        RETURN s.id AS id LIMIT 1
        """).single()
        if row:
            raise ValueError(f"Ambiguous embedding ancestors: {row['id']}")


def iter_sections() -> Iterator[dict]:
    """Page IDs before fetching bodies; retain at most a driver page of bodies."""
    validate_plan_topology()
    after = ""
    while True:
        with get_session() as session:
            ids = [
                r["id"]
                for r in session.run(
                    """
            MATCH (s:Section) WHERE s.id > $after
            RETURN s.id AS id ORDER BY s.id LIMIT 50
            """,
                    after=after,
                )
            ]
        if not ids:
            return
        with get_session(fetch_size=8) as session:
            rows = session.run(CONTEXT_QUERY, section_ids=ids)
            seen = set()
            for raw in rows:
                row = dict(raw)
                sid = row["section_id"]
                if sid in seen or len(row["documents"]) != 1:
                    raise ValueError(f"Ambiguous embedding document: {sid}")
                seen.add(sid)
                ancestors = [a for a in row["ancestors"] if a["id"] is not None]
                ancestor_ids = [a["id"] for a in ancestors]
                if sid in ancestor_ids or len(set(ancestor_ids)) != len(ancestor_ids):
                    raise ValueError(f"Cyclic embedding ancestors: {sid}")
                doc = row.pop("documents")[0]
                titles = [
                    doc["title"],
                    *(a["title"] for a in ancestors),
                    row["section_title"],
                ]
                row.update(
                    context=" > ".join(t for t in titles if t) + "\n",
                    document_id=doc["id"],
                    source_family=doc["family"],
                )
                row["body"] = row["body"] or ""
                yield row
            if seen != set(ids):
                raise ValueError("Embedding section scan incomplete")
        after = ids[-1]


def input_id(section_id: str, part: PlannedInput) -> str:
    return section_id if part.kind == "section" else f"{section_id}:chunk:{part.index}"


def valid_vector(vector: list | None, dimensions: int) -> bool:
    return (
        isinstance(vector, list)
        and len(vector) == dimensions
        and all(
            isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
            for v in vector
        )
    )


def stored_inputs(section_id: str) -> list[dict]:
    with get_session() as session:
        return [
            dict(r)
            for r in session.run(
                """
        MATCH (s:Section {id:$section_id})
        RETURN s.id AS id, 'section' AS kind, null AS text,
               s.embedding_fingerprint AS fingerprint, s.embedding AS vector
        UNION ALL
        MATCH (s:Section {id:$section_id})-[:HAS_CHUNK]->(ch:Chunk)
        RETURN ch.id AS id, 'chunk' AS kind, ch.content_text AS text,
               ch.embedding_fingerprint AS fingerprint, ch.embedding AS vector
        """,
                section_id=section_id,
            )
        ]


def plan_matches(
    section_id: str,
    parts: list[PlannedInput],
    stored: list[dict],
    model: str,
    dimensions: int,
    *,
    require_vectors: bool,
) -> bool:
    expected = {input_id(section_id, p): p for p in parts}
    actual = [
        r
        for r in stored
        if r["kind"] == "chunk"
        or r["fingerprint"] is not None
        or r["vector"] is not None
    ]
    if len(actual) != len(expected) or {r["id"] for r in actual} != set(expected):
        return False
    for row in actual:
        part = expected[row["id"]]
        if (
            row["kind"] != part.kind
            or row["fingerprint"] != part.fingerprint(model, dimensions)
            or (part.kind == "chunk" and row["text"] != part.text)
            or (require_vectors and not valid_vector(row["vector"], dimensions))
        ):
            return False
    return True


def embedding_coverage(
    model: str = EMBEDDING_MODEL, dimensions: int = EMBEDDING_DIMENSIONS
) -> dict[str, int]:
    counts = {"total": 0, "covered": 0, "direct": 0, "chunked": 0, "empty": 0}
    for row in iter_sections():
        parts = list(plan_inputs(row["body"], row["context"]))
        stored = stored_inputs(row["section_id"])
        if not parts:
            counts["empty"] += 1
            # A vector on an empty section must not count as complete.
            if not plan_matches(
                row["section_id"],
                parts,
                stored,
                model,
                dimensions,
                require_vectors=True,
            ):
                counts["total"] += 1
            continue
        counts["total"] += 1
        if plan_matches(
            row["section_id"], parts, stored, model, dimensions, require_vectors=True
        ):
            counts["covered"] += 1
            counts["direct" if parts[0].kind == "section" else "chunked"] += 1
    with get_session() as session:
        orphan = session.run("""
        MATCH (ch:Chunk) OPTIONAL MATCH (s:Section)-[:HAS_CHUNK]->(ch)
        WITH ch, count(s) AS owners WHERE owners <> 1
        RETURN count(ch) AS invalid
        """).single()
        counts["total"] += int(orphan["invalid"]) if orphan else 0
    return counts
