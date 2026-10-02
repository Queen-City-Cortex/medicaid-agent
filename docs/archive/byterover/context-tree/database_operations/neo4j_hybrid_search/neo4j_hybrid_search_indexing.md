---
title: Neo4j Hybrid Search Indexing
tags: []
related: [database_operations/neo4j_auth/railway_neo4j_auth_handling.md, database_operations/neo4j_hybrid_search/context.md, database_operations/neo4j_hybrid_search/voyage_4_embedding_migration_on_railway_production.md, database_operations/neo4j_hybrid_search/hybrid_retrieval_collection_and_finalization.md, database_operations/neo4j_hybrid_search/waiver_range_decision_for_subpart_g_and_h.md, database_operations/neo4j_hybrid_search/source_selection_metadata_for_fee_schedules.md, database_operations/neo4j_hybrid_search/deploy_data_script_and_refresh_workflow.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-03T03:41:38.623Z'
updatedAt: '2026-04-03T03:41:38.623Z'
---
## Raw Concept
**Task:**
Describe the Neo4j hybrid search pipeline that ensures required vector/fulltext indexes exist and merges multiple relevance signals.

**Changes:**
- Vector search now merges section embeddings, chunk embeddings, concept matches, and fulltext keywords via Reciprocal Rank Fusion (RRF_K = 60).
- Chunk embeddings search mirrors per-type-group querying used by section embeddings.
- Schema indexes explicitly create section_fulltext to cover Section.title and Section.content_text for keyword search.

**Files:**
- packages/pipeline/src/pipeline/embeddings/indexer.py
- packages/pipeline/src/pipeline/graph/schema.py

**Flow:**
ensure_vector_index asserts section_embeddings, chunk_embeddings, and section_fulltext indexes exist; vector_search gathers vector_rows, chunk_rows, concept_rows, and optional fulltext rows per document-type group, deduplicates each list by section_id, applies _rrf_fuse, sorts by fused score, and returns the top_k results; concept and fulltext searches only execute when query_text is provided and respect document_type filters.

**Timestamp:** 2026-04-03

## Narrative
### Structure
ensure_vector_index builds vector and fulltext indexes while vector_search iterates over document-type groups to collect embeddings, chunks, concept graph hits, and keyword rows before deduplicating and fusing them via _rrf_fuse.

### Dependencies
Depends on pipeline.config.EMBEDDING_DIMENSIONS for index creation, pipeline.graph.connection.get_session for Neo4j access, and PolicyConcept nodes (with aliases) plus section filters (content_length > 200, section_number) for concept matches.

### Highlights
Hybrid search now blends four relevance signals with reciprocal rank fusion (RRF_K = 60) and per-type-group deduplication, while schema.ensure_schema ensures fulltext searches via section_fulltext alongside existing constraints.

### Rules
Rule: De-duplicate each source list by keeping the highest score per section_id before fusing.
Rule: Concept matches require query_text and supply a fixed CONCEPT_MATCH_SCORE = 0.70 for up to min(top_k, 5) sections.
Rule: Fulltext search iterates the same document-type groups as vector_search, limiting each to per_group_k hits.

## Facts
- **hybrid_search_sources**: Hybrid search fuses section embeddings, chunk embeddings, concept graph matches, and fulltext keyword hits using Reciprocal Rank Fusion with k = 60. [project]
- **chunk_search_strategy**: Chunk embedding queries run per document-type group with per_group_k equal to top_k when filtering or max(top_k, 10) otherwise. [project]
- **fulltext_index**: schema.indexes now declares a section_fulltext index on Section.title and Section.content_text to support keyword search. [project]
