"""Neo4j vector/fulltext index creation for policy sections."""

from pipeline.config import EMBEDDING_DIMENSIONS
from pipeline.graph.connection import get_session


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
