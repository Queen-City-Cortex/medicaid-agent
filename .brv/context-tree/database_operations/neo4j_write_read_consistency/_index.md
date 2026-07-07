---
children_hash: 5d7c3a999c5dfc38f7534ab0736baa5a7f236854f569683a77b8b5694a1b5730
compression_ratio: 0.25695364238410595
condensation_order: 1
covers: [context.md, corpus_graph_writer_incremental_cleanup.abstract.md, corpus_graph_writer_incremental_cleanup.md, corpus_graph_writer_incremental_cleanup.overview.md, corpusgraphwriter_write_boundary.md, incremental_crawl_ingest_run_19.md, neo4j_session_and_corpus_writer_boundary.md]
covers_token_total: 3775
summary_level: d1
token_count: 970
type: summary
---
# neo4j_write_read_consistency

## Structural Overview
This topic captures the Neo4j boundary design for the pipeline: `connection.py` owns session acquisition and the module-global driver lifecycle, while `corpus_writer.py` owns all graph mutations through `CorpusGraphWriter`. The core pattern is a managed write boundary using `session.execute_write(...)`, with MERGE-based, doc-scoped cleanup that makes retries safe and reruns idempotent.

## Main Subtopics

### Neo4j Session and Corpus Writer Boundary
See **neo4j_session_and_corpus_writer_boundary.md** for the top-level architecture of `connection.py` and `corpus_writer.py`.

- `get_session()` is the single Neo4j access choke point.
- `get_driver()` / `close_driver()` manage a module-singleton driver lifecycle.
- Multi-statement mutations must run inside managed transactions, not ad hoc auto-commit calls.
- Loader stages route through `graph_writer` instead of calling `get_session()` directly.

### Corpus Graph Writer Incremental Cleanup
See **corpus_graph_writer_incremental_cleanup.md** and **corpus_graph_writer_incremental_cleanup.overview.md** for write-path cleanup behavior.

- `CorpusGraphWriter` is the single write-side boundary for corpus graph mutations.
- Document bundle flow:
  - merge document
  - write sections
  - delete stale sections
  - clear changed embeddings/chunks
  - merge relationships
- Cleanup is surgical:
  - stale sections are removed
  - unchanged sections keep embeddings and chunks
  - only changed sections are invalidated
- Section writes are batched with `GRAPH_BATCH_SIZE`.

### CorpusGraphWriter Write Boundary
See **corpusgraphwriter_write_boundary.md** for the managed transaction and retry model.

- Public write methods now route through `session.execute_write(work_fn)`.
- Each public method builds a `_work(tx)` closure.
- Managed transactions provide commit/rollback behavior and transient retry handling.
- Tests cover success, rollback, retry, and cleanup behavior using `FakeSession.execute_write`.

### Incremental Crawl Ingest Run 19
See **incremental_crawl_ingest_run_19.md** for the operational ingest example tied to this write boundary.

- Crawl run #19 ingested 34 targeted docs into Railway prod using voyage-4.
- Production corpus grew from 6693 to 6725 docs.
- 1533 sections were added with no missing embeddings.
- Retrieval verification succeeded for MA-3234 Expanded Foster Care at 0.86 cosine.
- A key operational rule is to avoid fee_schedule byte-churn by selecting only real incremental candidates.

## Cross-Cutting Patterns

- **Single access boundary**: `get_session()` is the choke point for Neo4j access.
- **Single write boundary**: `CorpusGraphWriter` centralizes all graph mutations.
- **Managed transaction semantics**: `session.execute_write(...)` preserves atomicity and retries transient failures.
- **Idempotent cleanup**: deterministic MERGE-based writes plus doc-scoped cleanup make reruns safe.
- **Selective re-embed**: unchanged sections are preserved; only changed sections lose embeddings/chunks.
- **Relationship specialization**: separate merge paths exist for:
  - references
  - amendments
  - supersessions
  - concept links

## Key Dependencies
- `pipeline.config` for `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`, and `GRAPH_BATCH_SIZE`
- Neo4j managed transaction semantics
- query constants / Cypher statements in the pipeline’s queries module
- pipeline loaders that route through `CorpusGraphWriter`

## Drill-Down Map
- **neo4j_session_and_corpus_writer_boundary.md** — overall session and writer architecture
- **corpus_graph_writer_incremental_cleanup.md** — incremental cleanup and rerun safety
- **corpusgraphwriter_write_boundary.md** — managed write boundary, retries, and test behavior
- **incremental_crawl_ingest_run_19.md** — real ingest run illustrating the operational consequences