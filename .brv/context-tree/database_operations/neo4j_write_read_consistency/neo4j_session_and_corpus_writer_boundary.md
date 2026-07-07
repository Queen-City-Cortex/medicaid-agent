---
title: Neo4j Session and Corpus Writer Boundary
tags: []
related: [database_operations/neo4j_write_read_consistency/context.md, database_operations/neo4j_auth/context.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-06T00:34:26.975Z'
updatedAt: '2026-07-06T00:34:26.975Z'
---
## Raw Concept
**Task:**
Document the Neo4j session boundary and the corpus graph write boundary for the pipeline.

**Changes:**
- Identified get_session() as the single Neo4j access choke point
- Documented CorpusGraphWriter as the single write-side boundary
- Captured managed transaction behavior, retry semantics, and idempotent cleanup

**Files:**
- packages/pipeline/src/pipeline/graph/connection.py
- packages/pipeline/src/pipeline/graph/corpus_writer.py

**Flow:**
pipeline stage -> get_session() -> session.execute_write() -> MERGE/cleanup statements -> Neo4j

**Timestamp:** 2026-07-06

**Patterns:**
- `^session\.execute_write\(` - Managed write transaction entrypoint
- `^@contextmanager$` - Context-managed session acquisition

## Narrative
### Structure
connection.py exposes get_driver(), close_driver(), and get_session() around a module-global Neo4j driver. corpus_writer.py centralizes all graph mutations in CorpusGraphWriter, which batches Cypher statements and owns section cleanup, document status updates, reference edges, amendments, supersessions, and concept links.

### Dependencies
Depends on pipeline.config for NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE, and GRAPH_BATCH_SIZE. Depends on Neo4j managed transactions and the queries module for all Cypher statements.

### Highlights
Atomicity is preserved because multi-statement mutations run inside one managed transaction. Resilience comes from execute_write retrying transient failures, while deterministic MERGE-based cleanup keeps retries idempotent. The DB is the interface between pipeline stages rather than in-memory handoff.

### Rules
1. A multi-statement mutation must run in a managed transaction, not auto-commit session.run calls.
2. Writes must be safe to retry after transient failures.
3. Section cleanup is doc-scoped and only changed sections lose embeddings and chunks.
4. Loader stages should go through graph_writer rather than calling get_session() directly.

### Examples
Example write flow: upsert_document_bundle() -> MERGE_DOCUMENT -> _write_sections() -> cleanup stale sections -> MERGE_SECTIONS_BATCH -> MERGE_HAS_SECTION_BATCH -> parent/sibling relationship batches. Example section cleanup: DELETE_STALE_DOCUMENT_SECTIONS, CLEAR_DOCUMENT_SECTION_STRUCTURE, and CLEAR_SECTION_CHUNKS_AND_EMBEDDINGS_BATCH for changed sections.

## Facts
- **neo4j_access_choke_point**: get_session() in packages/pipeline/src/pipeline/graph/connection.py is the single Neo4j access choke point for the pipeline. [project]
- **neo4j_driver_lifecycle**: The pipeline uses a module-singleton Neo4j driver created by get_driver() and closed by close_driver(). [project]
- **neo4j_database**: get_session() opens sessions with database=NEO4J_DATABASE. [project]
- **write_strategy**: CorpusGraphWriter wraps writes in session.execute_write for atomicity and transient-failure retries. [project]
- **loader_boundary**: graph/loader.py and federal/loader.py do not call get_session() directly; they route through graph_writer from corpus_writer.py. [project]
- **idempotent_writes**: The writer uses MERGE-based, doc-scoped cleanup so retrying a rolled-back attempt produces the same end state. [project]
