---
children_hash: 6ebdc9661eaa0483c86e3eaa3821fe17d851a93d129aebee49a144d037320430
compression_ratio: 0.21158725683676347
condensation_order: 2
covers: [context.md, neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md, neo4j_auth/_index.md, neo4j_hybrid_search/_index.md, neo4j_write_read_consistency/_index.md, schema-aware-validation-is-the-common-safety-net-across-graph-writes-retrieval-a.md, schema-aware-validation-is-the-common-safety-net-from-graph-writes-to-evaluation.md, schema-aware-validation-is-the-guardrail-from-graph-writes-to-qa.md, schema-aware-validation-is-the-shared-guardrail-for-graph-data-and-evaluation.md, schema-aware-validation-is-the-shared-guardrail-from-graph-writes-to-evaluation.md, schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md, schema-aware-validation-is-the-shared-safety-net-from-graph-writes-to-evaluation.md]
covers_token_total: 7094
summary_level: d2
token_count: 1501
type: summary
---
# database_operations

Operational knowledge in this domain centers on Neo4j reliability, Railway-specific database handling, and schema-aware safeguards that keep graph writes, retrieval, and evaluation consistent. The key pattern across all entries is to prefer incremental, validated, environment-aware operations over destructive rebuilds.

## Core domain context
- `context.md` defines the domain as:
  - database connection and authentication issues
  - environment-specific deployment quirks
  - password rotation and configuration guidance
- Ownership: **Platform Infrastructure Team**
- Usage: document precise fixes for database environment issues and reuse them when debugging future incidents.

## Main clusters

### 1) `neo4j_auth`
Railway-specific Neo4j authentication behavior and production refresh procedure.
- Railway URL-decodes environment variables, so `+` can become a space and corrupt Neo4j passwords.
- `NEO4J_AUTH` only sets the password on first volume initialization; it does **not** update existing databases.
- Safer auth remediation uses an alphanumeric-only password and `ALTER CURRENT USER SET PASSWORD` through the bolt TCP proxy.
- Production refresh must avoid `deploy-data.sh load --reset`; the safe flow is proxy enablement, setting `NEO4J_URI` / `NEO4J_PASSWORD`, ingesting SSA/CFR, extracting references, embedding incrementally, then disabling the proxy.
- Drill down:
  - `railway_neo4j_auth_handling.md`
  - `production_neo4j_federal_data_refresh.md`

### 2) `neo4j_hybrid_search`
Neo4j retrieval, indexing, embedding migration, and source-selection logic.
- Hybrid search combines section embeddings, chunk embeddings, concept graph matches, and fulltext keyword hits.
- Retrieval fusion uses **Reciprocal Rank Fusion (RRF)** with **RRF_K = 60**.
- Indexes are expected for `section_embeddings`, `chunk_embeddings`, and `section_fulltext`.
- Search candidates are deduplicated by `section_id`; per-source lists keep the highest score per section before fusion.
- Concept matches use `CONCEPT_MATCH_SCORE = 0.70` and are limited to `min(top_k, 5)`.
- Production embedding migration to **`voyage-4`** was done non-destructively by nulling and re-embedding in place, with Railway proxy usage and live verification.
- `deploy_data_script_and_refresh_workflow.md` documents the destructive remote reload path for `scripts/deploy-data.sh`, including the fixed pipeline steps and the explicit confirmation requirement before `load --reset`.
- `source_selection_metadata_for_fee_schedules.md` documents metadata-driven fee schedule selection:
  - config-independent behavior
  - variant grouping by normalized group/date
  - buckets: primary, history, archive, companion, reference
  - retrieval-ready = non-reference items in primary/history
- Drill down:
  - `neo4j_hybrid_search_indexing.md`
  - `voyage_4_embedding_migration_on_railway_production.md`
  - `deploy_data_script_and_refresh_workflow.md`
  - `source_selection_metadata_for_fee_schedules.md`

### 3) `neo4j_write_read_consistency`
Write-boundary design for the Neo4j pipeline, emphasizing safe, incremental corpus mutation.
- `connection.py` is the single session acquisition choke point.
- `get_driver()` and `close_driver()` manage the module-singleton driver lifecycle.
- `CorpusGraphWriter` owns all graph mutations and is the single write-side boundary.
- Multi-statement mutations must use managed transactions via `session.execute_write(...)`, not ad hoc auto-commit calls.
- Document bundle flow:
  - merge document
  - write sections
  - delete stale sections
  - clear changed embeddings/chunks
  - merge relationships
- Cleanup is surgical and idempotent:
  - stale sections are removed
  - unchanged sections keep embeddings/chunks
  - only changed sections are invalidated
- Relationship handling is specialized for references, amendments, supersessions, and concept links.
- `incremental_crawl_ingest_run_19.md` shows the operational effect:
  - crawl run #19 ingested 34 targeted docs into Railway prod using `voyage-4`
  - corpus grew from 6693 to 6725 docs
  - 1533 sections were added with no missing embeddings
  - retrieval verification succeeded
  - fee_schedule byte-churn must be avoided by selecting only real incremental candidates
- Drill down:
  - `neo4j_session_and_corpus_writer_boundary.md`
  - `corpus_graph_writer_incremental_cleanup.md`
  - `corpusgraphwriter_write_boundary.md`
  - `incremental_crawl_ingest_run_19.md`

## Cross-cutting pattern: schema-aware validation
Several synthesis entries reinforce the same architectural rule across database operations, retrieval, evaluation, and QA:
- normalize graph outputs before validation
- filter null rows from `OPTIONAL MATCH`
- validate against schema before search/scoring/verification
- use guarded Cypher execution and relationship whitelists
- treat structural correctness as a prerequisite, not cleanup

This pattern is explicitly tied to:
- `neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md`
- `schema-aware-validation-is-the-common-safety-net-across-graph-writes-retrieval-a.md`
- `schema-aware-validation-is-the-common-safety-net-from-graph-writes-to-evaluation.md`
- `schema-aware-validation-is-the-guardrail-from-graph-writes-to-qa.md`
- `schema-aware-validation-is-the-shared-guardrail-for-graph-data-and-evaluation.md`
- `schema-aware-validation-is-the-shared-guardrail-from-graph-writes-to-evaluation.md`
- `schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md`
- `schema-aware-validation-is-the-shared-safety-net-from-graph-writes-to-evaluation.md`

## Shared operational themes
- **Railway proxy is central** to both auth remediation and production graph maintenance.
- **Incremental update over rebuild** is the default safety posture.
- **Environment-sensitive credentials** and initialization semantics matter for auth reliability.
- **Schema-aware validation** protects graph writes, retrieval, and evaluation from malformed data.