---
children_hash: c389fd29b610f40facf4bb882027645430c2c8f593df3cef215317d24fd3b0fe
compression_ratio: 0.7296786389413988
condensation_order: 2
covers: [context.md, neo4j_auth/_index.md]
covers_token_total: 529
summary_level: d2
token_count: 386
type: summary
---
## database_operations Domain Overview
- **Purpose & Ownership**: Captures operational knowledge around database deployments, especially authentication issues; maintained by the Platform Infrastructure Team for debugging and incident response (`context.md`).
- **Scope**: Focused on database connection/authentication incidents, environment-specific quirks, and password/configuration guidance; explicitly excludes general app design or non-database infra topics (`context.md`).

## Neo4j Authentication Handling (neo4j_auth)
- **Summary & Drill‑Down**: See `context.md` and `railway_neo4j_auth_handling.md` under `database_operations/neo4j_auth/` for detailed operational steps and environment behavior.
- **Key Facts & Constraints**
  - Railway decodes env vars before they reach Neo4j, turning `+` into spaces and corrupting encoded passwords (`context.md`, `railway_neo4j_auth_handling.md`).
  - `NEO4J_AUTH` only applies during volume initialization; existing clusters require in‑database password changes (`railway_neo4j_auth_handling.md`).
- **Password Rotation Workflow**
  - Deploy injects env vars → decoded `+` breaks auth → rotate to alphanumeric-only password (`railway_neo4j_auth_handling.md`).
  - Use bolt TCP proxy and `ALTER CURRENT USER SET PASSWORD` so the running instance accepts the new credentials (`railway_neo4j_auth_handling.md`).
- **Dependencies**: Bolt TCP proxy is required for live password rotations; the Neo4j configuration is consumed by the Medicaid agent documented in `agent_architecture/nc_medicaid_agent`.