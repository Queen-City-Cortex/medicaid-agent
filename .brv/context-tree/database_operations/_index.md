---
children_hash: e2021db0d3d0fb0c13f4a75979ec6ce5c6cb9338465fe72ae18a61c257f7c37f
compression_ratio: 0.2365371506475801
condensation_order: 2
covers: [context.md, neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md, neo4j_auth/_index.md, neo4j_hybrid_search/_index.md, neo4j_write_read_consistency/_index.md, schema-aware-validation-is-the-common-safety-net-across-graph-writes-retrieval-a.md, schema-aware-validation-is-the-guardrail-from-graph-writes-to-qa.md, schema-aware-validation-is-the-shared-guardrail-for-graph-data-and-evaluation.md, schema-aware-validation-is-the-shared-guardrail-from-graph-writes-to-evaluation.md, schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md, schema-aware-validation-is-the-shared-safety-net-from-graph-writes-to-evaluation.md]
covers_token_total: 5868
summary_level: d2
token_count: 1388
type: summary
---
# database_operations — Structural Summary

## Domain focus
This domain captures operational knowledge around database deployments, Neo4j authentication, graph retrieval, and write/read consistency. The emphasis is on environment-sensitive behavior, safe production procedures, and schema-aware guards that keep malformed graph data from breaking search, navigation, or evaluation.

## Top-level structure and key themes

### `context.md`
- Defines the domain scope: database connection/auth issues, deployment quirks, password rotation, and configuration guidance.
- Ownership sits with the Platform Infrastructure Team.
- Intended use is precise incident documentation for future debugging.

### Neo4j authentication and production refresh
**Drill down:** `neo4j_auth/_index.md`, especially `railway_neo4j_auth_handling.md` and `production_neo4j_federal_data_refresh.md`
- Railway environment handling can corrupt Neo4j passwords because URL decoding turns `+` into a space.
- `NEO4J_AUTH` only applies on first volume initialization; it does not update existing databases.
- Fix pattern: rotate to an alphanumeric-only password and apply it through the bolt TCP proxy with `ALTER CURRENT USER SET PASSWORD`.
- Production refresh must avoid `deploy-data.sh load --reset`; the safe path is targeted ingestion with Railway TCP proxy enabled, `NEO4J_URI`/`NEO4J_PASSWORD` set, SSA/CFR ingestion, reference extraction, incremental embedding, then proxy teardown.
- The refresh process is explicitly non-destructive and preserves unchanged content, embeddings, and supersession relationships.

### Neo4j hybrid search and embedding migration
**Drill down:** `neo4j_hybrid_search/_index.md`, especially `neo4j_hybrid_search_indexing.md` and `voyage_4_embedding_migration_on_railway_production.md`
- The retrieval stack combines vector, chunk, concept, and keyword fulltext signals using Reciprocal Rank Fusion.
- `RRF_K = 60` is the smoothing constant.
- Required indexes include `section_embeddings`, `chunk_embeddings`, and `section_fulltext`.
- Search logic deduplicates results by `section_id`, requires `query_text` for concept matches, and uses a fixed `CONCEPT_MATCH_SCORE = 0.70`.
- Production embedding migration to `voyage-4` was performed non-destructively on Railway using a temporary TCP proxy, with validation via `/healthz` and live retrieval checks.
- Rollback remains possible by nulling embeddings and re-embedding with `voyage-law-2`.

### Corpus graph writer and incremental ingest
**Drill down:** `neo4j_write_read_consistency/_index.md`, especially `corpusgraphwriter_write_boundary.md`, `corpus_graph_writer_incremental_cleanup.md`, and `incremental_crawl_ingest_run_19.md`
- `CorpusGraphWriter` public writes use managed transactions via `session.execute_write(work_fn)` with per-method `_work(tx)` closures.
- Managed transactions provide commit/rollback semantics and automatic retry of transient Neo4j errors.
- Write behavior is MERGE-based and idempotent, with batching split by reference type:
  - `REFERENCES` → `MERGE_REFERENCES_BATCH`
  - `REFERENCES_DOCUMENT` → `MERGE_REFERENCES_DOCUMENT_BATCH`
- Incremental cleanup is surgical: stale sections are deleted, changed sections lose embeddings/chunks, unchanged sections retain prior embeddings.
- Incremental crawl ingest run #19 demonstrates the operating model: targeted documents only, incremental embedding, no full corpus reprocessing, and verification of retrieval quality.
- A noted operational gotcha is that multiprocessing spawn fails when invoked from stdin/heredoc; use a real `.py` file or parse in-process.

## Cross-cutting architectural pattern
### Schema-aware validation as a shared safety net
**Relevant synthesis entries:**  
- `neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md`
- `schema-aware-validation-is-the-common-safety-net-across-graph-writes-retrieval-a.md`
- `schema-aware-validation-is-the-guardrail-from-graph-writes-to-qa.md`
- `schema-aware-validation-is-the-shared-guardrail-for-graph-data-and-evaluation.md`
- `schema-aware-validation-is-the-shared-guardrail-from-graph-writes-to-evaluation.md`
- `schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md`
- `schema-aware-validation-is-the-shared-safety-net-from-graph-writes-to-evaluation.md`

Common thread across these entries:
- Normalize graph outputs before validation.
- Filter null rows after `OPTIONAL MATCH`.
- Validate payloads with Zod-compatible schemas.
- Guard Cypher execution and relationship checks.
- Use validated Neo4j evidence for evaluation, scoring, and hallucination verification.
- Treat structural correctness as a prerequisite, not cleanup.

## Relationship summary
- `neo4j_auth` and `neo4j_hybrid_search` both depend on Railway proxy behavior and careful credential/environment handling.
- `neo4j_write_read_consistency` operationalizes safe mutation boundaries that enable the incremental ingest and embedding workflows described in the other topics.
- The synthesis entries show that the same validation-first discipline spans graph writes, retrieval, and QA/evaluation, making schema-aware normalization the domain’s dominant pattern.

## Drill-down map
- Domain scope and ownership: `context.md`
- Railway auth and safe refresh: `neo4j_auth/_index.md`
- Hybrid retrieval and embedding migration: `neo4j_hybrid_search/_index.md`
- Managed writes and incremental ingest: `neo4j_write_read_consistency/_index.md`
- Validation cross-cutting pattern: the schema-aware validation synthesis entries