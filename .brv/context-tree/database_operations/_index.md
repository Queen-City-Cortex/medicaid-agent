---
children_hash: 21c8ae48f6e0afbc43233c4bf7b898723da178be518fd4e710cc1b6e5d22d418
compression_ratio: 0.24662349676225717
condensation_order: 2
covers: [context.md, neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md, neo4j_auth/_index.md, neo4j_hybrid_search/_index.md, neo4j_write_read_consistency/_index.md, schema-aware-validation-is-the-guardrail-from-graph-writes-to-qa.md, schema-aware-validation-is-the-shared-guardrail-for-graph-data-and-evaluation.md, schema-aware-validation-is-the-shared-guardrail-from-graph-writes-to-evaluation.md, schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md, schema-aware-validation-is-the-shared-safety-net-from-graph-writes-to-evaluation.md]
covers_token_total: 5405
summary_level: d2
token_count: 1333
type: summary
---
## database_operations

Platform Infrastructure Team-owned domain for operational knowledge about database deployments, authentication incidents, and environment-specific fixes. The domain scope excludes general feature design and non-database infrastructure issues.

### Core cluster: Neo4j auth, refresh, and production safety
- **`neo4j_auth/_index.md`** centers on Railway-specific Neo4j authentication behavior and the safe production refresh path for federal data.
- Key relationship: both auth remediation and refresh workflows depend on the **Railway TCP proxy / bolt proxy**.
- Important constraints:
  - Railway URL-decodes env vars, so `+` can corrupt passwords.
  - `NEO4J_AUTH` only sets the password on first volume initialization; it does not update existing databases.
  - Safe refresh avoids `deploy-data.sh load --reset` because that path is destructive.
- Safe production refresh flow includes:
  - enable Railway TCP proxy
  - set `NEO4J_URI` and `NEO4J_PASSWORD`
  - ingest SSA/CFR
  - extract references
  - embed incrementally
  - disable proxy
- The cluster also notes production scale and preservation goals: targeted federal refresh, unchanged sections retain embeddings, and the clinical corpus is left untouched.

### Hybrid search and embedding migration
- **`neo4j_hybrid_search/_index.md`** documents the hybrid retrieval stack used by the pipeline.
- Retrieval structure combines:
  - vector embeddings
  - chunk embeddings
  - `Section.title` / `Section.content_text` fulltext search
  - concept graph matches gated by `query_text`
- Ranking uses **Reciprocal Rank Fusion** with **`RRF_K = 60`**.
- Indexing rules and constraints include:
  - required indexes: `section_embeddings`, `chunk_embeddings`, `section_fulltext`
  - deduplication by `section_id` before fusion
  - concept matches require `query_text`
  - fixed `CONCEPT_MATCH_SCORE = 0.70`
- **`voyage_4_embedding_migration_on_railway_production.md`** records a non-destructive Railway production migration to voyage-4 embeddings.
  - Temporary Neo4j TCP proxy was required.
  - Migration process: authenticate Railway CLI, create proxy, null and re-embed graph in place, push commit `b739229`, verify `/healthz` and live retrieval, delete proxy.
  - Verified outcome: 19,855 sections and 2,821 chunks re-embedded, 1024 dimensions, zero errors, zero missing embeddings, live retrieval at 0.83+ cosine similarity.

### Write/read consistency and schema-aware safety
- **`neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md`** is the cross-cutting synthesis entry for this domain.
- Main pattern: schema-aware guards protect Neo4j data at every layer via:
  - numeric normalization before validation
  - null-row filtering after `OPTIONAL MATCH`
  - indexed hybrid search fusion
  - relationship-based evaluation checks
- This entry connects `database_operations` with agent architecture and QA, showing that malformed graph output is prevented before it can break search, navigation, or scoring.

### Incremental ingest and managed write boundaries
- **`neo4j_write_read_consistency/_index.md`** covers `CorpusGraphWriter` and incremental crawl ingest behavior.
- `corpusgraphwriter_write_boundary.md`:
  - public writes use `session.execute_write(work_fn)`
  - each public write method builds a `_work(tx)` closure
  - managed transactions provide commit/rollback and automatic retry for transient errors
  - tests use `FakeSession.execute_write` to verify success, rollback, and retry paths
  - reference batching is split by type: `REFERENCES` → `MERGE_REFERENCES_BATCH`, `REFERENCES_DOCUMENT` → `MERGE_REFERENCES_DOCUMENT_BATCH`
- `corpus_graph_writer_incremental_cleanup.md`:
  - cleanup is surgical: merge document, write sections, delete stale sections, clear changed embeddings, merge relationships
  - unchanged sections retain embeddings/chunks
  - relationship paths are separated for references, amendments, supersessions, and concept links
  - reruns should not force full re-embedding
- `incremental_crawl_ingest_run_19.md`:
  - production crawl run #19 ingested 34 targeted docs
  - corpus grew from 6,693 to 6,725 docs
  - 1,533 sections added
  - retrieval verified for `MA-3234 Expanded Foster Care` at 0.86 cosine
  - key lesson: avoid full reprocessing of fee schedule PDFs because byte churn can make unchanged docs appear modified
  - preferred selection logic uses `status='downloaded'`, `first_seen_at>=run_start`, and `last_changed_at>=run_start and source_type!=fee_schedule`
  - multiprocessing spawn from stdin/heredoc fails; use a real `.py` file or parse in-process

### Shared themes across the domain
- Environment-sensitive auth is a recurring risk, especially on Railway.
- Incremental update is preferred over full rebuild across auth, ingest, and embedding workflows.
- Validation and normalization are treated as prerequisites for safe graph use, not post-hoc cleanup.
- The most useful drill-down points are:
  - `neo4j_auth/_index.md` for Railway auth and production refresh
  - `neo4j_hybrid_search/_index.md` for hybrid retrieval and embedding migration
  - `neo4j_write_read_consistency/_index.md` for managed writes and incremental ingest
  - `neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md` for the cross-layer safety pattern