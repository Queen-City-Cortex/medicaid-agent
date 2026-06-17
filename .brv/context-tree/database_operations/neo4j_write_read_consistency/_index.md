---
children_hash: f5be9d21ed896d47b6cb1d2eba490252004cdeff40e8ba36bea49c3e2751ad4f
compression_ratio: 0.4240041928721174
condensation_order: 1
covers: [corpus_graph_writer_incremental_cleanup.abstract.md, corpus_graph_writer_incremental_cleanup.md, corpus_graph_writer_incremental_cleanup.overview.md, incremental_crawl_ingest_run_19.md]
covers_token_total: 1908
summary_level: d1
token_count: 809
type: summary
---
## Incremental Graph Ingest and Cleanup

This set of entries describes two tightly related pipeline behaviors: **incremental graph cleanup during corpus writes** and **surgical incremental ingest for crawl run #19**. Together they show a write path and ingest path optimized to avoid unnecessary reprocessing, re-embedding, and graph churn.

### 1) Corpus write boundary and incremental section cleanup
See **`corpus_graph_writer_incremental_cleanup.md`**, **`.abstract.md`**, and **`.overview.md`**.

- **`CorpusGraphWriter`** is the single write-side boundary for Neo4j corpus graph mutations.
- It centralizes:
  - document bundle upserts
  - section writes
  - relationship merges
  - status updates
- The write flow is:
  - merge document
  - write sections
  - delete stale sections
  - clear embeddings for changed sections only
  - merge relationships
- Cleanup is **surgical**, not full rebuild:
  - stale sections are removed
  - unchanged sections keep embeddings and chunks
  - only changed sections are invalidated for re-embedding
- Relationship handling is split into distinct merge paths:
  - **references** / **REFERENCES_DOCUMENT**
  - **amendments**
  - **supersessions**
  - **concept links** such as **COVERS**, **DEFINES**, **RESTRICTS**
- Operational guardrails:
  - use one write-side boundary
  - delete stale sections before re-merging
  - batch writes using `GRAPH_BATCH_SIZE`
  - preserve rerun safety so repeated loads do not trigger full re-embeds
- Core dependency set:
  - Neo4j sessions
  - batch chunking
  - query constants for document/section/relationship merges

### 2) Incremental crawl ingest run #19
See **`incremental_crawl_ingest_run_19.md`**.

- Documents an ingest run into **Railway prod voyage-4**.
- The run ingested **34 targeted docs** rather than reprocessing the full crawl output.
- Corpus growth:
  - production doc count increased from **6693 to 6725**
  - **1533 sections** were added
  - no missing embeddings were found
- Retrieval verification succeeded for **MA-3234 Expanded Foster Care** at **0.86 cosine**.
- Main operational lesson:
  - naive full parsing of changed files can reprocess about **1850 fee schedule PDFs** due to byte churn even when content is unchanged
  - targeted selection avoids that churn and limits ingestion to real candidates
- Selection logic uses filters such as:
  - `status='downloaded'`
  - `last_changed_at>=run_start`
  - `first_seen_at>=run_start`
  - with special handling for `source_type!=fee_schedule`
- Pipeline notes:
  - parse documents in-process with a shared converter to avoid reloading Docling models per file
  - avoid multiprocessing spawn from stdin/heredoc
  - `load_document(parsed_json_path, source_type)` is the surgical prod load path over the TCP proxy
- Environment constraint:
  - local Docker/Neo4j was down during the run, so only prod was updated
  - local resync is still needed later

### Cross-cutting relationship
- The ingest entry reinforces the same design principle as the writer entry: **incremental, selective mutation**.
- `CorpusGraphWriter` provides the durable write boundary and cleanup rules; crawl run #19 shows how those rules support efficient production updates without full corpus reprocessing.