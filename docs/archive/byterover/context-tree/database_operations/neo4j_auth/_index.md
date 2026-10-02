---
children_hash: 6b596cdd78b5168067ba59f114895d5a39dc4c2b463033456619db89b164b12c
compression_ratio: 0.44366197183098594
condensation_order: 1
covers: [context.md, production_neo4j_federal_data_refresh.md, railway_neo4j_auth_handling.md]
covers_token_total: 1420
summary_level: d1
token_count: 630
type: summary
---
# Neo4j Authentication and Production Refresh

## Scope
This cluster documents Railway-specific Neo4j authentication behavior and the safe production refresh path for federal data. The main thread is that Railway environment handling can break Neo4j auth unless credentials are chosen and applied carefully, and production refreshes must be targeted rather than destructive.

## Core Topics

### `context.md` — neo4j_auth
- Overview of Neo4j authentication on Railway, including environment variable encoding, password rotation workarounds, and the `NEO4J_AUTH` lifecycle.
- Related to `agent_architecture/nc_medicaid_agent` for Neo4j usage in the Medicaid agent.
- Drill down here for the broader auth/infra context.

### `railway_neo4j_auth_handling.md`
- Railway URL-decodes environment variables, so `+` becomes a space and can corrupt Neo4j passwords.
- Fix used: rotate to an alphanumeric-only password and apply it with `ALTER CURRENT USER SET PASSWORD` through the bolt TCP proxy.
- Key constraint: `NEO4J_AUTH` only sets the password on first volume initialization; it does not update existing databases.
- Related to `neo4j_hybrid_search_indexing` and `neo4j_auth/context.md` for adjacent graph/auth behavior.

### `production_neo4j_federal_data_refresh.md`
- Production refresh must **not** use `deploy-data.sh load --reset`; that path is destructive.
- Safe flow: enable Railway TCP proxy → set `NEO4J_URI` and `NEO4J_PASSWORD` → ingest SSA/CFR → extract references → embed incrementally → disable proxy.
- Refresh is targeted to the federal slice; unchanged sections retain embeddings, and the clinical corpus is left untouched.
- Verified production scale noted: 48,720 sections and 1,877 docs.
- Depends on Railway CLI access, TCP proxy enabled in Railway, and production credentials sourced from `NEO4J_AUTH`.

## Shared Patterns and Relationships
- **Railway proxy is central**: both auth remediation and production refresh use the bolt TCP proxy.
- **Credential handling is environment-sensitive**: Railway decoding behavior makes password choice and initialization semantics critical.
- **Incremental update over rebuild**: production graph maintenance preserves existing data, supersession edges, and embeddings where unchanged.

## Drill-Down Guide
- For Railway auth encoding and password rotation: `railway_neo4j_auth_handling.md`
- For safe production refresh procedure: `production_neo4j_federal_data_refresh.md`
- For the broader Neo4j auth topic and related Medicaid-agent context: `context.md`