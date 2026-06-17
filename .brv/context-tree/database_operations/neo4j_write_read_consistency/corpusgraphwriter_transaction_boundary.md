---
title: CorpusGraphWriter Transaction Boundary
tags: []
keywords: []
importance: 55
recency: 1
maturity: draft
updateCount: 1
createdAt: '2026-06-17T18:58:32.897Z'
updatedAt: '2026-06-17T18:59:54.163Z'
---
## Raw Concept
**Task:**
Document the transaction boundary fix for CorpusGraphWriter and its test coverage.

**Changes:**
- Moved public write operations to explicit Neo4j transactions
- Made cleanup plus rewrite atomic
- Updated helper methods to accept a Neo4j Transaction instead of a Session
- Added rollback and commit tests for the write boundary

**Files:**
- packages/pipeline/tests/test_corpus_writer.py

**Flow:**
open session -> begin transaction -> merge document -> fetch existing section content -> cleanup stale structure -> merge sections -> recreate links -> commit once

**Timestamp:** 2026-06-17

**Patterns:**
- `with session.begin_transaction() as tx: ... tx.commit()` - Explicit transaction wrapper used for all public writes

## Narrative
### Structure
CorpusGraphWriter now routes upserts, reference edges, amendments, supersessions, concept links, and status updates through transaction-aware helpers. Section writes compute changed sections before cleanup so only modified sections lose embeddings and chunks.

### Dependencies
Relies on Neo4j transactions instead of session auto-commit semantics. Tests use a FakeSession with begin_transaction, commit, and rollback tracking to verify behavior.

### Highlights
Cleanup and rewrite are atomic, stale structure removal no longer leaves partially deleted documents on failure, and unchanged sections keep embeddings across reruns. The test suite validates batch query ordering, selective embedding clearing, and rollback on failure.

### Rules
Helper methods now accept a Neo4j Transaction instead of a Session. Cleanup + rewrite are atomic; if no commit happens, the transaction rolls back automatically.

### Examples
If MERGE_SECTIONS_BATCH fails, the transaction rolls back and destructive cleanup is not durable. If only sec:1 changes, only sec:1 is cleared from embeddings.

## Facts
- **corpus_graph_writer_transaction_model**: CorpusGraphWriter wraps every public write in an explicit Neo4j transaction using with session.begin_transaction() as tx: ... tx.commit() instead of auto-commit session.run. [project]
- **cleanup_atomicity_risk**: Cleanup operations previously could commit before the re-MERGE, which could leave a half-wiped document if the write crashed mid-operation. [project]
- **cleanup_rewrite_atomicity**: Cleanup plus rewrite are now atomic, and if no commit happens the transaction rolls back automatically. [project]
- **embedding_clear_strategy**: Changed-content-only embedding clearing is preserved. [project]
- **idempotent_rerun_behavior**: Re-run idempotency is preserved. [project]
- **test_suite_result**: Suite result was 300 passed and 2 skipped. [project]
