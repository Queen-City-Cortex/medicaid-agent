---
children_hash: bcb258e3dd747c1d5d93b40b539c8f403985c60ca93c4d95c4b2e4ea84f2832d
compression_ratio: 0.6931818181818182
condensation_order: 1
covers: [context.md, neo4j_hybrid_search_indexing.md]
covers_token_total: 880
summary_level: d1
token_count: 610
type: summary
---
### neo4j_hybrid_search (context.md)
- **Scope**: Document-level overview of Neo4j hybrid search pipeline, covering vector/chunk embeddings, Reciprocal Rank Fusion, and gated concept/fulltext components.  
- **Architecture**: Combines document-type–grouped vector & chunk embeddings, concept graph matches (query_text gated), and Section title/content fulltext hits through RRF with smoothing constant *RRF_K=60*.  
- **Drill-down**: See `neo4j_hybrid_search_indexing.md` for implementation specifics and the related authentication considerations in `database_operations/neo4j_auth/railway_neo4j_auth_handling.md`.

### Neo4j Hybrid Search Indexing (neo4j_hybrid_search_indexing.md)
- **Task & Flow**: `ensure_vector_index` asserts section embeddings, chunk embeddings, and `section_fulltext` indexes; `vector_search` iterates document-type groups to collect vector_rows, chunk_rows, concept_rows, and optional fulltext rows, deduplicates by `section_id`, applies `_rrf_fuse`, sorts, and returns top‑k results with optional query_text gating for concept/fulltext searches.  
- **Key Decisions**:
  - **Relevance Fusion**: Four signals (section embeddings, chunk embeddings, PolicyConcept matches, keyword hits) are merged via Reciprocal Rank Fusion (*RRF_K=60*) with deduplication per source list.
  - **Chunk Strategy**: Chunk embedding queries mirror the per-type-group pattern; per_group_k equals top_k under filters or max(top_k, 10) otherwise.
  - **Concept & Fulltext Rules**: Concept matches need query_text, use a fixed `CONCEPT_MATCH_SCORE=0.70`, and cap sections at `min(top_k,5)`; fulltext search respects document-type grouping and per-group limits.
- **Schema & Dependencies**:
  - **Indexes**: `schema.indexes` defines `section_fulltext` on `Section.title`/`content_text` for keyword retrieval.
  - **Dependencies**: Relies on `pipeline.config.EMBEDDING_DIMENSIONS`, Neo4j sessions via `pipeline.graph.connection.get_session`, and `PolicyConcept` nodes filtered by `content_length` and `section_number`.
  - **Files**: Implementation spans `packages/pipeline/src/pipeline/embeddings/indexer.py` and `packages/pipeline/src/pipeline/graph/schema.py`.
- **Facts**:
  - Hybrid search blends embeddings, concept matches, and fulltext hits with RRF (k=60).  
  - Chunk searches follow document-type–group querying with adaptive per_group_k sizing.  
  - Schema now includes a `section_fulltext` index to accelerate keyword lookups.