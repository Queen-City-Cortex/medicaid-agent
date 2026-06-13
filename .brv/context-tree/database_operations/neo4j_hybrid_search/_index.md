---
children_hash: 91402e0c6733ee46762f9d912ba1494c4f4fa9828cec6dd1932bb444b733e8ab
compression_ratio: 0.5027322404371585
condensation_order: 1
covers: [context.md, neo4j_hybrid_search_indexing.md]
covers_token_total: 915
summary_level: d1
token_count: 460
type: summary
---
## Neo4j Hybrid Search

Covers the Neo4j-backed retrieval layer that combines vector search, chunk embeddings, concept graph matches, and fulltext keyword search into a single hybrid ranking pipeline. The main drill-down entry is **Neo4j Hybrid Search Indexing**, with the topic-level overview in **context.md**.

### Core architecture
- **Indexing and schema setup**: `ensure_vector_index` asserts the presence of `section_embeddings`, `chunk_embeddings`, and `section_fulltext` indexes.
- **Hybrid retrieval**: `vector_search` gathers multiple signal types per document-type group, deduplicates by `section_id`, then fuses scores with **Reciprocal Rank Fusion** using **RRF_K = 60**.
- **Search signals included**:
  - section embeddings
  - chunk embeddings
  - concept graph matches
  - fulltext keyword hits

### Key behaviors and rules
- Concept and fulltext search only run when `query_text` is provided.
- Concept matches are limited to up to `min(top_k, 5)` sections and use a fixed **CONCEPT_MATCH_SCORE = 0.70**.
- Each source list is de-duplicated by keeping the highest score per `section_id` before fusion.
- Fulltext search follows the same document-type group iteration as vector search.
- Chunk embedding search mirrors the per-type-group pattern used for section embeddings.

### Dependencies and schema details
- Depends on `pipeline.config.EMBEDDING_DIMENSIONS` for index creation.
- Uses `pipeline.graph.connection.get_session` for Neo4j access.
- Concept matching relies on `PolicyConcept` nodes with aliases and section filters such as `content_length > 200` and `section_number`.
- Schema support includes a `section_fulltext` index over `Section.title` and `Section.content_text`.

### Related entry
- **Neo4j Hybrid Search Indexing** — implementation details, flow, rules, and facts for the hybrid fusion pipeline.