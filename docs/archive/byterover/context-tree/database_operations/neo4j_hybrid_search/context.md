---
related: [database_operations/neo4j_hybrid_search/neo4j_hybrid_search_indexing.md, database_operations/neo4j_hybrid_search/voyage_4_embedding_migration_on_railway_production.md, database_operations/neo4j_hybrid_search/hybrid_retrieval_collection_and_finalization.md, database_operations/neo4j_hybrid_search/waiver_range_decision_for_subpart_g_and_h.md, database_operations/neo4j_hybrid_search/source_selection_metadata_for_fee_schedules.md, database_operations/neo4j_hybrid_search/deploy_data_script_and_refresh_workflow.md]
---
# Topic: neo4j_hybrid_search

## Overview
Covers Neo4j search indexing, vector/chunk embedding indexes, and the Reciprocal Rank Fusion hybrid retrieval that merges embeddings, concept matches, and fulltext hits for the pipeline.

## Key Concepts
- Vector and chunk embeddings per document-type group
- Reciprocal Rank Fusion smoothing constant RRF_K = 60
- Fulltext search on Section title/content
- Concept graph matching gated by query_text

## Related Topics
- database_operations/neo4j_auth/railway_neo4j_auth_handling.md
