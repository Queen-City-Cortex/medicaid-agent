---
children_hash: 8f17364e41ef39eb3e5865071ca7f36da2ca30f2a2602d6ee4ef8cf2530aef8f
compression_ratio: 0.4393063583815029
condensation_order: 1
covers: [context.md, local_development_setup.md]
covers_token_total: 865
summary_level: d1
token_count: 380
type: summary
---
# Local Dev Setup (agent_architecture/local_dev_setup)
- **Purpose**: Captures how to start the NC Medicaid Navigator local stack (Neo4j + @nc-medicaid/web + @nc-medicaid/agent) with Mastra-aware workflows.
- **Heat**: Neo4j dev container, root npm scripts, and Mastra `.env` placement are the core levers, per `context.md`.

## Workflow & Architecture (`local_development_setup.md`)
- **Flow**: Ensure `packages/agent/.env` exists (root symlink) so Mastra sees credentials, then run `npm run dev` from repo root; script brings Neo4j up via `docker compose up -d neo4j`, starts both dev servers in parallel, waits for completion, and relies on Turbo-powered workspace orchestration.
- **Infrastructure control**: `npm run dev:infra` spins up Docker infra (`docker compose up -d`), `npm run dev:stop` tears it down; `dev:web`/`dev:agent` run single workspace servers.
- **Dependencies**: Requires Docker Compose, npm workspaces (`packages/*` via npm@11.11.0), Turbo ^2.0.0, TypeScript ^5.5.0, and the `.env` symlink for Mastra.
- **Neo4j specifics**: `docker-compose.yml` defines a Neo4j 5 service exposing ports 7474/7687, persisting to `neo4j-data`, authenticating with `NEO4J_AUTH=neo4j/medicaid-dev`.
- **Rules**: Keep `.env` in `packages/agent/` with repo-root symlink; always run `npm run dev` for the consolidated start sequence; use infra scripts for Docker lifecycle.

## Related Topics
- See `agent_architecture/mastra_server_configuration/context.md` for upstream Mastra server details linked via `context.md`.