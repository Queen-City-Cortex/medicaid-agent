---
children_hash: 54ff84abec10df5582d79da6d74b9cc600c15b6da98878c00fdf16f38654839f
compression_ratio: 0.4311235471373224
condensation_order: 1
covers: [context.md, deploy_data_script_and_refresh_workflow.abstract.md, deploy_data_script_and_refresh_workflow.md, deploy_data_script_and_refresh_workflow.overview.md, hybrid_retrieval_collection_and_finalization.md, neo4j_hybrid_search_indexing.md, source_selection_metadata_for_fee_schedules.md, voyage_4_embedding_migration_on_railway_production.md, waiver_range_decision_for_subpart_g_and_h.md]
covers_token_total: 4646
summary_level: d1
token_count: 2003
type: summary
---
# Neo4j Hybrid Search and Policy Corpus Retrieval

## Scope
This cluster covers two tightly related areas:
- **Neo4j hybrid search infrastructure**: indexing, embedding migration, retrieval fusion, and deployment workflows.
- **Policy corpus retrieval decisions**: source selection, waiver-range predicates, and hybrid hit finalization behavior.

The child entries show a consistent pattern: retrieval quality is driven by a mix of **vector search, fulltext recovery, concept matching, and deterministic reranking**, while operational safety is enforced through **explicit confirmations, environment checks, and clear rollback/retry paths**.

## Neo4j Hybrid Search Core
### `context.md`
Defines the parent topic `neo4j_hybrid_search` as the home for:
- vector and chunk embeddings per document-type group
- Reciprocal Rank Fusion with `RRF_K = 60`
- fulltext search over `Section.title` and `Section.content_text`
- concept graph matching gated by `query_text`

It also links the topic to Neo4j auth handling, indicating that search behavior depends on surrounding database connectivity and runtime setup.

### `neo4j_hybrid_search_indexing.md`
Documents the main hybrid search pipeline:
- `ensure_vector_index` verifies `section_embeddings`, `chunk_embeddings`, and `section_fulltext`
- `vector_search` collects and fuses:
  - section embeddings
  - chunk embeddings
  - concept matches
  - optional fulltext hits
- Deduplication happens per `section_id` before fusion
- Concept and fulltext searches only run when `query_text` is present

Key architectural decisions:
- Hybrid relevance is formed by **RRF over four signals**
- Chunk queries mirror section embedding queries per document-type group
- Schema-level fulltext support is explicit via `section_fulltext`

Related facts captured in the entry:
- `section_fulltext` covers `Section.title` and `Section.content_text`
- chunk searches use `per_group_k = top_k` when filtered, otherwise `max(top_k, 10)`

### `hybrid_retrieval_collection_and_finalization.md`
Focuses on the downstream collection/finalization stage in policy-corpus search:
- `collectHybridHitMap` builds staged hit maps
- concurrent backend retrieval merges by `sectionId` with **merge-max semantics**
- fulltext recovery runs alongside stage 1 and can insert fulltext-only sections
- `finalizeHybridHits` applies reranking and adds coverage/latest-change signals

Important retrieval patterns:
- Separate Neo4j sessions are required for concurrent queries
- `Promise.all` preserves input order, but score merging is order-independent
- Fulltext acts as exact-phrase recovery:
  - existing hits get `FULLTEXT_BOOST`
  - new hits can enter at a `0.01` floor
  - if nothing else exists, fulltext-only insertion uses base score `0.5`

Ranking inputs include:
- normalized query terms
- procedure codes
- requested years
- explicit policy numbers
- document coverage boosts
- latest change marker values

## Deployment and Embedding Operations
### `deploy_data_script_and_refresh_workflow.md`
Describes `scripts/deploy-data.sh` as a **remote Neo4j refresh pipeline** with destructive reset behavior:
- validates `NEO4J_HOST`
- reads `NEO4J_AUTH` from Railway
- requires Railway CLI login and TCP proxy availability
- refuses to wipe the graph without confirmation in non-interactive shells

Pipeline shape:
- schema creation
- `load --reset` destructive wipe
- ingest CFR
- ingest SSA
- extract references
- detect amendments
- embed
- seed concepts
- link concepts
- stats

The operational rule set is explicit:
- step 2 is the irreversible reset point
- `--yes` bypasses the prompt
- TCP proxy should be disabled after migration

### `deploy_data_script_and_refresh_workflow.overview.md`
Provides the same workflow as a compact structural overview, emphasizing:
- remote deployment
- Railway connectivity requirements
- destructive reload warning
- fixed multi-step pipeline order

### `voyage_4_embedding_migration_on_railway_production.md`
Captures a separate **non-destructive production embedding migration** on Railway:
- migrated Neo4j embeddings from the prior model to `voyage-4`
- created and deleted a temporary Neo4j TCP proxy via GraphQL mutations
- re-embedded the graph in place
- triggered agent deployment by pushing commit `b739229` to `main`
- verified `/healthz` and live retrieval quality afterward

Key operational facts:
- Railway account API token works for project commands
- `railway whoami` fails with account tokens
- deployment succeeded and the web service was skipped because the change was irrelevant to the web app
- rollback path is preserved by re-nullifying embeddings and re-embedding with `voyage-law-2`

This entry is the best drill-down for the production migration sequence and the relationship between Railway, Neo4j access, and deployment verification.

## Source Selection and Fee-Schedule Backlog Logic
### `source_selection_metadata_for_fee_schedules.md`
Documents `source_selection.py` in the pipeline:
- defines `SourceSelectionMetadata`
- includes backlog candidate/group dataclasses
- normalization and date extraction helpers
- grouping logic and markdown rendering for backlog reports

Important decisions:
- fee schedule entries are grouped by normalized variant group and variant date
- entries are bucketed as primary, history, archive, companion, or reference
- retrieval-ready entries are only **non-reference** items in **primary** or **history** buckets

The central architectural point:
- the module is intentionally **config-independent**
- registry rows are always data-dir-relative, so `crawler_registry` defaults are sufficient
- this differs from `audit.py` / `loader.py`, which use their own monkeypatchable `CRAWLER_DATA_DIR`

## Waiver-Range and Subpart Decisioning
### `waiver_range_decision_for_subpart_g_and_h.md`
Documents a resolved policy-corpus decision on CFR waiver predicates:
- the Subpart G / Subpart H split is intentional, not a bug
- Subpart G covers **1915(c)**
- Subpart H covers **1915(d)**

Behavioral implications:
- q-045 requires broad anchoring across both subparts
- only Subpart G plus `440.180` should be promoted to primary
- Subpart H must remain supporting evidence so it does not displace the required `1915(c)` citation

Key resolution:
- prior memory describing this as a latent bug or open issue is superseded
- the decision closes the ambiguity around waiver-range classification

## Cross-Cutting Relationships
- `context.md` links hybrid search to Neo4j auth handling, showing that retrieval depends on operational database connectivity.
- `neo4j_hybrid_search_indexing.md` and `hybrid_retrieval_collection_and_finalization.md` together form the retrieval pipeline: **indexing/search signal generation** followed by **collection, recovery, and final reranking**.
- `voyage_4_embedding_migration_on_railway_production.md` demonstrates the live operational path for updating embeddings used by that retrieval system.
- `deploy_data_script_and_refresh_workflow.md` represents the more destructive refresh path, contrasted with the in-place production migration.
- `waiver_range_decision_for_subpart_g_and_h.md` feeds policy-corpus retrieval logic by clarifying how Subpart G/H evidence should be ranked.
- `source_selection_metadata_for_fee_schedules.md` provides another retrieval-adjacent selection layer, but for fee-schedule source organization rather than search ranking.

## Drill-Down Map
- **Hybrid search design and indexes** → `neo4j_hybrid_search_indexing.md`
- **Parent topic overview** → `context.md`
- **Hybrid retrieval collection/finalization** → `hybrid_retrieval_collection_and_finalization.md`
- **Remote destructive refresh pipeline** → `deploy_data_script_and_refresh_workflow.md`
- **Railway production voyage-4 migration** → `voyage_4_embedding_migration_on_railway_production.md`
- **Fee-schedule source selection metadata** → `source_selection_metadata_for_fee_schedules.md`
- **Waiver-range predicate decision** → `waiver_range_decision_for_subpart_g_and_h.md`