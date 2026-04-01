"""Neo4j vector index creation and search for section and chunk embeddings."""

from pipeline.config import EMBEDDING_DIMENSIONS
from pipeline.graph.connection import get_session

DEFAULT_DOCUMENT_TYPE_GROUPS = [
    ["clinical_policy"],
    ["dhhs_policy"],
    ["federal_regulation", "federal_statute", "bulletin", "state_plan_amendment", "waiver", "provider_manual"],
]
CONCEPT_MATCH_SCORE = 0.70


def ensure_vector_index():
    """Create vector indexes on Section.embedding and Chunk.embedding if they don't exist."""
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


def vector_search(
    query_embedding: list[float],
    top_k: int = 10,
    document_types: list[str] | None = None,
    query_text: str | None = None,
) -> list[dict]:
    """Search for sections similar to a query embedding.

    Queries both section_embeddings and chunk_embeddings indexes, merges
    results, deduplicates by section (keeping the best score per section),
    and returns the top_k results ordered by score descending.

    Args:
        query_embedding: The query vector.
        top_k: Maximum number of results to return.
        document_types: When provided, restrict results to documents whose
            ``document_type`` is in this list (e.g. ``["dhhs_policy"]``).
    """
    def add_rows(rows: list[dict], best: dict[str, dict]) -> None:
        for row in rows:
            sid = row["section_id"]
            if sid not in best or row["score"] > best[sid]["score"]:
                best[sid] = row

    type_filter = "WHERE doc.document_type IN $document_types" if document_types else ""
    best: dict[str, dict] = {}

    with get_session() as session:
        type_groups = [document_types] if document_types else DEFAULT_DOCUMENT_TYPE_GROUPS
        per_group_k = top_k if document_types else max(top_k, 10)

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

        chunk_results = session.run(f"""
            CALL db.index.vector.queryNodes('chunk_embeddings', $k, $embedding)
            YIELD node AS chunk, score
            MATCH (section:Section)-[:HAS_CHUNK]->(chunk)
            MATCH (section)<-[:HAS_SECTION]-(doc:Document)
            {type_filter}
            RETURN doc.title AS doc_title, doc.policy_number AS policy_number,
                   doc.document_type AS document_type,
                   section.id AS section_id,
                   section.section_number AS section_number,
                   section.title AS section_title,
                   section.content_text AS content,
                   score
            ORDER BY score DESC
        """, {"k": top_k, "embedding": query_embedding, "document_types": document_types})
        add_rows([dict(r) for r in chunk_results], best)

    merged = sorted(best.values(), key=lambda r: r["score"], reverse=True)
    return merged[:top_k]
