"""Neo4j vector/fulltext index creation and hybrid search for sections."""

from pipeline.config import EMBEDDING_DIMENSIONS
from pipeline.graph.connection import get_session

DEFAULT_DOCUMENT_TYPE_GROUPS = [
    ["clinical_policy"],
    ["dhhs_policy"],
    ["federal_regulation", "federal_statute", "bulletin", "state_plan_amendment", "waiver", "provider_manual"],
]
CONCEPT_MATCH_SCORE = 0.70
FULLTEXT_BOOST = 0.05  # Score boost for sections found by both vector and fulltext
_LUCENE_SPECIAL = str.maketrans({c: f'\\{c}' for c in r'+-&|!(){}[]^"~*?:\/'})


def _escape_lucene(query: str) -> str:
    """Escape Lucene special characters for Neo4j fulltext queries."""
    return query.translate(_LUCENE_SPECIAL)


def ensure_vector_index():
    """Create vector, chunk, and fulltext indexes if they don't exist."""
    with get_session() as session:
        session.run(f"""
            CREATE VECTOR INDEX section_embeddings IF NOT EXISTS
            FOR (s:Section) ON (s.embedding)
            OPTIONS {{
                indexConfig: {{
                    `vector.dimensions`: {EMBEDDING_DIMENSIONS},
                    `vector.similarity_function`: 'cosine'
                }}
            }}
        """)
        session.run(f"""
            CREATE VECTOR INDEX chunk_embeddings IF NOT EXISTS
            FOR (ch:Chunk) ON (ch.embedding)
            OPTIONS {{
                indexConfig: {{
                    `vector.dimensions`: {EMBEDDING_DIMENSIONS},
                    `vector.similarity_function`: 'cosine'
                }}
            }}
        """)
        session.run(
            "CREATE FULLTEXT INDEX section_fulltext IF NOT EXISTS "
            "FOR (s:Section) ON EACH [s.title, s.content_text]"
        )


def fulltext_search(
    query_text: str,
    top_k: int = 20,
    document_types: list[str] | None = None,
) -> list[dict]:
    """Search sections using the Neo4j fulltext index on title + content_text."""
    type_groups = [document_types] if document_types else DEFAULT_DOCUMENT_TYPE_GROUPS
    per_group_k = top_k if document_types else max(top_k, 10)

    escaped_query = _escape_lucene(query_text)
    if not escaped_query.strip():
        return []

    all_rows: list[dict] = []
    with get_session() as session:
        for doc_types in type_groups:
            results = session.run("""
                CALL db.index.fulltext.queryNodes('section_fulltext', $query)
                YIELD node AS section, score
                MATCH (section)<-[:HAS_SECTION]-(doc:Document)
                WHERE section.content_length > 0
                  AND doc.document_type IN $doc_types
                RETURN doc.title AS doc_title, doc.policy_number AS policy_number,
                       doc.document_type AS document_type,
                       section.id AS section_id,
                       section.section_number AS section_number,
                       section.title AS section_title,
                       section.content_text AS content,
                       score
                ORDER BY score DESC
                LIMIT $k
            """, {"query": escaped_query, "k": per_group_k, "doc_types": doc_types})
            all_rows.extend(dict(r) for r in results)

    return all_rows


def vector_search(
    query_embedding: list[float],
    top_k: int = 10,
    document_types: list[str] | None = None,
    query_text: str | None = None,
) -> list[dict]:
    """Hybrid search: vector similarity as primary signal, augmented with
    fulltext keyword matches that vector search missed.

    Vector/chunk/concept results keep their cosine similarity scores (the
    primary ranking signal). Fulltext results that aren't already in the
    vector set are appended with a synthetic score to fill remaining slots.

    Args:
        query_embedding: The query vector.
        top_k: Maximum number of results to return.
        document_types: Restrict results to these document types.
        query_text: Original query string (enables fulltext + concept search).
    """
    def add_rows(rows: list[dict], best: dict[str, dict]) -> None:
        for row in rows:
            sid = row["section_id"]
            if sid not in best or row["score"] > best[sid]["score"]:
                best[sid] = row

    type_filter = "WHERE doc.document_type IN $document_types" if document_types else ""
    type_groups = [document_types] if document_types else DEFAULT_DOCUMENT_TYPE_GROUPS
    per_group_k = top_k if document_types else max(top_k, 10)

    best: dict[str, dict] = {}

    with get_session() as session:
        # 1. Section embeddings — per type group (primary signal)
        for doc_types in type_groups:
            section_results = session.run(
                """
                CALL db.index.vector.queryNodes('section_embeddings', $k, $embedding)
                YIELD node AS section, score
                MATCH (section)<-[:HAS_SECTION]-(doc:Document)
                WHERE section.content_length > 0
                  AND doc.document_type IN $doc_types
                RETURN doc.title AS doc_title, doc.policy_number AS policy_number,
                       doc.document_type AS document_type,
                       section.id AS section_id,
                       section.section_number AS section_number,
                       section.title AS section_title,
                       section.content_text AS content,
                       score
                ORDER BY score DESC
                LIMIT $k
                """,
                {"k": per_group_k, "embedding": query_embedding, "doc_types": doc_types},
            )
            add_rows([dict(r) for r in section_results], best)

        # 2. Chunk embeddings — per type group
        for doc_types in type_groups:
            chunk_results = session.run("""
                CALL db.index.vector.queryNodes('chunk_embeddings', $k, $embedding)
                YIELD node AS chunk, score
                MATCH (section:Section)-[:HAS_CHUNK]->(chunk)
                MATCH (section)<-[:HAS_SECTION]-(doc:Document)
                WHERE doc.document_type IN $doc_types
                RETURN doc.title AS doc_title, doc.policy_number AS policy_number,
                       doc.document_type AS document_type,
                       section.id AS section_id,
                       section.section_number AS section_number,
                       section.title AS section_title,
                       section.content_text AS content,
                       score
                ORDER BY score DESC
                LIMIT $k
            """, {"k": per_group_k, "embedding": query_embedding, "doc_types": doc_types})
            add_rows([dict(r) for r in chunk_results], best)

        # 3. Concept graph matching
        if query_text:
            try:
                concept_results = session.run(
                    f"""
                    MATCH (c:PolicyConcept)
                    WHERE toLower($query) CONTAINS toLower(c.name)
                       OR ANY(alias IN c.aliases WHERE toLower($query) CONTAINS toLower(alias))
                    WITH c LIMIT 2
                    MATCH (section:Section)-[:COVERS|DEFINES|RESTRICTS]->(c)
                    MATCH (section)<-[:HAS_SECTION]-(doc:Document)
                    WHERE section.content_length > 200
                      AND section.section_number IS NOT NULL
                    {type_filter if document_types else ''}
                    RETURN doc.title AS doc_title, doc.policy_number AS policy_number,
                           doc.document_type AS document_type,
                           section.id AS section_id,
                           section.section_number AS section_number,
                           section.title AS section_title,
                           section.content_text AS content,
                           {CONCEPT_MATCH_SCORE} AS score
                    ORDER BY section.content_length DESC
                    LIMIT $k
                    """,
                    {
                        "k": min(top_k, 5),
                        "query": query_text,
                        "document_types": document_types,
                    },
                )
                add_rows([dict(r) for r in concept_results], best)
            except Exception:
                pass

    # 4. Fulltext augmentation: boost vector results that also appear in
    # fulltext (keyword confirmation), and add keyword-only matches to fill
    # remaining slots.
    if query_text:
        try:
            ft_rows = fulltext_search(query_text, top_k=per_group_k, document_types=document_types)
            ft_ids = {row["section_id"] for row in ft_rows}

            # Boost: vector results confirmed by fulltext get a score bump
            for sid in ft_ids:
                if sid in best:
                    best[sid]["score"] += FULLTEXT_BOOST

            # Fill: fulltext-only results get a synthetic score just below vector floor
            min_score = min((r["score"] for r in best.values()), default=0.5) if best else 0.5
            for i, row in enumerate(ft_rows):
                sid = row["section_id"]
                if sid not in best:
                    row["score"] = max(min_score - 0.01 * (i + 1), 0.01)
                    best[sid] = row
        except Exception:
            pass

    merged = sorted(best.values(), key=lambda r: r["score"], reverse=True)
    return merged[:top_k]
