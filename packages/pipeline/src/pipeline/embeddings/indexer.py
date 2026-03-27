"""Neo4j vector index creation for section embeddings."""

from pipeline.config import EMBEDDING_DIMENSIONS
from pipeline.graph.connection import get_session


def ensure_vector_index():
    """Create the vector index on Section.embedding if it doesn't exist."""
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


def vector_search(query_embedding: list[float], top_k: int = 10) -> list[dict]:
    """Search for sections similar to a query embedding."""
    with get_session() as session:
        result = session.run("""
            CALL db.index.vector.queryNodes('section_embeddings', $k, $embedding)
            YIELD node AS section, score
            MATCH (section)<-[:HAS_SECTION]-(doc:Document)
            RETURN doc.title AS doc_title, doc.policy_number AS policy_number,
                   section.section_number AS section_number,
                   section.title AS section_title,
                   section.content_text AS content,
                   score
            ORDER BY score DESC
        """, {"k": top_k, "embedding": query_embedding})
        return [dict(r) for r in result]
