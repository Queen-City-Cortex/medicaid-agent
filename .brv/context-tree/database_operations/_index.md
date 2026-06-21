---
children_hash: 12b08d6f2170da7c336a171475f509e3bf20465863fcca00ad10c1f9bddf2fca
compression_ratio: 0.23377441713925645
condensation_order: 2
covers: [context.md, neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md, neo4j_auth/_index.md, neo4j_hybrid_search/_index.md, neo4j_write_read_consistency/_index.md, schema-aware-validation-is-the-common-safety-net-across-graph-writes-retrieval-a.md, schema-aware-validation-is-the-common-safety-net-from-graph-writes-to-evaluation.md, schema-aware-validation-is-the-guardrail-from-graph-writes-to-qa.md, schema-aware-validation-is-the-shared-guardrail-for-graph-data-and-evaluation.md, schema-aware-validation-is-the-shared-guardrail-from-graph-writes-to-evaluation.md, schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md, schema-aware-validation-is-the-shared-safety-net-from-graph-writes-to-evaluation.md]
covers_token_total: 6348
summary_level: d2
token_count: 1484
type: summary
---
## database_operations

Operational knowledge for database deployments and authentication incidents on the platform. The domain is owned by the Platform Infrastructure Team and focuses on precise fixes for environment-specific database issues, password rotation, and configuration guidance.

### Core cluster: `neo4j_auth`
- Covers Railway-specific Neo4j authentication behavior and a safe production refresh path for federal data.
- Key facts:
  - Railway URL-decodes environment variables, so `+` can become a space and corrupt Neo4j passwords.
  - `NEO4J_AUTH` only sets the password on first volume initialization; it does not update existing databases.
  - A workable fix is rotating to an alphanumeric-only password and applying it with `ALTER CURRENT USER SET PASSWORD` through the bolt TCP proxy.
- Production refresh guidance:
  - Do **not** use `deploy-data.sh load --reset`; that path is destructive.
  - Safe flow is: enable Railway TCP proxy → set `NEO4J_URI` and `NEO4J_PASSWORD` → ingest SSA/CFR → extract references → embed incrementally → disable proxy.
  - The refresh is targeted to the federal slice; unchanged sections keep embeddings and the clinical corpus remains untouched.
- Drill down:
  - `railway_neo4j_auth_handling.md`
  - `production_neo4j_federal_data_refresh.md`

### Core cluster: `neo4j_hybrid_search`
- Documents the Neo4j hybrid retrieval stack used by the pipeline.
- Retrieval architecture combines:
  - vector embeddings per document-type group
  - chunk embeddings
  - keyword fulltext search over `Section.title` and `Section.content_text`
  - concept graph matches gated by `query_text`
- Fusion uses Reciprocal Rank Fusion with `RRF_K = 60`.
- Important indexing and ranking rules:
  - `ensure_vector_index` requires `section_embeddings`, `chunk_embeddings`, and `section_fulltext`
  - results are deduplicated by `section_id` before fusion
  - concept matches use a fixed `CONCEPT_MATCH_SCORE = 0.70`
  - fulltext search respects the same document-type grouping as vector search
- Production migration note:
  - `voyage_4_embedding_migration_on_railway_production.md` records a non-destructive Railway deploy that re-embedded the remote graph to voyage-4, using a temporary Neo4j TCP proxy, push `b739229`, `/healthz` verification, and rollback capability via `voyage-law-2`.
  - Verified scale: `19,855` sections and `2,821` chunks, `1024` dimensions, `0` errors, `0` missing embeddings.
- Drill down:
  - `neo4j_hybrid_search_indexing.md`
  - `voyage_4_embedding_migration_on_railway_production.md`

### Core cluster: `neo4j_write_read_consistency`
- Describes write-side behavior of `CorpusGraphWriter` and incremental reprocessing during crawl ingest.
- Main pattern: managed Neo4j writes + selective section cleanup + preserved embeddings for unchanged content.
- `corpusgraphwriter_write_boundary.md`
  - Public writes use `session.execute_write(work_fn)` with per-method `_work(tx)` closures.
  - Managed transactions provide commit/rollback semantics and auto-retry transient errors.
  - Writes are MERGE-based, idempotent, and doc-scoped cleanup makes reruns safe.
  - Reference batching is split by type:
    - `REFERENCES` → `MERGE_REFERENCES_BATCH`
    - `REFERENCES_DOCUMENT` → `MERGE_REFERENCES_DOCUMENT_BATCH`
- `corpus_graph_writer_incremental_cleanup.md`
  - Workflow: merge document → write sections → delete stale sections → clear changed embeddings → merge relationships.
  - Stale sections are removed, but unchanged sections retain prior embeddings/chunks.
  - Relationship paths are separated into `merge_reference_edges`, `merge_amendments`, `merge_supersessions`, and `merge_concept_links`.
  - Key rule: rerunning the loader should not force full re-embedding.
- `incremental_crawl_ingest_run_19.md`
  - Records crawl run #19 into Railway production using voyage-4.
  - 34 targeted docs ingested; corpus grew from 6693 to 6725 docs; 1533 sections added.
  - Selection logic favors `status='downloaded'`, `first_seen_at>=run_start`, and `last_changed_at>=run_start and source_type!=fee_schedule`.
  - Important gotcha: multiprocessing spawn fails from stdin/heredoc; use a real `.py` file or parse in-process.
- Drill down:
  - `corpusgraphwriter_write_boundary.md`
  - `corpus_graph_writer_incremental_cleanup.md`
  - `incremental_crawl_ingest_run_19.md`

### Cross-cutting synthesis entries
- Multiple synthesis notes connect `database_operations` with `agent_architecture`, `evaluation`, `packages`, and `qa`.
- Shared architectural pattern:
  - normalize outputs before validation
  - filter null rows after `OPTIONAL MATCH`
  - validate against Zod-compatible or equivalent schemas
  - only then trust search, scoring, or QA results
- This guardrail applies across:
  - graph writes
  - retrieval payload shaping
  - cross-reference evaluation
  - hallucination verification
- Key relationship:
  - `CorpusGraphWriter` and schema-aware validation together protect safe mutation boundaries and downstream correctness.
- Drill down:
  - `neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md`
  - `schema-aware-validation-is-the-common-safety-net-across-graph-writes-retrieval-a.md`
  - `schema-aware-validation-is-the-common-safety-net-from-graph-writes-to-evaluation.md`
  - `schema-aware-validation-is-the-guardrail-from-graph-writes-to-qa.md`
  - `schema-aware-validation-is-the-shared-guardrail-for-graph-data-and-evaluation.md`
  - `schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md`
  - `schema-aware-validation-is-the-shared-safety-net-from-graph-writes-to-evaluation.md`

### Domain-level pattern
- The domain consistently emphasizes **environment-sensitive Neo4j operations** plus **schema-aware validation**.
- Safe practice is incremental and targeted: avoid destructive resets, preserve unchanged embeddings, and validate graph-shaped output before it reaches search, evaluation, or QA.