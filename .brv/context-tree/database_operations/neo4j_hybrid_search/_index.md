---
children_hash: 540d1af473660f9aab881373286e042464b464aa76a4ba1be439f3cf89858ef2
compression_ratio: 0.6639765223771094
condensation_order: 1
covers: [context.md, deploy_data_script_and_refresh_workflow.md, neo4j_hybrid_search_indexing.md]
covers_token_total: 1363
summary_level: d1
token_count: 905
type: summary
---
# Neo4j Hybrid Search and Deployment Workflow

## Overview
This set of knowledge entries covers two tightly related areas in the Neo4j pipeline:
- **`context.md` / `neo4j_hybrid_search`**: the hybrid retrieval design that combines vector, chunk, concept-graph, and fulltext signals.
- **`deploy_data_script_and_refresh_workflow.md`**: the remote deployment script that rebuilds and reloads the graph in a controlled, destructive workflow.
- **`neo4j_hybrid_search_indexing.md`**: the concrete indexing and ranking mechanics behind hybrid search.

## Core Architecture

### Hybrid retrieval pipeline
`neo4j_hybrid_search` describes a retrieval flow where Neo4j search merges multiple relevance sources:
- section embeddings
- chunk embeddings
- concept graph matches
- fulltext keyword hits

The key design point is **Reciprocal Rank Fusion** with **`RRF_K = 60`**, used to blend ranked lists into a single result set. Concept matching is gated by `query_text`, and the search is organized around document-type groups.

### Indexing and schema support
`neo4j_hybrid_search_indexing.md` adds implementation detail:
- `ensure_vector_index` validates required indexes exist
- schema includes **`section_fulltext`** over `Section.title` and `Section.content_text`
- vector and chunk embedding search are both performed per document-type group
- results are deduplicated by `section_id` before fusion
- `_rrf_fuse` combines the ranked lists and returns top-k results

## Deployment / Refresh Workflow

### Remote graph reload script
`Deploy Data Script and Refresh Workflow` documents `scripts/deploy-data.sh`, which targets a remote Neo4j instance and performs a fixed multi-step reload pipeline.

Key properties:
- requires `NEO4J_HOST`
- reads `NEO4J_AUTH` from Railway variables
- requires Railway CLI login
- depends on an enabled Railway TCP proxy
- refuses destructive graph wipe without explicit confirmation in non-interactive shells

The workflow is explicitly destructive at **step 2**, where `load --reset` drops all nodes and relationships before reloading.

### Pipeline flow
The documented flow is:

`configure NEO4J_HOST -> read NEO4J_AUTH -> confirm wipe -> schema -> load --reset -> ingest-cfr -> ingest-ssa -> extract-refs -> detect-amendments -> embed -> seed-concepts -> link-concepts -> stats`

## Key Rules and Constraints

### Search rules
From `neo4j_hybrid_search_indexing.md`:
- Deduplicate each source list by keeping the highest score per `section_id` before fusing.
- Concept matches require `query_text`.
- Concept matches use a fixed score of `0.70` and consider up to `min(top_k, 5)` sections.
- Fulltext search uses the same document-type grouping as vector search.

### Deployment rules
From `Deploy Data Script and Refresh Workflow`:
- Exit with usage instructions if `NEO4J_HOST` is missing.
- Use Railway variables for auth.
- Require confirmation before wiping the graph.
- Step 2 is destructive and uses `load --reset`.
- Disable the TCP proxy after migration.

## Important Dependencies
Across these entries, the system depends on:
- `pipeline.config.EMBEDDING_DIMENSIONS`
- `pipeline.graph.connection.get_session`
- `PolicyConcept` nodes and aliases
- section filters such as `content_length > 200` and `section_number`
- Railway CLI + TCP proxy for remote deployment

## Drill-down References
- **`context.md`** — high-level topic overview for `neo4j_hybrid_search`
- **`neo4j_hybrid_search_indexing.md`** — implementation details for index creation and RRF fusion
- **`deploy_data_script_and_refresh_workflow.md`** — destructive remote reload workflow for `scripts/deploy-data.sh`