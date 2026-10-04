"""Neo4j schema setup: constraints and indexes."""

from pipeline.graph.connection import get_session


CONSTRAINTS = [
    "CREATE CONSTRAINT corpus_mutation_lock_id IF NOT EXISTS FOR (lock:CorpusMutationLock) REQUIRE lock.id IS UNIQUE",
    "CREATE CONSTRAINT doc_id IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE",
    "CREATE CONSTRAINT section_id IF NOT EXISTS FOR (s:Section) REQUIRE s.id IS UNIQUE",
    "CREATE CONSTRAINT concept_id IF NOT EXISTS FOR (c:PolicyConcept) REQUIRE c.id IS UNIQUE",
    "CREATE CONSTRAINT chunk_id IF NOT EXISTS FOR (ch:Chunk) REQUIRE ch.id IS UNIQUE",
]

INDEXES = [
    "CREATE INDEX doc_policy_number IF NOT EXISTS FOR (d:Document) ON (d.policy_number)",
    "CREATE INDEX doc_document_type IF NOT EXISTS FOR (d:Document) ON (d.document_type)",
    "CREATE INDEX doc_status IF NOT EXISTS FOR (d:Document) ON (d.status)",
    "CREATE INDEX doc_authority_tier IF NOT EXISTS FOR (d:Document) ON (d.authority_tier)",
    "CREATE INDEX doc_answer_ready IF NOT EXISTS FOR (d:Document) ON (d.answer_ready)",
    "CREATE INDEX doc_corpus_bucket IF NOT EXISTS FOR (d:Document) ON (d.corpus_bucket)",
    "CREATE INDEX doc_variant_group IF NOT EXISTS FOR (d:Document) ON (d.variant_group)",
    "CREATE INDEX doc_retrieval_ready IF NOT EXISTS FOR (d:Document) ON (d.retrieval_ready)",
    "CREATE INDEX section_document_id_section_number IF NOT EXISTS FOR (s:Section) ON (s.document_id, s.section_number)",
    "CREATE FULLTEXT INDEX section_fulltext IF NOT EXISTS FOR (s:Section) ON EACH [s.title, s.content_text]",
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
