---
children_hash: 5a8eb2b337c78ad720815d9c900de1428c4a0bbd6b0534bd9c187aa7d0da6f7e
compression_ratio: 0.3201042873696408
condensation_order: 1
covers: [corpus_graph_writer_incremental_cleanup.abstract.md, corpus_graph_writer_incremental_cleanup.md, corpus_graph_writer_incremental_cleanup.overview.md, corpusgraphwriter_transaction_boundary.md, corpusgraphwriter_write_boundary.md, incremental_crawl_ingest_run_19.md]
covers_token_total: 3452
summary_level: d1
token_count: 1105
type: summary
---
## Structural Overview: Corpus Graph Writer and Incremental Ingest

This cluster documents the write-side boundary and cleanup behavior for the corpus graph, plus one operational ingest run that validated the incremental pipeline in production. The main theme is **surgical, idempotent graph mutation**: preserve unchanged sections, delete only stale structure, and clear embeddings only for sections whose content changed.

### Core write boundary: `CorpusGraphWriter`
See:
- `corpus_graph_writer_incremental_cleanup.md`
- `corpus_graph_writer_incremental_cleanup.overview.md`
- `corpus_graph_writer_incremental_cleanup.abstract.md`

`CorpusGraphWriter` is the single write-side boundary for Neo4j corpus graph mutations. It centralizes:
- document bundle upserts
- section writes and cleanup
- relationship merges
- status updates

The canonical flow is:

**merge document → write sections → delete stale sections → clear changed embeddings → merge relationships**

Key behavior:
- stale sections are removed during reruns
- only changed sections lose embeddings/chunks
- unchanged sections are preserved
- batch writes use `GRAPH_BATCH_SIZE`

Relationship handling is split by edge type, with separate paths for:
- references
- amendments
- supersessions
- concept links

Important implementation facts captured in the child entry:
- `upsert_document_bundle` merges the document and writes sections
- `merge_reference_edges` handles `REFERENCES` and `REFERENCES_DOCUMENT`
- `merge_amendments` also marks affected documents with amendment status
- `merge_supersessions` writes supersession-style edges with effective date and reason
- `merge_concept_links` supports `COVERS`, `DEFINES`, and `RESTRICTS`

### Transaction boundary evolution
See:
- `corpusgraphwriter_transaction_boundary.md`
- `corpusgraphwriter_write_boundary.md`

These entries describe a refinement of the same write boundary from explicit transactions to managed Neo4j writes.

#### `corpusgraphwriter_transaction_boundary.md`
This version moved public write operations into explicit Neo4j transactions:
- `with session.begin_transaction() as tx: ... tx.commit()`
- helper methods now accept `Transaction` instead of `Session`
- cleanup and rewrite are atomic
- rollback behavior is covered by tests

Key point: cleanup no longer risks leaving a half-wiped document if failure occurs before re-merge.

#### `corpusgraphwriter_write_boundary.md`
This later version migrates public writes to:
- `session.execute_write(work_fn)`

It adds:
- managed transaction semantics
- transient retry handling
- test support in `FakeSession.execute_write`

Important behavior:
- `execute_write` commits on success and rolls back on exception
- transient errors can be retried automatically
- write functions remain MERGE-based and deterministic
- work functions are idempotent and safe to rerun

The selective cleanup rule remains unchanged:
- only sections whose content actually changed lose embeddings/chunks
- unchanged sections keep them across reruns

### Operational ingest validation: Run 19
See:
- `incremental_crawl_ingest_run_19.md`

This entry documents a real incremental ingest run into Railway production (`voyage-4`) and provides an operational example of the same surgical update philosophy.

Key results:
- 34 targeted docs ingested
- production corpus grew from 6693 to 6725 docs
- 1533 sections added
- no missing embeddings
- retrieval verified for `MA-3234 Expanded Foster Care` at `0.86 cosine`

Operational lessons:
- avoid naive full reprocessing of fee schedule PDFs because byte churn can trigger unnecessary work
- target docs using `first_seen_at>=run_start` or `(last_changed_at>=run_start and source_type!=fee_schedule)` with `status='downloaded'`
- use `load_document(parsed_json_path, source_type)` per doc for surgical prod loads
- local Docker/Neo4j was unavailable during this run, so prod updated independently and local resync remained pending

### Cross-entry pattern
Across all entries, the same structural pattern appears:
1. identify changed content only
2. preserve unchanged sections and embeddings
3. clean stale graph state before re-merging
4. make the write path atomic or managed/retriable
5. validate with tests and operational reruns

This cluster is therefore centered on **incremental, idempotent corpus graph maintenance** and the transition from manual transaction control to managed Neo4j write boundaries.