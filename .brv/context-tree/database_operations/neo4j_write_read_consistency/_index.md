---
children_hash: b6010c5c91fda6a0f90bf4333802a0840ed2a7a721840afaa5d830e6e22a24c6
compression_ratio: 0.33569460842188115
condensation_order: 1
covers: [corpus_graph_writer_incremental_cleanup.md, corpusgraphwriter_write_boundary.md, incremental_crawl_ingest_run_19.md]
covers_token_total: 2541
summary_level: d1
token_count: 853
type: summary
---
## Corpus Graph Writer and Incremental Ingest

These entries describe the write-side behavior of `CorpusGraphWriter` and how it supports surgical incremental reprocessing during crawl ingest runs. The common theme is **managed Neo4j writes + selective section cleanup + preserved embeddings for unchanged content**, so reruns avoid full corpus re-embeds.

### `corpusgraphwriter_write_boundary.md`
- Establishes the **managed transaction boundary** for `CorpusGraphWriter` public write methods.
- Public writes now use `session.execute_write(work_fn)` with per-method `_work(tx)` closures.
- Managed transactions provide commit/rollback semantics and **auto-retry transient errors**.
- Writes are **MERGE-based and idempotent**, with doc-scoped cleanup so operations are safe to rerun.
- Test coverage uses `FakeSession.execute_write` to verify:
  - success path
  - rollback on error
  - transient retry behavior
  - cleanup behavior
- Reference batching is split by type:
  - `REFERENCES` → `MERGE_REFERENCES_BATCH`
  - `REFERENCES_DOCUMENT` → `MERGE_REFERENCES_DOCUMENT_BATCH`
- Related drill-down: `corpus_graph_writer_incremental_cleanup.md`, `incremental_crawl_ingest_run_19.md`

### `corpus_graph_writer_incremental_cleanup.md`
- Focuses on the **incremental cleanup rules** inside the corpus graph writer.
- Workflow:
  - merge document
  - write sections
  - delete stale sections
  - clear changed embeddings
  - merge relationships
- Cleanup is **surgical**:
  - stale sections are removed
  - only changed sections lose embeddings/chunks
  - unchanged sections retain prior embeddings
- Documents a single write-side boundary for:
  - document bundles
  - relationships
  - status updates
- Relationship paths are separated:
  - `merge_reference_edges`
  - `merge_amendments`
  - `merge_supersessions`
  - `merge_concept_links`
- Key rule: rerunning the loader should not force full re-embedding.
- Related drill-down: `corpusgraphwriter_write_boundary.md`

### `incremental_crawl_ingest_run_19.md`
- Records **crawl run #19** into Railway production using voyage-4.
- Operational outcome:
  - 34 targeted docs ingested
  - production corpus grew from 6693 to 6725 docs
  - 1533 sections added
  - retrieval verified for `MA-3234 Expanded Foster Care` at 0.86 cosine
- Main operational lesson: avoid full reprocessing of fee schedule PDFs because byte churn can make unchanged documents look modified.
- Preferred selection logic emphasizes:
  - `status='downloaded'`
  - `first_seen_at>=run_start`
  - `last_changed_at>=run_start and source_type!=fee_schedule`
- Ingest path:
  - crawl
  - select targeted docs
  - parse
  - `load_document(parsed_json_path, source_type)`
  - incremental embed
  - verify retrieval
- Important gotcha: multiprocessing spawn fails when invoked from stdin/heredoc; use a real `.py` file or parse in-process with a reused converter.
- Local Docker/Neo4j were unavailable during the run, so only production was updated; local resync remains needed.
- Related drill-down: `corpusgraphwriter_write_boundary.md`

### Cross-entry pattern
- `CorpusGraphWriter` provides the mutation boundary that makes incremental ingest safe.
- The cleanup model ensures **doc-scoped updates** rather than full rebuilds.
- `incremental_crawl_ingest_run_19.md` is the operational example of the same design: targeted ingest, incremental embedding, and no unnecessary corpus-wide reprocessing.