---
children_hash: cdec217a9dd40557630617fffe2629fb3e1062d9122be33851816ed59a768958
compression_ratio: 0.6697019867549668
condensation_order: 2
covers: [context.md, neo4j_auth/_index.md, neo4j_hybrid_search/_index.md]
covers_token_total: 1208
summary_level: d2
token_count: 809
type: summary
---
## Domain: database_operations

- **Purpose & Usage**  
  - Captures operational resolutions for database connectivity and authentication incidents, focused on platform deployment quirks and password/configuration guidance. Owned by Platform Infrastructure; reference when debugging database environments (context.md).

### Topic: neo4j_auth

- **Key Problem**: Railway decodes environment variables before delivering them to containers, so `+` in passwords becomes spaces, breaking Neo4j authentication unless credentials are strictly alphanumeric (context.md, railway_neo4j_auth_handling.md).
- **Neo4j Password Lifecycle**: `NEO4J_AUTH` only applies during initial volume boot; live instances require manual password updates through Neo4j commands (railway_neo4j_auth_handling.md).
- **Rotation Workflow** (neo4j_auth/railway_neo4j_auth_handling.md):
  - Deploy injects env vars → URL decoding transforms `+` → authentication failure.
  - Rotate to an alphanumeric password (example `***REDACTED***`) to survive decoding.
  - Use the bolt TCP proxy to execute `ALTER CURRENT USER SET PASSWORD` so the running database accepts the new secret.
- **Dependencies**: Bolt TCP proxy is required for live password rotation; Neo4j configuration is consumed by the Medicaid agent documented under `agent_architecture/nc_medicaid_agent`.

### Topic: neo4j_hybrid_search

- **Overview**: Documents the hybrid search pipeline combining vector/chunk embeddings, gated concept matches, and section-level keyword hits, fused via Reciprocal Rank Fusion with `RRF_K=60` (neo4j_hybrid_search/context.md).
- **Architecture & Flow** (neo4j_hybrid_search/neo4j_hybrid_search_indexing.md):
  - `ensure_vector_index` asserts vector/chunk/`section_fulltext` indexes; `vector_search` iterates document-type groups to collect `vector_rows`, `chunk_rows`, `concept_rows`, and optional `fulltext_rows`, deduplicates by `section_id`, and fuses via `_rrf_fuse`.
  - Per-group chunk queries mirror the document-type grouping; `per_group_k` equals `top_k` when filters apply or `max(top_k, 10)` otherwise.
  - Concept matches require `query_text`, use `CONCEPT_MATCH_SCORE=0.70`, and cap sections at `min(top_k, 5)`; keyword hits reuse the new `section_fulltext` index tied to `Section.title`/`content_text`.
- **Schema & Dependencies**:
  - `schema.indexes` adds `section_fulltext` to speed keyword retrieval.
  - Pipeline relies on `pipeline.config.EMBEDDING_DIMENSIONS`, Neo4j sessions via `pipeline.graph.connection.get_session`, and filtered `PolicyConcept` nodes (`content_length`, `section_number`).
  - Implementation files include `packages/pipeline/src/pipeline/embeddings/indexer.py` and `packages/pipeline/src/pipeline/graph/schema.py`.
- **Facts**:
  - Hybrid search fuses four signals (embeddings, chunk embeddings, concept matches, keyword hits) via RRF (k=60).
  - Chunk search sizing adapts per group with a floor of 10 when no filters are applied.
  - Schema includes `section_fulltext` for keyword acceleration.

Refer to each child entry—`neo4j_auth/_index.md`, `railway_neo4j_auth_handling.md`, `neo4j_hybrid_search/_index.md`, and `neo4j_hybrid_search_indexing.md`—for implementation specifics and full procedural guidance.