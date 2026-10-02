---
children_hash: 87ba7892cb797db061a66d6aa79d2413ba4cbfadb56f1b8e11565d995f35cd70
compression_ratio: 0.27511259056197374
condensation_order: 1
covers: [context.md, deploy_data_script_and_refresh_workflow.md, hybrid_retrieval_collection_and_finalization.md, neo4j_hybrid_search_indexing.md, source_selection_metadata_for_fee_schedules.md, voyage_4_embedding_migration_on_railway_production.md, waiver_range_decision_for_subpart_g_and_h.md]
covers_token_total: 5107
summary_level: d1
token_count: 1405
type: summary
---
# neo4j_hybrid_search

Covers the Neo4j-backed hybrid retrieval stack for the policy corpus, spanning indexing, collection/finalization, deployment refresh, source selection, embedding migration, and waiver-range decisioning. The topic centers on combining vector, chunk, concept, and fulltext signals while keeping retrieval behavior deterministic and operationally safe.

## Core retrieval architecture
- **`neo4j_hybrid_search_indexing.md`** defines the base hybrid search pipeline:
  - Ensures `section_embeddings`, `chunk_embeddings`, and `section_fulltext` indexes exist.
  - Uses **Reciprocal Rank Fusion** with **`RRF_K = 60`**.
  - Merges four signals: section embeddings, chunk embeddings, concept graph matches, and fulltext keyword hits.
  - Applies per-document-type-group querying and de-duplication by `section_id` before fusion.
- **`hybrid_retrieval_collection_and_finalization.md`** extends retrieval into staged collection and deterministic reranking:
  - `collectHybridHitMap` merges concurrent backend results with merge-max semantics.
  - Fulltext recovery runs concurrently and can insert fulltext-only sections at a mid-range score.
  - Amendment-title expansion, document expansion, and change-notice header expansion enrich hits before finalization.
  - `finalizeHybridHits` applies coverage boosts, latest change markers, and `rerankRetrievalHit` before returning top-K results.

## Indexing and signal rules
- Concept and fulltext searches only run when `query_text` is present.
- Concept matches are gated by query text and use a fixed **`CONCEPT_MATCH_SCORE = 0.70`** for up to `min(top_k, 5)` results.
- Fulltext search uses the same document-type grouping as vector search, with per-group limits.
- Chunk embedding search mirrors section embedding search per document-type group.
- De-duplication is order-independent and keeps the highest score per `section_id`.

## Deployment and refresh operations
- **`deploy_data_script_and_refresh_workflow.md`** documents the destructive refresh pipeline for `scripts/deploy-data.sh`:
  - Validates `NEO4J_HOST`, reads `NEO4J_AUTH` from Railway, and requires explicit confirmation before wipe.
  - Requires Railway CLI login and an enabled TCP proxy.
  - Runs a fixed pipeline: schema → `load --reset` → `ingest-cfr` → `ingest-ssa` → `extract-refs` → `detect-amendments` → `embed` → `seed-concepts` → `link-concepts` → `stats`.
  - Step 2 is explicitly destructive and drops all nodes and relationships.
- **`voyage_4_embedding_migration_on_railway_production.md`** records a non-destructive Railway production embedding migration:
  - Authenticated Railway CLI with an account token for project operations.
  - Created a temporary Neo4j TCP proxy via GraphQL mutations, re-embedded the remote graph in place with **`voyage-4`**, then deleted the proxy.
  - Triggered agent deployment by pushing commit **`b739229`** to `main`.
  - Verified `/healthz` and live retrieval quality after deployment.
  - Rollback path is preserved by nulling embeddings and re-embedding with `voyage-law-2`.

## Source selection and fee-schedule grouping
- **`source_selection_metadata_for_fee_schedules.md`** documents `source_selection.py` behavior for fee schedule backlog generation:
  - Defines `SourceSelectionMetadata`, backlog candidate/group dataclasses, normalization helpers, date extraction, grouping, and markdown rendering.
  - Groups entries by normalized variant group and variant date, then ranks them into **primary, history, archive, companion, or reference** buckets.
  - Retrieval-ready entries are only non-reference items in primary or history buckets.
  - The module remains config-independent because registry rows are data-dir-relative.
  - Uses `crawler_registry.normalize_local_path`; regex filter: `^source_type == "fee_schedule"$`.

## Waiver-range predicate decisioning
- **`waiver_range_decision_for_subpart_g_and_h.md`** resolves the CFR predicate boundary for policy corpus retrieval:
  - Confirms the Subpart G/Subpart H split is intentional, not a bug.
  - Subpart G covers **1915(c)** waiver authority; Subpart H covers **1915(d)** waiver applications for individuals age 65 or older.
  - q-045 evidence handling expects **441.301** as PRIMARY and **441.351** as SUPPORTING.
  - Collection anchoring and rerank should cast wide across Subparts G and H, but rebalance hints should promote only Subpart G + 440.180 to primary so 1915(d) sections do not displace the needed 1915(c) citation.

## Shared dependencies and relationships
- The hybrid retrieval docs are tightly linked to:
  - **`database_operations/neo4j_auth/railway_neo4j_auth_handling.md`** for Railway/Neo4j connectivity.
  - **`database_operations/neo4j_write_read_consistency/context.md`** for graph safety constraints.
  - **`facts/project/context.md`** for project-level operational facts.
- The retrieval pipeline depends on:
  - `pipeline.config.EMBEDDING_DIMENSIONS`
  - `pipeline.graph.connection.get_session`
  - `PolicyConcept` nodes and section filters like `content_length > 200` and `section_number`

## Drill-down map
- Indexing and fusion behavior: **`neo4j_hybrid_search_indexing.md`**
- Collection/finalization reranking: **`hybrid_retrieval_collection_and_finalization.md`**
- Destructive reload and refresh workflow: **`deploy_data_script_and_refresh_workflow.md`**
- Railway production embedding migration: **`voyage_4_embedding_migration_on_railway_production.md`**
- Fee-schedule source grouping: **`source_selection_metadata_for_fee_schedules.md`**
- Subpart G/H waiver predicate rationale: **`waiver_range_decision_for_subpart_g_and_h.md`**