---
children_hash: 562c7f55900e89148e93fb7b88982eece8dc3024380f0677459cd0244cf5874d
compression_ratio: 0.5470383275261324
condensation_order: 1
covers: [context.md, railway_neo4j_auth_handling.md]
covers_token_total: 574
summary_level: d1
token_count: 314
type: summary
---
## Neo4j Auth (database_operations/neo4j_auth)

- **overview**: Describes Railway’s Neo4j authentication handling, highlighting environment variable encoding quirks and password rotation constraints (see `context.md` for details).
  
- **Railway env var encoding**: Incoming Railway env vars are URL-decoded, so characters like `+` become spaces before reaching Neo4j, which breaks authentication with encoded passwords (`context.md`, `railway_neo4j_auth_handling.md`).

- **Neo4j password lifecycle**: `NEO4J_AUTH` sets credentials only during the initial volume initialization, so existing databases must update passwords directly via Neo4j commands (`railway_neo4j_auth_handling.md`).

- **Password rotation workflow** (`railway_neo4j_auth_handling.md`):
  - Deploy injects env vars → `+` decoded to space → connection fails.
  - Rotate password to alphanumeric string (`***REDACTED***`) to survive decoding.
  - Use the bolt TCP proxy to run `ALTER CURRENT USER SET PASSWORD`, ensuring the running instance accepts the new credentials.

- **Dependencies & relationship**: Bolt TCP proxy is required for live password rotation; `agent_architecture/nc_medicaid_agent` documents how the Medicaid agent consumes this Neo4j configuration.