---
children_hash: f0f5d99beba7355e0ca823f9edfc3e5f9b301fdf26cc1f3fc0aab8539a2ae073
compression_ratio: 0.4216133942161339
condensation_order: 1
covers: [corpus_graph_writer_incremental_cleanup.abstract.md, corpus_graph_writer_incremental_cleanup.md, corpus_graph_writer_incremental_cleanup.overview.md, corpusgraphwriter_transaction_boundary.md, incremental_crawl_ingest_run_19.md]
covers_token_total: 2628
summary_level: d1
token_count: 1108
type: summary
---
# Structural Summary: Incremental Corpus Graph Writes and Crawl Ingest

## Core write-boundary pattern
The corpus graph pipeline uses `CorpusGraphWriter` / `CorpusGraphWriter` as the single write-side boundary for Neo4j corpus mutations. The key responsibilities are:
- upsert documents and sections
- remove stale sections
- clear embeddings only for changed content
- merge relationships after section writes

Drill down:
- `corpus_graph_writer_incremental_cleanup.md`
- `corpus_graph_writer_incremental_cleanup.overview.md`
- `corpus_graph_writer_incremental_cleanup.abstract.md`

## Incremental cleanup behavior
The cleanup model is intentionally surgical:
- stale sections are deleted before re-merging
- only sections whose content changed lose embeddings and chunks
- unchanged sections are preserved across reruns
- rerunning the loader should not trigger a full re-embed

This is the main optimization for incremental reprocessing and idempotent document updates.

## Document bundle write flow
The canonical flow is:
1. merge document
2. write sections
3. delete stale sections
4. clear changed embeddings
5. merge relationships

This flow is described consistently across the cleanup notes and is the basis for safe incremental updates.

## Relationship merge paths
Relationship handling is split into distinct paths rather than one generic merge:
- references
- amendments
- supersessions
- concept links

Notable edge handling includes:
- `merge_reference_edges` for `REFERENCES` and `REFERENCES_DOCUMENT`
- `merge_amendments` also marking affected documents with amendment status
- `merge_supersessions` writing superseded-by style edges with effective date and reason
- `merge_concept_links` supporting `COVERS`, `DEFINES`, and `RESTRICTS`

## Transaction boundary hardening
A later fix tightened the write boundary by moving public writes into explicit Neo4j transactions.

Key changes:
- public write operations now run under `with session.begin_transaction() as tx: ... tx.commit()`
- cleanup and rewrite are atomic
- helper methods now accept a Neo4j `Transaction` instead of a `Session`
- rollback and commit behavior is covered by tests

This change prevents partial cleanup states if a write fails mid-operation.

Drill down:
- `corpusgraphwriter_transaction_boundary.md`

## Transactional safety and test coverage
The transaction-boundary update preserves the incremental embedding strategy while eliminating a failure mode where cleanup could commit before rewrite. The test suite validates:
- batch query ordering
- selective embedding clearing
- rollback on failure
- commit behavior for the write boundary

Recorded test result: `300 passed, 2 skipped`.

## Ingest run 19: targeted incremental crawl to Railway prod
`Incremental Crawl Ingest Run 19` documents a production ingest into Railway voyage-4 using a targeted selection strategy.

Key outcomes:
- 34 targeted docs ingested
- production corpus grew from 6693 to 6725 docs
- 1533 sections were added
- no sections were missing embeddings
- retrieval was verified for `MA-3234 Expanded Foster Care` at `0.86` cosine

Drill down:
- `incremental_crawl_ingest_run_19.md`

## Crawl selection strategy
The ingest workflow separates targeted doc selection from full crawl output to avoid unnecessary reprocessing, especially for fee schedule PDFs that exhibit byte churn.

Useful selection filters:
- `status='downloaded'`
- `last_changed_at>=run_start`
- `first_seen_at>=run_start`

Recommended targeted candidate logic:
- `first_seen_at>=run_start`
- or `(last_changed_at>=run_start and source_type!=fee_schedule)`

## Operational gotchas in ingestion
Important failure and performance notes from run 19:
- fee schedule files can be re-downloaded with byte churn even when content is unchanged
- naive full parsing can reprocess roughly 1850 fee schedule PDFs for hours
- `parse_and_save_supported_file_with_timeout` uses multiprocessing spawn and fails from stdin heredoc execution
- the safer pattern is to create one converter and parse in-process per file
- local Docker/Neo4j was down during the run, so only prod was updated and local resync remains needed

## Ingest execution model
The preferred production load path is:
- select targeted docs
- parse
- call `load_document(parsed_json_path, source_type)` per document
- run incremental embedding
- verify retrieval

This keeps prod ingestion surgical and avoids unnecessary full corpus rebuilds.