"""Neo4j vector index creation and search for section and chunk embeddings."""

from pipeline.config import EMBEDDING_DIMENSIONS
from pipeline.graph.connection import get_session


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


def vector_search(query_embedding: list[float], top_k: int = 10) -> list[dict]:
    """Search for sections similar to a query embedding.

    Queries both section_embeddings and chunk_embeddings indexes, merges
    results, deduplicates by section (keeping the best score per section),
    and returns the top_k results ordered by score descending.
    """
    with get_session() as session:
        # Search section index
        section_results = session.run("""
            CALL db.index.vector.queryNodes('section_embeddings', $k, $embedding)
            YIELD node AS section, score
            MATCH (section)<-[:HAS_SECTION]-(doc:Document)
            RETURN doc.title AS doc_title, doc.policy_number AS policy_number,
                   section.id AS section_id,
                   section.section_number AS section_number,
                   section.title AS section_title,
                   section.content_text AS content,
                   score
            ORDER BY score DESC
        """, {"k": top_k, "embedding": query_embedding})
        section_rows = [dict(r) for r in section_results]

        # Search chunk index
        chunk_results = session.run("""
            CALL db.index.vector.queryNodes('chunk_embeddings', $k, $embedding)
            YIELD node AS chunk, score
            MATCH (section:Section)-[:HAS_CHUNK]->(chunk)
            MATCH (section)<-[:HAS_SECTION]-(doc:Document)
            RETURN doc.title AS doc_title, doc.policy_number AS policy_number,
                   section.id AS section_id,
                   section.section_number AS section_number,
                   section.title AS section_title,
                   section.content_text AS content,
                   score
            ORDER BY score DESC
        """, {"k": top_k, "embedding": query_embedding})
        chunk_rows = [dict(r) for r in chunk_results]

    # Merge and deduplicate: keep best score per section_id
    best: dict[str, dict] = {}
    for row in section_rows + chunk_rows:
        sid = row["section_id"]
        if sid not in best or row["score"] > best[sid]["score"]:
            best[sid] = row

    # Sort by score and return top_k
    merged = sorted(best.values(), key=lambda r: r["score"], reverse=True)
    return merged[:top_k]
