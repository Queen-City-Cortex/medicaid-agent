---
title: CorpusGraphWriter Write Boundary
tags: []
related: [database_operations/neo4j_write_read_consistency/incremental_crawl_ingest_run_19.md, database_operations/neo4j_write_read_consistency/corpus_graph_writer_incremental_cleanup.md]
keywords: []
importance: 55
recency: 1
maturity: draft
updateCount: 1
createdAt: '2026-06-17T19:22:50.364Z'
updatedAt: '2026-06-17T20:14:22.095Z'
---
## Raw Concept
**Task:**
Document the CorpusGraphWriter managed write boundary and section cleanup flow.

**Changes:**
- Migrated public write methods to session.execute_write(work_fn)
- Added transient retry handling for the managed write boundary
- Preserved embeddings for unchanged sections while clearing only changed sections
- Added FakeSession.execute_write support for retry/commit/rollback testing

**Files:**
- packages/pipeline/src/pipeline/graph/corpus_writer.py
- packages/pipeline/tests/test_corpus_writer.py

**Flow:**
public write method -> build _work(tx) closure -> session.execute_write -> commit or rollback/retry -> section cleanup and re-merge

**Timestamp:** 2026-06-17

**Patterns:**
- `session.execute_write(work_fn)` - Managed write boundary used for public write methods
- `MERGE_REFERENCES_BATCH|MERGE_REFERENCES_DOCUMENT_BATCH` (flags: i) - Reference edge batching by type

## Narrative
### Structure
CorpusGraphWriter public write methods now all route through a managed Neo4j write boundary. The implementation builds per-method _work(tx) closures, and helper methods accept a ManagedTransaction so the unit of work can be retried safely.

### Dependencies
Relies on Neo4j managed transaction semantics and on deterministic MERGE-based writes with document-scoped cleanup.

### Highlights
Section cleanup is selective: only changed sections lose embeddings and chunks, while unchanged sections retain them. The test fake session records attempts, commits, rollbacks, and calls, and the test suite validates success, rollback, transient retry, and cleanup behavior.

### Rules
Only sections whose content actually changed lose their embeddings and chunks. Unchanged sections keep them, so re-running the loader does not force a full corpus re-embed.

### Examples
merge_reference_edges splits edges by type, sending REFERENCES to MERGE_REFERENCES_BATCH and REFERENCES_DOCUMENT to MERGE_REFERENCES_DOCUMENT_BATCH. test_upsert_document_bundle_retries_unit_of_work_then_commits expects attempts == 2, rollbacks == 1, and commits == 1 after one transient failure.

## Facts
- **write_boundary**: CorpusGraphWriter migrated from explicit session.begin_transaction()/tx.commit() to managed session.execute_write(work_fn). [project]
- **execute_write_semantics**: execute_write commits on success and rolls back on exception. [project]
- **execute_write_retries**: execute_write auto-retries transient errors such as leader switch, deadlock, and dropped connection. [project]
- **write_idempotency**: All writes are MERGE-based with deterministic, doc-scoped cleanup, making work functions idempotent and safe to rerun. [project]
- **section_cleanup_policy**: Only sections whose content actually changed lose embeddings and chunks; unchanged sections keep them. [project]
- **test_suite_result**: The full pipeline test suite passed 301 with 2 skipped after this change; the corpus_writer test file itself has 10 tests. [project]
