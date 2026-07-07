---
children_hash: 9afa173417fbdab71c71d102039d97d87321e36894e9c3231811d01f8e926657
compression_ratio: 0.42768595041322316
condensation_order: 1
covers: [context.md, deploy_data_script_and_refresh_workflow.abstract.md, deploy_data_script_and_refresh_workflow.md, deploy_data_script_and_refresh_workflow.overview.md, neo4j_hybrid_search_indexing.md, source_selection_metadata_for_fee_schedules.md, voyage_4_embedding_migration_on_railway_production.md]
covers_token_total: 3388
summary_level: d1
token_count: 1449
type: summary
---
# Database Operations: Neo4j Hybrid Search and Production Refresh

This area covers three closely related operational themes: **hybrid retrieval in Neo4j**, **remote graph refresh/deployment workflows**, and **production embedding migration / source selection metadata**. The entries share a common focus on how the medicaid-agent pipeline indexes, refreshes, and queries graph data in Railway-hosted Neo4j.

## 1) Hybrid search indexing and retrieval
**Drill down:** `neo4j_hybrid_search_indexing.md`, `context.md`

- The hybrid search pipeline combines **section embeddings**, **chunk embeddings**, **concept graph matches**, and **fulltext keyword hits**.
- Retrieval uses **Reciprocal Rank Fusion** with `RRF_K = 60`.
- The index setup ensures required indexes exist, including:
  - `section_embeddings`
  - `chunk_embeddings`
  - `section_fulltext` for `Section.title` and `Section.content_text`
- Concept matching is **gated by `query_text`** and respects document-type filters.
- Results from each source are **deduplicated by `section_id` before fusion**, keeping the highest score per section.
- Chunk search mirrors the document-type-group iteration used by section embedding search.

### Key relationships
- `context.md` frames the topic as Neo4j search indexing plus hybrid retrieval.
- `neo4j_hybrid_search_indexing.md` contains the implementation-level behavior and rules.
- Related operational context is linked to `railway_neo4j_auth_handling.md`.

## 2) Remote Neo4j refresh pipeline
**Drill down:** `deploy_data_script_and_refresh_workflow.md`, `deploy_data_script_and_refresh_workflow.overview.md`, `deploy_data_script_and_refresh_workflow.abstract.md`

- `scripts/deploy-data.sh` is a **remote Neo4j deployment / refresh script**.
- It requires:
  - `NEO4J_HOST`
  - Railway CLI login
  - Railway TCP proxy enabled
  - credentials from `NEO4J_AUTH`
- The script runs a fixed **10-step pipeline**:
  1. schema creation
  2. `load --reset` destructive wipe
  3. ingest CFR
  4. ingest SSA
  5. extract refs
  6. detect amendments
  7. embed
  8. seed concepts
  9. link concepts
  10. stats
- The destructive reset is the central safety boundary:
  - explicit confirmation is required
  - non-interactive shells refuse to proceed without confirmation
  - `--yes` bypasses the prompt
- The TCP proxy should be disabled after migration completes.

### Key relationship
- This workflow is the destructive counterpart to the non-destructive production re-embedding noted in `voyage_4_embedding_migration_on_railway_production.md`.

## 3) Production embedding migration on Railway
**Drill down:** `voyage_4_embedding_migration_on_railway_production.md`

- Documents a **Railway production migration** of Neo4j embeddings to **`voyage-4`**.
- Sequence:
  - authenticate Railway CLI with account API token
  - create a temporary Neo4j TCP proxy
  - null embeddings and re-embed in place
  - push commit `b739229` to `main`
  - verify `/healthz` and live vector retrieval
  - delete the proxy
- The migration was **non-destructive** and explicitly did **not** use the wipe-and-rebuild deploy script.
- Verification confirmed:
  - service health
  - writable storage
  - correct retrieval quality
  - vector query results with `0.83+` cosine similarity
- Rollback path is preserved by re-nullifying embeddings and re-embedding with `voyage-law-2`.

### Important facts
- Railway account API token works for project commands, but `railway whoami` fails with account tokens.
- Production data included remote graph re-embedding of **19,855 sections** and **2,821 chunks** at **1024 dimensions** with **0 errors** and **0 missing embeddings**.
- Agent deployment was triggered by GitHub repo push to `main`; web service was skipped as irrelevant.

## 4) Fee schedule source selection metadata
**Drill down:** `source_selection_metadata_for_fee_schedules.md`

- `source_selection.py` defines:
  - `SourceSelectionMetadata`
  - backlog candidate/group dataclasses
  - normalization helpers
  - date extraction helpers
  - grouping logic
  - markdown rendering for fee-schedule backlog reporting
- The logic groups fee-schedule variants by **normalized variant group** and **variant date**, then buckets them into:
  - primary
  - history
  - archive
  - companion
  - reference
- Retrieval-ready entries are only **non-reference items in primary or history buckets**.
- The module intentionally remains **config-independent** because registry rows are always **data-dir-relative**.
- A review issue about using a module-local `CRAWLER_DATA_DIR` was resolved by a documenting comment instead of changing the kwarg behavior.
- PR 58 was scored **5/5 safe-to-merge** by Greptile.
- Pattern captured: `^source_type == "fee_schedule"$`

## Shared architectural pattern
Across these entries, the recurring design is:

- **Neo4j indexing and retrieval** are treated as a structured, multi-signal search problem.
- **Deployment and refresh operations** distinguish between destructive graph rebuilds and non-destructive production migrations.
- **Railway connectivity and proxy management** are central operational prerequisites.
- **Metadata-driven selection logic** is kept deliberately stable and config-independent when the data model guarantees path semantics.

## Entry map for drill-down
- `context.md` — high-level overview of hybrid search
- `neo4j_hybrid_search_indexing.md` — index creation and RRF retrieval behavior
- `deploy_data_script_and_refresh_workflow.md` — destructive remote refresh pipeline
- `deploy_data_script_and_refresh_workflow.overview.md` — concise workflow summary
- `voyage_4_embedding_migration_on_railway_production.md` — non-destructive production re-embedding
- `source_selection_metadata_for_fee_schedules.md` — fee-schedule source grouping and backlog metadata