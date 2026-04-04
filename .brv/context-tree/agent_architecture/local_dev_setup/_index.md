---
children_hash: 7c109c5a7e404aaeae598c5014428872e11f8111b034efb03b8ac456877cec83
compression_ratio: 0.34139637163276526
condensation_order: 1
covers: [context.md, env_consolidation/_index.md, environment_variable_consolidation.md, local_development_setup.md]
covers_token_total: 1819
summary_level: d1
token_count: 621
type: summary
---
# Local Development Setup (Agent Architecture Domain)

- **Overview**: `local_dev_setup/context.md` captures repo prerequisites for starting NC Medicaid Navigator stacks (Neo4j, Mastra agent, web), highlighting Neo4j dev container settings, root package scripts orchestrating docker compose plus workspace dev servers, and the expected locations for `packages/agent/.env` and other Mastra secrets.

- **Local Development Workflow** (`local_development_setup.md`):
  - **Architecture & Flow**: Docker Compose (via `docker-compose.yml`) spins up `neo4j:5` with ports 7474/7687 and volume `neo4j-data`, while root `package.json` scripts (`npm run dev`, `dev:infra`, `dev:stop`, `dev:web`, `dev:agent`) manage the Neo4j infra and @nc-medicaid/web + @nc-medicaid/agent dev servers in parallel, all relying on npm workspaces (`packages/*`) and Turbo/TypeScript dev tooling.
  - **Rules/Dependencies**: Mastra expects `.env` under `packages/agent/` (symlinked from repo root), `npm run dev` must be executed from repo root to sequentially start Neo4j then both dev servers, and `dev:infra`/`dev:stop` control Docker lifecycle.
  - **Key Facts**: Neo4j auth uses `NEO4J_AUTH=neo4j/medicaid-dev`; npm@11.11 workspaces; dev scripts coordinate Docker+workspaces; dev dependencies include Turbo ^2.0.0 and TypeScript ^5.5.0.

- **Environment Variable Consolidation** (`environment_variable_consolidation.md` & `env_consolidation/subtopic`):
  - **Task & Changes**: Replaced circular symlink chain with a single root `.env` (adjacent to packages) containing all LLM API keys (OpenAI, Anthropic, Voyage), WorkOS client credentials (client ID/API key/cookie password/redirect URIs), the WorkOS test user email (`Testing@queencitycortex.com`), and other shared secrets; `packages/agent/.env` and `packages/web/.env.local` are now absolute symlinks to this root file.
  - **Flow**: Create/expand root `.env` → delete stale symlinks → repoint agent/web `.env` files as absolute symlinks → reload services so Neo4j/agent/web stacks read consolidated secrets.
  - **Dependencies & Decisions**: Both agent and web packages depend on symlinked paths to root `.env`, requiring any credential update at the root before restarting. Centralizing secrets avoids duplication, stale keys, and ensures synchronized AWS WorkOS/LLM credentials for tooling expecting legacy paths.

- **Related drill-down**: For overarching agent configuration context, see `@agent_architecture/mastra_server_configuration/context.md`.