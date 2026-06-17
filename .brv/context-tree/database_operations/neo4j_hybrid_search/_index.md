---
children_hash: 218a6af0784b8ab65a018c49dec2973ac74dd5043713ae89624e2e6cbd0fed7a
compression_ratio: 0.43436578171091444
condensation_order: 1
covers: [context.md, deploy_data_script_and_refresh_workflow.abstract.md, deploy_data_script_and_refresh_workflow.md, deploy_data_script_and_refresh_workflow.overview.md, neo4j_hybrid_search_indexing.md, voyage_4_embedding_migration_on_railway_production.md]
covers_token_total: 2712
summary_level: d1
token_count: 1178
type: summary
---
## database_operations / neo4j_hybrid_search

Covers the Neo4j retrieval layer used by the pipeline: vector and chunk embeddings, fulltext indexing, and hybrid relevance fusion across multiple signals. The topic centers on `ensure_vector_index` / `ensure_schema` responsibilities and `vector_search` composition, with drill-down detail in `neo4j_hybrid_search_indexing.md`.

### Key structure and behavior
- Hybrid retrieval merges:
  - section embeddings
  - chunk embeddings
  - concept graph matches
  - fulltext keyword hits
- Fusion uses Reciprocal Rank Fusion with `RRF_K = 60`.
- Search is performed per document-type group, then deduplicated by `section_id` before fusion.
- `section_fulltext` indexes `Section.title` and `Section.content_text` for keyword search.

### Important rules and constraints
- Deduplicate each source list by keeping the highest score per `section_id` before fusing.
- Concept matches only run when `query_text` is present.
- Concept matches use a fixed `CONCEPT_MATCH_SCORE = 0.70` and cap results at `min(top_k, 5)`.
- Fulltext queries follow the same document-type grouping as vector search and honor per-group limits.
- Chunk embedding queries use per-group limits similar to section embeddings.

### Dependencies and related areas
- Depends on `pipeline.config.EMBEDDING_DIMENSIONS` for index creation.
- Uses `pipeline.graph.connection.get_session` for Neo4j access.
- Concept matching depends on `PolicyConcept` nodes, aliases, and section filters such as `content_length > 200` and `section_number`.
- Related context: `database_operations/neo4j_auth/railway_neo4j_auth_handling.md`.

### Drill-down entry
- `neo4j_hybrid_search_indexing.md` — full indexing and fusion implementation details.

---

## database_operations / neo4j_hybrid_search / deploy_data_script_and_refresh_workflow

Documents the remote Neo4j refresh/deployment script `scripts/deploy-data.sh`, which performs a destructive reload pipeline and requires explicit operator confirmation plus Railway connectivity. The script is designed for remote graph refreshes, not incremental updates.

### Workflow outline
- Validate `NEO4J_HOST`
- Read `NEO4J_AUTH` from Railway variables
- Confirm destructive wipe
- Create schema
- Run `load --reset`
- Ingest CFR
- Ingest SSA
- Extract references
- Detect amendments
- Embed
- Seed concepts
- Link concepts
- Emit final stats

### Important operational rules
- Missing `NEO4J_HOST` exits with usage instructions.
- Railway CLI login is required.
- Railway TCP proxy must be enabled before connection succeeds.
- Non-interactive shells refuse to wipe without confirmation.
- `--yes` bypasses the prompt.
- Step 2 is the irreversible point: `load --reset` drops all nodes and relationships.
- Disable the TCP proxy after migration completes.

### Drill-down entries
- `deploy_data_script_and_refresh_workflow.md` — structured workflow and rules.
- `deploy_data_script_and_refresh_workflow.overview.md` — concise operational summary.
- `deploy_data_script_and_refresh_workflow.abstract.md` — short note on destructive refresh behavior.

---

## database_operations / neo4j_hybrid_search / voyage_4_embedding_migration_on_railway_production

Records a production Railway deployment that migrated the remote Neo4j graph embeddings to `voyage-4` and verified the result end-to-end. This is a non-destructive re-embedding operation, distinct from the wipe-and-rebuild refresh workflow.

### Deployment sequence
- Authenticate Railway CLI with an account API token
- Create a temporary Neo4j TCP proxy via GraphQL mutations
- Null existing embeddings and re-embed in place
- Push commit `b739229` to `main`
- Trigger agent deployment automatically
- Verify `/healthz` and live vector retrieval
- Delete the temporary proxy

### Key operational facts
- The production environment uses the code default `voyage-4` because `VOYAGE_MODEL` is not overridden.
- `AGENT_MODEL=gpt-5.4` is pinned in the Railway agent environment.
- The deployment succeeded with no errors or missing embeddings.
- The web service was skipped because the change did not affect the web app.
- Health checks confirmed Neo4j connectivity and writable storage.
- Retrieval validation returned expected `clinical_policy` sections with `0.83+` cosine similarity.
- Rollback is possible by nulling embeddings again and re-embedding with `voyage-law-2`.

### Environment and resource identifiers
- Railway project id: `2a11b10b`
- Production environment id: `1c44225d`
- Neo4j service id: `1de48388`
- Agent service id: `5f1decc0`
- Web service id: `903a72cc`

### Drill-down entry
- `voyage_4_embedding_migration_on_railway_production.md` — full deployment record, verification, and rollback path.