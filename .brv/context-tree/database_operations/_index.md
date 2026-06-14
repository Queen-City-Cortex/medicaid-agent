---
children_hash: 9951fe87e63d10877437feb36ed0d7735ba64ab380a6c785b679efe97b342b56
compression_ratio: 0.32119123800147675
condensation_order: 2
covers: [context.md, neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md, neo4j_auth/_index.md, neo4j_hybrid_search/_index.md, neo4j_write_read_consistency/_index.md, schema-aware-validation-is-the-shared-guardrail-for-graph-data-and-evaluation.md, schema-aware-validation-is-the-shared-guardrail-from-graph-writes-to-evaluation.md, schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md]
covers_token_total: 4063
summary_level: d2
token_count: 1305
type: summary
---
# Database Operations: Structural Overview

This domain captures operational knowledge about **database deployments, Neo4j authentication, hybrid search, and graph write/read consistency**. The shared pattern across entries is careful handling of Neo4j data and environment-specific deployment behavior so that retrieval, refresh, and validation remain reliable.

## Domain Scope and Ownership
- **Purpose:** document database connection/authentication issues, deployment quirks, and password/configuration guidance.
- **Ownership:** Platform Infrastructure Team.
- **Usage:** preserve precise fixes for future debugging, especially where Railway, Neo4j, or graph validation is environment-sensitive.

## Core Topic Clusters

### `neo4j_auth`
Covers **Railway-specific Neo4j authentication behavior** and the **safe production refresh path** for federal data.

Key points:
- Railway URL-decodes environment variables, so `+` can become a space and corrupt Neo4j passwords.
- `NEO4J_AUTH` only sets the password on first volume initialization; it does not update existing databases.
- The remediation path uses the **bolt TCP proxy** and a password rotation to an alphanumeric-only credential via `ALTER CURRENT USER SET PASSWORD`.
- Production refreshes must be **targeted and incremental**, not destructive.

Related drill-down:
- `railway_neo4j_auth_handling.md`
- `production_neo4j_federal_data_refresh.md`

---

### `neo4j_hybrid_search`
Documents the **hybrid retrieval architecture** and the **remote deployment / reload workflow** for graph data.

Key points:
- Search blends multiple signals: **section embeddings, chunk embeddings, concept graph matches, and fulltext keyword hits**.
- Ranking uses **Reciprocal Rank Fusion (RRF)** with **`RRF_K = 60`**.
- Indexing includes a **`section_fulltext`** index over `Section.title` and `Section.content_text`.
- Concept matching is gated by `query_text`.
- Results are deduplicated by `section_id` before fusion.
- The deployment script `scripts/deploy-data.sh` performs a controlled remote reload and can be destructive at **step 2** via `load --reset`.

Operational dependencies:
- `pipeline.config.EMBEDDING_DIMENSIONS`
- `pipeline.graph.connection.get_session`
- `PolicyConcept` nodes and aliases
- Railway CLI and TCP proxy
- `NEO4J_HOST`, `NEO4J_AUTH`, `NEO4J_URI`, `NEO4J_PASSWORD`

Related drill-down:
- `neo4j_hybrid_search_indexing.md`
- `deploy_data_script_and_refresh_workflow.md`
- `context.md`

---

### `neo4j_write_read_consistency`
Centers on **`CorpusGraphWriter`** as the single write-side boundary for corpus graph mutations.

Core write flow:
- merge document
- write sections
- delete stale sections
- clear changed embeddings
- merge relationships

Key behavior:
- cleanup is surgical: only changed sections lose embeddings/chunks
- unchanged sections retain prior embeddings across reruns
- stale sections are removed before re-merging
- graph writes are batched using `GRAPH_BATCH_SIZE`

Relationship handling is separated by edge type:
- `merge_reference_edges` for `REFERENCES` / `REFERENCES_DOCUMENT`
- `merge_amendments` for amendment edges and amendment status updates
- `merge_supersessions` for superseded-by style edges with effective date/reason
- `merge_concept_links` for `COVERS`, `DEFINES`, and `RESTRICTS`

Related drill-down:
- `corpus_graph_writer_incremental_cleanup.md`

---

## Cross-Cutting Pattern: Schema-Aware Validation
Several synthesized entries connect these topics into one consistent rule: **normalize and filter graph output before validation, search, scoring, or evaluation**.

Shared safeguards:
- numeric normalization before Zod validation
- null-row filtering after `OPTIONAL MATCH`
- guarded Cypher execution
- validation of relationship shapes such as `REFERENCES_DOCUMENT`, `AMENDS`, `HAS_SECTION`, and `REFERENCES`

This pattern appears across:
- `neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md`
- `schema-aware-validation-is-the-shared-guardrail-for-graph-data-and-evaluation.md`
- `schema-aware-validation-is-the-shared-guardrail-from-graph-writes-to-evaluation.md`
- `schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md`

## Practical Relationships
- **Auth and refresh** both depend on Railway proxy behavior and environment-variable handling.
- **Hybrid search** depends on schema/index correctness and careful result fusion.
- **Write/read consistency** depends on incremental cleanup so reruns do not destroy unchanged graph state.
- **Validation** is the shared safety net across graph writes, retrieval, and evaluation.

## Drill-Down Guide
- For Railway auth quirks and password rotation: `neo4j_auth/railway_neo4j_auth_handling.md`
- For safe production refresh procedure: `neo4j_auth/production_neo4j_federal_data_refresh.md`
- For hybrid search design and indexing: `neo4j_hybrid_search/neo4j_hybrid_search_indexing.md`
- For controlled remote reload workflow: `neo4j_hybrid_search/deploy_data_script_and_refresh_workflow.md`
- For incremental graph mutation rules: `neo4j_write_read_consistency/corpus_graph_writer_incremental_cleanup.md`
- For schema-aware validation across layers: the synthesis entries listed above