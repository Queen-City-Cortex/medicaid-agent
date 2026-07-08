---
children_hash: ee90ab22b05ade0d1eb90d000b32ef71ad7fbe534f175573cfcdd32a6429a30a
compression_ratio: 0.31983805668016196
condensation_order: 1
covers: [context.md, deploy_data_script_and_refresh_workflow.abstract.md, deploy_data_script_and_refresh_workflow.md, deploy_data_script_and_refresh_workflow.overview.md, neo4j_hybrid_search_indexing.md, source_selection_metadata_for_fee_schedules.md, voyage_4_embedding_migration_on_railway_production.md, waiver_range_decision_for_subpart_g_and_h.md]
covers_token_total: 4199
summary_level: d1
token_count: 1343
type: summary
---
# database_operations/neo4j_hybrid_search

Structural summary of the Neo4j search, indexing, deployment, and retrieval notes. This topic centers on hybrid graph retrieval over Neo4j, production embedding migration, remote refresh workflows, and fee-schedule source selection logic.

## Core retrieval model
- **`context.md`** defines the topic scope: Neo4j search indexing, vector/chunk embeddings, and Reciprocal Rank Fusion (RRF) hybrid retrieval.
- The hybrid search stack combines:
  - section embeddings
  - chunk embeddings
  - concept graph matches
  - fulltext keyword hits
- **RRF_K = 60** is the smoothing constant used for fusion.
- Concept matching is gated by `query_text`; fulltext and concept lookups respect document-type filters.

### Drill-down entries
- `neo4j_hybrid_search_indexing.md`
- `context.md`

## Indexing and fusion behavior
- **`neo4j_hybrid_search_indexing.md`** documents the search pipeline implementation in `packages/pipeline/src/pipeline/embeddings/indexer.py` and `packages/pipeline/src/pipeline/graph/schema.py`.
- `ensure_vector_index` asserts required indexes exist:
  - `section_embeddings`
  - `chunk_embeddings`
  - `section_fulltext`
- `vector_search` gathers per-document-type-group candidates, deduplicates by `section_id`, then applies `_rrf_fuse` and returns top-k fused results.
- Search signals are normalized before fusion; the rules require keeping the highest score per `section_id` in each source list.
- Concept matches use a fixed **`CONCEPT_MATCH_SCORE = 0.70`** and are limited to `min(top_k, 5)`.
- Chunk embedding queries mirror section embedding queries, with per-group limits based on `top_k`.

### Drill-down entry
- `neo4j_hybrid_search_indexing.md`

## Production embedding migration
- **`voyage_4_embedding_migration_on_railway_production.md`** records a live Railway deployment that migrated Neo4j embeddings to **`voyage-4`**.
- The migration was **non-destructive**: embeddings were nulled and re-embedded in place rather than using `deploy-data.sh`.
- The deployment path included:
  - Railway CLI authentication
  - temporary Neo4j TCP proxy creation
  - in-place re-embedding
  - push to `main` to trigger agent deploy
  - health and retrieval verification
  - proxy deletion afterward
- Key operational facts captured:
  - Railway project id: `2a11b10b`
  - production env id: `1c44225d`
  - Neo4j service id: `1de48388`
  - agent service id: `5f1decc0`
  - web service id: `903a72cc`
- Verification succeeded with `/healthz` and live vector-query checks; rollback is possible by re-embedding with `voyage-law-2`.

### Drill-down entry
- `voyage_4_embedding_migration_on_railway_production.md`

## Remote refresh and destructive reload workflow
- **`deploy_data_script_and_refresh_workflow.md`** and its abstract/overview entries document `scripts/deploy-data.sh`.
- The script targets a **remote Neo4j instance** and requires:
  - Railway CLI login
  - enabled Railway TCP proxy
  - `NEO4J_HOST`
  - credentials from `NEO4J_AUTH`
- The pipeline is fixed and destructive at step 2:
  1. schema creation
  2. `load --reset`
  3. `ingest-cfr`
  4. `ingest-ssa`
  5. `extract-refs`
  6. `detect-amendments`
  7. `embed`
  8. `seed-concepts`
  9. `link-concepts`
  10. `stats`
- Explicit confirmation is required before wiping the graph; non-interactive shells refuse without confirmation, while `--yes` bypasses the prompt.
- The TCP proxy must be disabled after migration completes.

### Drill-down entries
- `deploy_data_script_and_refresh_workflow.md`
- `deploy_data_script_and_refresh_workflow.overview.md`
- `deploy_data_script_and_refresh_workflow.abstract.md`

## Source selection metadata for fee schedules
- **`source_selection_metadata_for_fee_schedules.md`** documents PR 58 review outcomes and the fee-schedule source selection logic in `source_selection.py`.
- The module is intentionally **config-independent** because registry rows are always data-dir-relative.
- It relies on `crawler_registry.normalize_local_path` and metadata fields such as:
  - `source_type`
  - `source_url`
  - `local_path`
  - `title`
  - `source_format`
  - `status`
- Fee-schedule entries are grouped by normalized variant group and variant date, then bucketed into:
  - primary
  - history
  - archive
  - companion
  - reference
- Retrieval-ready entries are **non-reference** items in **primary** or **history** buckets.
- The key filter pattern is: `^source_type == "fee_schedule"$`

### Drill-down entry
- `source_selection_metadata_for_fee_schedules.md`

## Topic relationships
- This topic is connected to **Neo4j auth handling** via related references in both the search context and the migration/deployment notes.
- It also links into broader pipeline behavior around embeddings, retrieval, and corpus/source-selection policy.

### Related drill-down targets
- `database_operations/neo4j_auth/railway_neo4j_auth_handling.md`
- `database_operations/neo4j_write_read_consistency/context.md`
- `database_operations/neo4j_auth/context.md`

## High-level pattern
Across all entries, the shared architectural pattern is:
- **remote Neo4j access over Railway**
- **careful handling of destructive vs non-destructive graph operations**
- **hybrid retrieval built from multiple ranked signals**
- **explicit schema/index validation before search**
- **metadata-driven selection and ranking of source records**