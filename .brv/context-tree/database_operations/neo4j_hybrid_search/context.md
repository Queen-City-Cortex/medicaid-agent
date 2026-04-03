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
