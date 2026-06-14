---
children_hash: d9d0af2d06e0c825ae28459659d57ee8b76ef9fa34747bb88add33b7f75e0e3e
compression_ratio: 0.24939520563008577
condensation_order: 2
covers: [context.md, neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md, neo4j_auth/_index.md, neo4j_hybrid_search/_index.md, neo4j_write_read_consistency/_index.md, schema-aware-validation-is-the-shared-guardrail-for-graph-data-and-evaluation.md, schema-aware-validation-is-the-shared-guardrail-from-graph-writes-to-evaluation.md, schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md, schema-aware-validation-is-the-shared-safety-net-from-graph-writes-to-evaluation.md]
covers_token_total: 4547
summary_level: d2
token_count: 1134
type: summary
---
# database_operations: structural overview

## Domain purpose
This domain captures operational knowledge about **database deployments, Neo4j authentication, graph refresh workflows, and validation safeguards**. It focuses on environment-specific incidents and safe recovery procedures rather than general application design.

## Main clusters

### `neo4j_auth/`
Covers **Railway-specific Neo4j authentication behavior** and the **safe production refresh path for federal data**.

- **`context.md`**: High-level auth/infra context for Neo4j on Railway, including credential handling and `NEO4J_AUTH` lifecycle.
- **`railway_neo4j_auth_handling.md`**: Railway URL-decodes env vars, so `+` can become a space and corrupt passwords. The remediation is to rotate to an alphanumeric-only password and apply it with `ALTER CURRENT USER SET PASSWORD` over the bolt TCP proxy. `NEO4J_AUTH` only sets the password on first volume initialization.
- **`production_neo4j_federal_data_refresh.md`**: Safe production refresh must avoid destructive `deploy-data.sh load --reset`. The documented flow is: enable Railway TCP proxy → set `NEO4J_URI` and `NEO4J_PASSWORD` → ingest SSA/CFR → extract references → embed incrementally → disable proxy. The refresh is targeted to the federal slice; unchanged sections and embeddings are preserved.

Key relationship: **the Railway TCP proxy is central** to both auth remediation and production refresh.

### `neo4j_hybrid_search/`
Covers **Neo4j hybrid retrieval design** and the **remote deployment/reload workflow**.

- **`context.md`**: Broad retrieval architecture that combines vector, chunk, concept-graph, and keyword/fulltext signals.
- **`neo4j_hybrid_search_indexing.md`**: Implementation details for indexes and fusion:
  - `ensure_vector_index`
  - `section_fulltext` over `Section.title` and `Section.content_text`
  - per document-type grouping
  - deduplication by `section_id`
  - `_rrf_fuse` with **`RRF_K = 60`**
  - concept matching requires `query_text`
- **`deploy_data_script_and_refresh_workflow.md`**: Documents `scripts/deploy-data.sh`, a destructive remote reload pipeline. It requires `NEO4J_HOST`, Railway auth, Railway CLI login, and an enabled TCP proxy. Step 2 uses `load --reset` and explicitly wipes nodes and relationships before reloading.

Key relationship: hybrid search depends on **schema/index support**, while deployment workflow depends on **Railway CLI + TCP proxy**.

### `neo4j_write_read_consistency/`
Centers on **`CorpusGraphWriter`** as the single write-side boundary for corpus graph mutations.

- Core mutation flow:
  - merge document
  - write sections
  - delete stale sections
  - clear changed embeddings
  - merge relationships
- Incremental cleanup is surgical: stale sections are removed before re-merge, and embeddings/chunks are cleared only for changed content.
- Relationship handling is split into:
  - `merge_reference_edges` for `REFERENCES` / `REFERENCES_DOCUMENT`
  - `merge_amendments` for amendment edges and status updates
  - `merge_supersessions` for superseded-by edges with effective date and reason
  - `merge_concept_links` for `COVERS`, `DEFINES`, and `RESTRICTS`

Key rule: preserve unchanged sections and avoid full graph regeneration on reruns.

## Cross-cutting synthesis

### Schema-aware validation as the shared guardrail
Several synthesized entries show the same pattern across graph writes, retrieval, and evaluation: **normalize first, then validate before downstream use**.

- Graph outputs are filtered to remove malformed `OPTIONAL MATCH` rows and normalized before Zod validation.
- Retrieval pipelines deduplicate results and apply staged filtering/reranking before fusion.
- Evaluation and QA layers rely on validated Neo4j evidence and explicit relationship checks such as `REFERENCES_DOCUMENT`, `AMENDS`, `HAS_SECTION`, and `REFERENCES`.

### Shared operational themes
- **Environment sensitivity**: Railway env handling can break auth if password characters are decoded unexpectedly.
- **Incremental over destructive**: production refresh and graph writes prefer targeted updates over full rebuilds when possible.
- **Validation everywhere**: schema-aware guards protect search, navigation, scoring, and verification from malformed graph data.

## Drill-down guide
- Auth and production refresh: `neo4j_auth/`
- Hybrid search and deploy workflow: `neo4j_hybrid_search/`
- Incremental graph write cleanup: `neo4j_write_read_consistency/`
- Cross-layer validation patterns: schema-aware validation synthesis entries