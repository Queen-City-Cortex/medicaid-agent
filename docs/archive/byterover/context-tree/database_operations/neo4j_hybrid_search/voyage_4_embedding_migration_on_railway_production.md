---
title: Voyage 4 Embedding Migration on Railway Production
tags: []
related: [database_operations/neo4j_hybrid_search/context.md, database_operations/neo4j_hybrid_search/neo4j_hybrid_search_indexing.md, database_operations/neo4j_hybrid_search/hybrid_retrieval_collection_and_finalization.md, database_operations/neo4j_hybrid_search/waiver_range_decision_for_subpart_g_and_h.md, database_operations/neo4j_hybrid_search/source_selection_metadata_for_fee_schedules.md, database_operations/neo4j_hybrid_search/deploy_data_script_and_refresh_workflow.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-06-15T20:02:00.938Z'
updatedAt: '2026-06-15T20:02:00.938Z'
---
## Raw Concept
**Task:**
Document a Railway production deployment that migrated Neo4j embeddings from the previous model to voyage-4 and verified the result.

**Changes:**
- Authenticated Railway CLI with an account API token for project operations
- Created and later deleted a temporary Neo4j TCP proxy through GraphQL mutations
- Re-embedded the remote Neo4j graph in place with voyage-4 embeddings
- Deployed the agent by pushing commit b739229 to main
- Verified health and live retrieval quality after deployment

**Files:**
- Railway project medicaid-agent
- Neo4j service 1de48388
- Agent service 5f1decc0
- Web service 903a72cc

**Flow:**
authenticate Railway CLI -> create temporary Neo4j TCP proxy -> null embeddings and re-embed in place -> push to main -> auto-deploy agent -> verify /healthz and vector query -> delete proxy

**Timestamp:** 2026-06-15

**Patterns:**
- `^voyage-4$` - Embedding model used for the production re-embed

## Narrative
### Structure
This is a production-operations note for the Railway-hosted medicaid-agent stack. It records the exact deployment sequence, the temporary proxy requirement for private Neo4j access, the in-place re-embedding process, and the post-deploy verification steps.

### Dependencies
Depends on Railway project access, GraphQL tcp proxy mutations, Neo4j connectivity, and the GitHub repo-triggered deployment pipeline. The live graph uses the code default voyage-4 because the environment does not override VOYAGE_MODEL.

### Highlights
The migration was non-destructive, succeeded without errors or missing embeddings, and confirmed both service health and retrieval correctness. The rollback path is explicitly preserved by re-nullifying embeddings and re-embedding with voyage-law-2.

### Rules
Non-destructive re-embedding was required. The temporary TCP proxy was created only for the embedding run and deleted afterward. The agent deploy was triggered by main-branch git push, while the web service was skipped because it had no relevant change.

### Examples
Health check example: /healthz ok. Retrieval example: a live voyage-4 vector query returned the expected clinical_policy sections with 0.83+ cosine similarity.

## Facts
- **embedding_model**: The production deployment migrated remote Neo4j embeddings to voyage-4 on 2026-06-15. [project]
- **railway_cli_auth**: Railway account API token authentication works for project commands, but railway whoami fails with account tokens. [environment]
- **railway_project_ids**: The Railway project id is 2a11b10b and the production environment id is 1c44225d. [environment]
- **railway_service_ids**: Neo4j service id is 1de48388, agent service id is 5f1decc0, and web service id is 903a72cc. [environment]
- **neo4j_tcp_proxy**: A TCP proxy had to be created via GraphQL tcpProxyCreate because the CLI had no tcp-proxy command. [project]
- **reembed_strategy**: The re-embedding was non-destructive and did not use deploy-data.sh wipe-and-rebuild. [project]
- **reembed_counts**: The remote graph re-embed processed 19,855 sections and 2,821 chunks with 1024 dimensions, 0 errors, and 0 missing embeddings. [project]
- **deploy_trigger**: The agent deploy was triggered by git push origin main on commit b739229 via GitHub repoTrigger. [project]
- **deploy_status**: The agent deployment reached SUCCESS and the web service was skipped because the change was irrelevant to the web app. [project]
- **health_verification**: Health verification passed with /healthz reporting Neo4j connected and storage writable. [project]
- **vector_query_verification**: A live voyage-4 vector query returned correct clinical_policy sections at 0.83+ cosine. [project]
- **env_model_pins**: The Railway agent environment only pins AGENT_MODEL=gpt-5.4 and does not override VOYAGE_MODEL, so the code default voyage-4 applies. [project]
- **remote_graph_snapshot**: The remote graph is a smaller and older snapshot than local, with 49,166 sections and no change_notice docs. [project]
- **rollback_path**: The migration is reversible by NULLing embeddings and re-embedding with voyage-law-2. [project]
