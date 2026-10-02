---
children_hash: dc1c3e0ad6e169fd2d88aaa464845521256224c6fa9ae30749a121ca06c29b77
compression_ratio: 0.1371794871794872
condensation_order: 2
covers: [context.md, neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md, neo4j_auth/_index.md, neo4j_hybrid_search/_index.md, neo4j_write_read_consistency/_index.md, schema-aware-validation-is-the-common-safety-net-across-graph-writes-retrieval-a.md, schema-aware-validation-is-the-common-safety-net-from-graph-writes-to-evaluation.md, schema-aware-validation-is-the-guardrail-from-graph-writes-to-qa.md, schema-aware-validation-is-the-shared-guardrail-for-graph-data-and-evaluation.md, schema-aware-validation-is-the-shared-guardrail-from-graph-writes-to-evaluation.md, schema-aware-validation-is-the-shared-safety-net-across-graph-writes-retrieval-a.md, schema-aware-validation-is-the-shared-safety-net-across-retrieval-and-evaluation.md, schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md, schema-aware-validation-is-the-shared-safety-net-for-graph-and-qa-pipelines.md, schema-aware-validation-is-the-shared-safety-net-from-graph-writes-to-evaluation.md]
covers_token_total: 8580
summary_level: d2
token_count: 1177
type: summary
---
# database_operations

## Domain Focus
Operational Neo4j knowledge for the platform, centered on database deployment behavior, authentication handling, write/read consistency, and schema-aware validation. The domain emphasizes safe incremental operations, Railway-specific quirks, and graph correctness across retrieval and QA.

## Core Subtopics

### `neo4j_auth`
Railway-specific Neo4j authentication and production refresh behavior. Key points:
- Railway URL-decodes environment variables, so `+` can become a space and corrupt passwords.
- `NEO4J_AUTH` only applies on first volume initialization; it does not update existing databases.
- Safe remediation uses password rotation to an alphanumeric-only password via `ALTER CURRENT USER SET PASSWORD` through the bolt TCP proxy.
- Production refreshes must be targeted and non-destructive; the safe flow uses Railway TCP proxy, `NEO4J_URI` / `NEO4J_PASSWORD`, then ingestion and embedding steps for the federal slice.
- Related drill-downs: `railway_neo4j_auth_handling.md`, `production_neo4j_federal_data_refresh.md`.

### `neo4j_hybrid_search`
The Neo4j-backed hybrid retrieval stack for policy corpus search. Main architectural decisions:
- Retrieval fuses vector, chunk, concept graph, and fulltext signals with Reciprocal Rank Fusion.
- Indexes required: `section_embeddings`, `chunk_embeddings`, and `section_fulltext`.
- `RRF_K = 60` and `CONCEPT_MATCH_SCORE = 0.70` are fixed scoring rules.
- Collection/finalization uses staged merging, deterministic reranking, coverage boosts, latest-change markers, and top-K filtering.
- Deployment workflows include both destructive reloads and non-destructive Railway production embedding migration with `voyage-4`.
- Source selection logic groups fee-schedule backlog entries into primary/history/archive/companion/reference buckets.
- Waiver-range decisioning keeps Subpart G and Subpart H intentionally split; `441.301` is PRIMARY and `441.351` SUPPORTING for q-045 evidence handling.
- Related drill-downs: `neo4j_hybrid_search_indexing.md`, `hybrid_retrieval_collection_and_finalization.md`, `deploy_data_script_and_refresh_workflow.md`, `voyage_4_embedding_migration_on_railway_production.md`, `source_selection_metadata_for_fee_schedules.md`, `waiver_range_decision_for_subpart_g_and_h.md`.

### `neo4j_write_read_consistency`
The graph write/read boundary for the pipeline, structured around one session entrypoint and one mutation owner.
- `get_session()` / `get_driver()` / `close_driver()` form the module-global Neo4j driver boundary.
- `CorpusGraphWriter` is the single write-side boundary for all graph mutations.
- Public writes use `session.execute_write()` for managed transactions, retries, and rollback safety.
- Cleanup is incremental and idempotent: stale sections are removed, changed sections lose embeddings/chunks, unchanged sections are preserved.
- Relationship writes are batched and MERGE-based, including references, amendments, supersession, and concept-link edges.
- The production ingest example shows targeted updates rather than full reprocessing, with verified retrieval after incremental crawl run #19.
- Related drill-downs: `neo4j_session_and_corpus_writer_boundary.md`, `corpusgraphwriter_write_boundary.md`, `corpus_graph_writer_incremental_cleanup.md`, `incremental_crawl_ingest_run_19.md`.

## Cross-Cutting Pattern

### Schema-aware validation is the shared safety net
A repeated architectural rule across this domain and its related layers is: **normalize first, then validate, then trust**. This pattern appears in:
- graph writes and read-side filtering,
- Neo4j retrieval payload shaping,
- evaluation and QA scoring,
- cross-reference and relationship checks.

Common mechanisms include:
- numeric normalization before validation,
- null-row filtering after `OPTIONAL MATCH`,
- Zod-compatible schema checks,
- guarded Cypher execution,
- relationship whitelisting and validation,
- final-answer-only hallucination verification.

## Shared Relationships
- `neo4j_auth` and `neo4j_hybrid_search` both rely on Railway TCP proxy behavior and environment-sensitive credential handling.
- `neo4j_write_read_consistency` underpins the correctness of graph writes used by retrieval and evaluation.
- Schema-aware validation connects this domain to evaluation, QA, and agent architecture, making it a shared correctness contract across writes, retrieval, and scoring.

## Drill-Down Map
- Authentication and production refresh: `neo4j_auth`
- Hybrid retrieval and embedding workflows: `neo4j_hybrid_search`
- Read/write boundary and incremental graph cleanup: `neo4j_write_read_consistency`
- Cross-layer validation pattern: schema-aware validation synthesis entries