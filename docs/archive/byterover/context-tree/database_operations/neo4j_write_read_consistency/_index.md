---
children_hash: 94a16ae2f45c7d7afe58e47ad391380aadb32aa03cb37fa0701a775c461a7f05
compression_ratio: 0.3144935646334639
condensation_order: 1
covers: [context.md, corpus_graph_writer_incremental_cleanup.md, corpusgraphwriter_write_boundary.md, incremental_crawl_ingest_run_19.md, neo4j_session_and_corpus_writer_boundary.md]
covers_token_total: 3574
summary_level: d1
token_count: 1124
type: summary
---
# neo4j_write_read_consistency

## Structural Overview
This topic defines the Neo4j runtime and write boundary for the pipeline: a **single module-global driver/session entrypoint** on the read side, and a **single write-side CorpusGraphWriter boundary** on the mutation side. The core pattern is **managed transactions + deterministic MERGE-based cleanup**, so retries are safe and reruns stay incremental rather than reprocessing everything.

## Main Components

### `context.md`
High-level framing for the domain:
- Covers the **Neo4j connection/session boundary** and the **corpus writer** that owns all graph mutation behavior.
- Key concepts include:
  - module-singleton driver lifecycle
  - context-managed sessions
  - managed write transactions
  - idempotent MERGE-based cleanup
  - document status batching
  - reference, amendment, supersession, and concept-link writes

### `neo4j_session_and_corpus_writer_boundary.md`
Defines the architecture boundary most clearly:
- `connection.py` provides `get_driver()`, `close_driver()`, and `get_session()` around a **module-global Neo4j driver**.
- `CorpusGraphWriter` in `corpus_writer.py` is the **single write-side boundary** for all graph mutations.
- Public loader stages should go through `graph_writer`, not call `get_session()` directly.
- Multi-statement mutations run inside `session.execute_write()`, preserving atomicity and retry safety.
- Dependencies include `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`, and `GRAPH_BATCH_SIZE`.

### `corpusgraphwriter_write_boundary.md`
Focuses on the managed write boundary and transaction semantics:
- Public write methods were migrated from manual transaction handling to `session.execute_write(work_fn)`.
- Each public method builds a `_work(tx)` closure for managed execution.
- `FakeSession.execute_write` was added to test retry, commit, and rollback behavior.
- Writes are **idempotent**, **MERGE-based**, and safe to retry after transient failures.
- Reference edges are batched by type, including:
  - `MERGE_REFERENCES_BATCH`
  - `MERGE_REFERENCES_DOCUMENT_BATCH`
- Tests validate:
  - success paths
  - rollback paths
  - transient retries
  - selective cleanup behavior

### `corpus_graph_writer_incremental_cleanup.md`
Documents the incremental cleanup strategy:
- `CorpusGraphWriter` upserts documents and sections, deletes stale sections, and clears embeddings only for changed sections.
- Cleanup is intentionally **surgical**:
  - stale sections are removed
  - changed sections lose embeddings/chunks
  - unchanged sections retain embeddings/chunks across reruns
- Graph write paths are separated into:
  - reference edges
  - amendment merges
  - supersession merges
  - concept-link merges
- The workflow is:
  - merge document
  - write sections
  - delete stale sections
  - clear changed embeddings
  - merge relationships

### `incremental_crawl_ingest_run_19.md`
Provides an operational example of the boundary in production:
- Crawl run #19 ingested **34 targeted docs** into Railway prod voyage-4.
- Production corpus grew from **6693 to 6725 docs**.
- **1533 sections** were added with no missing embeddings.
- Retrieval was verified for **MA-3234 Expanded Foster Care** at **0.86 cosine**.
- The main operational lesson is to avoid full reprocessing of fee-schedule PDFs due to byte churn; use targeted selection instead.
- Local Docker/Neo4j were down during this ingest, so only production was updated and a later local resync was needed.

## Cross-Cutting Patterns
- **Single access choke point**: `get_session()` is the one Neo4j entrypoint on the read/session side.
- **Single mutation boundary**: `CorpusGraphWriter` owns graph writes, not loader stages.
- **Managed transaction semantics**: `session.execute_write()` handles commit, rollback, and transient retry.
- **Idempotent cleanup**: deterministic MERGE + doc-scoped deletion keeps reruns safe.
- **Incremental re-embedding**: only changed sections lose embeddings/chunks; unchanged sections persist.
- **Batch-oriented writes**: document status and relationship writes are chunked with `GRAPH_BATCH_SIZE`.

## Drill-Down Map
- Session and driver lifecycle: `neo4j_session_and_corpus_writer_boundary.md`
- Managed transaction and retry behavior: `corpusgraphwriter_write_boundary.md`
- Incremental section cleanup and embedding retention: `corpus_graph_writer_incremental_cleanup.md`
- Real-world ingest behavior and operational constraints: `incremental_crawl_ingest_run_19.md`