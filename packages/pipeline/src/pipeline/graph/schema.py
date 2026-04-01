"""Neo4j schema setup: constraints and indexes."""

from pipeline.graph.connection import get_session


CONSTRAINTS = [
    "CREATE CONSTRAINT doc_id IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE",
    "CREATE CONSTRAINT section_id IF NOT EXISTS FOR (s:Section) REQUIRE s.id IS UNIQUE",
    "CREATE CONSTRAINT concept_id IF NOT EXISTS FOR (c:PolicyConcept) REQUIRE c.id IS UNIQUE",
    "CREATE CONSTRAINT chunk_id IF NOT EXISTS FOR (ch:Chunk) REQUIRE ch.id IS UNIQUE",
]

INDEXES = [
    "CREATE INDEX doc_policy_number IF NOT EXISTS FOR (d:Document) ON (d.policy_number)",
    "CREATE INDEX doc_document_type IF NOT EXISTS FOR (d:Document) ON (d.document_type)",
    "CREATE INDEX doc_status IF NOT EXISTS FOR (d:Document) ON (d.status)",
    "CREATE INDEX section_document_id_section_number IF NOT EXISTS FOR (s:Section) ON (s.document_id, s.section_number)",
]


def ensure_schema():
    """Create constraints and indexes if they don't exist."""
    with get_session() as session:
        for constraint in CONSTRAINTS:
            session.run(constraint)
        for index in INDEXES:
            session.run(index)


def reset_database():
    """Drop all nodes and relationships. Use with caution."""
    with get_session() as session:
        session.run("MATCH (n) DETACH DELETE n")
