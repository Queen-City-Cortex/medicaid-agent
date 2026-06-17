---
children_hash: f934087bc13405f7b55954060ae9824a1339e5d1c357405c5fd69c5617c97dfb
compression_ratio: 0.31879460745440125
condensation_order: 1
covers: [context.md, deploy_data_script_and_refresh_workflow.md, neo4j_hybrid_search_indexing.md, voyage_4_embedding_migration_on_railway_production.md]
covers_token_total: 2522
summary_level: d1
token_count: 804
type: summary
---
## database_operations/neo4j_hybrid_search

This topic covers the Neo4j hybrid retrieval stack for the pipeline, centered on vector and chunk embeddings, keyword fulltext search, and concept graph matching. It connects closely to `database_operations/neo4j_auth/railway_neo4j_auth_handling.md` and is the shared foundation for both indexing and production embedding migration work.

### Core retrieval structure
- **`context.md`** defines the overall scope: search indexing, vector/chunk embedding indexes, and Reciprocal Rank Fusion (RRF) hybrid retrieval.
- Key retrieval signals:
  - vector embeddings per document-type group
  - chunk embeddings
  - fulltext search over `Section.title` and `Section.content_text`
  - concept graph matches gated by `query_text`
- RRF uses **`RRF_K = 60`** as the smoothing constant.

### Indexing and fusion logic
- **`neo4j_hybrid_search_indexing.md`** documents the indexing and query pipeline:
  - `ensure_vector_index` asserts required indexes exist: `section_embeddings`, `chunk_embeddings`, and `section_fulltext`
  - `vector_search` collects `vector_rows`, `chunk_rows`, `concept_rows`, and optional fulltext rows
  - results are deduplicated by `section_id` before fusion
  - `_rrf_fuse` combines the signals and returns top-k results
- Rules and constraints preserved in this entry:
  - deduplicate each source list by keeping the highest score per `section_id`
  - concept matches require `query_text`
  - concept matches use a fixed `CONCEPT_MATCH_SCORE = 0.70`
  - fulltext search respects the same document-type grouping as vector search
- Facts captured in this entry emphasize:
  - hybrid search fuses embeddings, concept matches, and fulltext hits with RRF
  - chunk searches run per document-type group
  - `section_fulltext` indexes `Section.title` and `Section.content_text`

### Production embedding migration
- **`voyage_4_embedding_migration_on_railway_production.md`** records a Railway production deployment that migrated the remote Neo4j graph to **voyage-4** embeddings.
- Operational sequence:
  - authenticate Railway CLI
  - create a temporary Neo4j TCP proxy
  - null and re-embed the remote graph in place
  - push commit `b739229` to `main`
  - verify `/healthz` and live vector retrieval
  - delete the proxy
- Important operational facts:
  - the migration was **non-destructive**
  - the temporary proxy was required because direct Neo4j access needed a GraphQL `tcpProxyCreate`
  - deploy was triggered by a GitHub repo push to `main`
  - the web service was skipped because the change did not affect it
  - rollback is possible by nulling embeddings and re-embedding with `voyage-law-2`
- Verified outcomes include:
  - `19,855` sections and `2,821` chunks re-embedded
  - `1024` dimensions
  - `0` errors and `0` missing embeddings
  - `/healthz` confirmed Neo4j connectivity and writable storage
  - live retrieval returned expected clinical policy sections with `0.83+` cosine similarity

### Drill-down map
- `context.md` — topic overview and scope
- `neo4j_hybrid_search_indexing.md` — index creation and hybrid ranking pipeline
- `voyage_4_embedding_migration_on_railway_production.md` — production embedding migration and verification