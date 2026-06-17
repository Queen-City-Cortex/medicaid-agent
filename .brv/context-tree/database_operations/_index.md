---
children_hash: dc0c051e5f60b246f33a8b1970187550238ba3f36180bef8510b6484572edc27
compression_ratio: 0.3632084012312149
condensation_order: 2
covers: [context.md, neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md, neo4j_auth/_index.md, neo4j_hybrid_search/_index.md, neo4j_write_read_consistency/_index.md, schema-aware-validation-is-the-shared-guardrail-for-graph-data-and-evaluation.md, schema-aware-validation-is-the-shared-guardrail-from-graph-writes-to-evaluation.md, schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md, schema-aware-validation-is-the-shared-safety-net-from-graph-writes-to-evaluation.md]
covers_token_total: 5523
summary_level: d2
token_count: 2006
type: summary
---
# database_operations — structural summary

## Domain purpose
Operational knowledge for database deployments, Neo4j authentication incidents, and graph consistency safeguards. The domain focuses on precise fixes for environment-sensitive database issues, safe refresh paths, and validation patterns that prevent malformed graph data from breaking retrieval or evaluation.

## Core clusters

### `neo4j_auth`
Railway-specific Neo4j authentication behavior and safe production refresh guidance.

- **Railway auth handling**
  - Railway URL-decodes environment variables, so `+` can become a space and corrupt Neo4j passwords.
  - `NEO4J_AUTH` only applies on first volume initialization; it does not update an existing database’s password.
  - The remediation path is to rotate to an alphanumeric-only password and apply it with `ALTER CURRENT USER SET PASSWORD` via the bolt TCP proxy.
- **Safe production refresh**
  - Production refreshes must avoid destructive `load --reset` paths.
  - The safe flow is: enable Railway TCP proxy → set `NEO4J_URI` and `NEO4J_PASSWORD` → ingest SSA/CFR → extract references → embed incrementally → disable proxy.
  - The refresh is targeted to the federal slice and preserves unchanged embeddings and non-target corpus data.
  - Verified scale is 48,720 sections and 1,877 docs.

**Drill down:** `railway_neo4j_auth_handling.md`, `production_neo4j_federal_data_refresh.md`

---

### `neo4j_hybrid_search`
Retrieval-layer design for Neo4j search, indexing, and deployment-time embedding migration.

- **Hybrid retrieval architecture**
  - Combines section embeddings, chunk embeddings, concept graph matches, and fulltext keyword hits.
  - Fusion uses Reciprocal Rank Fusion with `RRF_K = 60`.
  - Search is grouped by document type, deduplicated by `section_id`, then fused.
  - `section_fulltext` indexes `Section.title` and `Section.content_text`.
- **Operational constraints**
  - Deduplicate each source list by keeping the highest score per `section_id`.
  - Concept matches run only when `query_text` is present.
  - `CONCEPT_MATCH_SCORE = 0.70`, with concept results capped at `min(top_k, 5)`.
  - Fulltext and chunk queries follow the same grouped, capped retrieval pattern.
- **Deployment and refresh workflow**
  - `scripts/deploy-data.sh` is a destructive remote refresh pipeline.
  - Steps include schema creation, `load --reset`, CFR/SSA ingest, reference extraction, amendment detection, embedding, concept seeding, linking, and final stats.
  - Non-interactive shells require explicit confirmation; `--yes` bypasses it.
  - Railway TCP proxy is required during the operation and must be disabled afterward.
- **Voyage-4 production migration**
  - Production embeddings were migrated in place to `voyage-4` without a destructive reload.
  - The process used a temporary Neo4j TCP proxy, null-and-reembed, commit `b739229`, deployment, `/healthz` verification, live retrieval checks, and proxy teardown.
  - Production defaults to `voyage-4` when `VOYAGE_MODEL` is unset; `AGENT_MODEL=gpt-5.4` is pinned.
  - Rollback is possible by nulling embeddings again and re-embedding with `voyage-law-2`.
  - Identifiers recorded: Railway project `2a11b10b`, environment `1c44225d`, Neo4j service `1de48388`, agent service `5f1decc0`, web service `903a72cc`.

**Drill down:** `neo4j_hybrid_search_indexing.md`, `deploy_data_script_and_refresh_workflow.md`, `deploy_data_script_and_refresh_workflow.overview.md`, `deploy_data_script_and_refresh_workflow.abstract.md`, `voyage_4_embedding_migration_on_railway_production.md`

---

### `neo4j_write_read_consistency`
Incremental corpus graph write safety, transaction boundaries, and targeted crawl ingest behavior.

- **Single write boundary**
  - `CorpusGraphWriter` is the write-side boundary for Neo4j corpus mutations.
  - Responsibilities include document/section upserts, stale-section removal, selective embedding clearing, and relationship merging.
- **Incremental cleanup model**
  - Cleanup is surgical: delete stale sections, preserve unchanged sections, and clear embeddings only for changed content.
  - Reruns should not force a full re-embed.
  - Canonical flow: merge document → write sections → delete stale sections → clear changed embeddings → merge relationships.
- **Relationship merge paths**
  - Distinct paths exist for references, amendments, supersessions, and concept links.
  - `merge_reference_edges` handles `REFERENCES` and `REFERENCES_DOCUMENT`.
  - `merge_amendments` also marks affected documents with amendment status.
  - `merge_supersessions` writes superseded-by style edges with effective date and reason.
  - `merge_concept_links` supports `COVERS`, `DEFINES`, and `RESTRICTS`.
- **Transaction hardening**
  - Public writes now run under explicit Neo4j transactions using `with session.begin_transaction() as tx: ... tx.commit()`.
  - Cleanup and rewrite are atomic.
  - Helpers now accept a Neo4j `Transaction` instead of a `Session`.
  - Tests cover rollback and commit behavior; recorded result: `300 passed, 2 skipped`.
- **Incremental crawl ingest run 19**
  - Targeted production ingest added 34 docs, grew the corpus from 6693 to 6725 docs, and added 1533 sections.
  - No sections were missing embeddings.
  - Retrieval was verified for `MA-3234 Expanded Foster Care` at `0.86` cosine.
  - Selection filters include `status='downloaded'`, `last_changed_at>=run_start`, and `first_seen_at>=run_start`.
  - Recommended targeted selection favors newly seen docs or changed non-fee-schedule docs.
  - Operational gotchas: fee schedule files churn bytes without content change; full parsing can take hours; `parse_and_save_supported_file_with_timeout` fails from stdin heredoc execution; local Docker/Neo4j was down during the run, so only prod updated.

**Drill down:** `corpus_graph_writer_incremental_cleanup.md`, `corpus_graph_writer_incremental_cleanup.overview.md`, `corpus_graph_writer_incremental_cleanup.abstract.md`, `corpusgraphwriter_transaction_boundary.md`, `incremental_crawl_ingest_run_19.md`

---

## Cross-cutting consistency pattern
A recurring theme across database operations is schema-aware validation and normalization before downstream use.

- Neo4j outputs are normalized before Zod validation.
- Null rows from `OPTIONAL MATCH` are filtered before search, navigation, or scoring.
- Guarded Cypher execution prevents malformed graph access.
- Retrieval, evaluation, and QA all rely on validated graph shapes and relationship checks such as `REFERENCES_DOCUMENT`, `AMENDS`, `HAS_SECTION`, and `REFERENCES`.
- Hybrid retrieval also applies staged filtering, deduplication, and reranking before fusion.

**Related synthesis entries:**  
- `neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md`  
- `schema-aware-validation-is-the-shared-guardrail-for-graph-data-and-evaluation.md`  
- `schema-aware-validation-is-the-shared-guardrail-from-graph-writes-to-evaluation.md`  
- `schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md`  
- `schema-aware-validation-is-the-shared-safety-net-from-graph-writes-to-evaluation.md`

## Drill-down map
- For Railway auth encoding and password rotation: `neo4j_auth/railway_neo4j_auth_handling.md`
- For safe production refresh procedures: `neo4j_auth/production_neo4j_federal_data_refresh.md`
- For hybrid search and indexing behavior: `neo4j_hybrid_search/neo4j_hybrid_search_indexing.md`
- For destructive refresh workflow: `neo4j_hybrid_search/deploy_data_script_and_refresh_workflow.md`
- For non-destructive embedding migration: `neo4j_hybrid_search/voyage_4_embedding_migration_on_railway_production.md`
- For incremental write cleanup and transaction safety: `neo4j_write_read_consistency/corpus_graph_writer_incremental_cleanup.md`
- For transactional boundary hardening: `neo4j_write_read_consistency/corpusgraphwriter_transaction_boundary.md`
- For targeted ingest behavior and operational pitfalls: `neo4j_write_read_consistency/incremental_crawl_ingest_run_19.md`