---
children_hash: 697043287a759200a8e530d0d08d8a0837a389ed575f3e07937108099617db3b
compression_ratio: 0.5575079872204473
condensation_order: 1
covers: [context.md, railway_neo4j_auth_handling.md]
covers_token_total: 626
summary_level: d1
token_count: 349
type: summary
---
## Neo4j Authentication on Railway

This topic covers how Railway’s environment-variable decoding affects Neo4j authentication and how password rotation must be handled for existing volumes. Drill down into **railway_neo4j_auth_handling.md** for the remediation details, and use **context.md** for the topic overview and related Neo4j usage context.

### Core structure
- **Railway env var handling**: Railway URL-decodes injected environment variables, so `+` becomes a space before Neo4j receives the password.
- **NEO4J_AUTH lifecycle**: `NEO4J_AUTH` only sets credentials on first volume initialization and does not update existing databases.
- **Password rotation workaround**: Existing instances require `ALTER CURRENT USER SET PASSWORD` executed through the bolt TCP proxy.

### Key incident and remediation
- A Neo4j authentication failure occurred because a URL-encoded password was mutated by Railway’s decoding behavior.
- The password was rotated to an alphanumeric-only value: `***REDACTED***`.
- The new password was applied live via the bolt proxy using `ALTER CURRENT USER SET PASSWORD`, restoring connectivity.

### Relationships
- Related to **database_operations/neo4j_hybrid_search/neo4j_hybrid_search_indexing.md** for broader Neo4j search/indexing behavior.
- Related to **agent_architecture/nc_medicaid_agent** for how Neo4j is used in the Medicaid agent.