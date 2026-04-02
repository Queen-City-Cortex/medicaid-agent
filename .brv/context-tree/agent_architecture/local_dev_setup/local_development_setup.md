---
title: Local Development Setup
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-02T17:38:24.098Z'
updatedAt: '2026-04-02T17:38:24.098Z'
---
## Raw Concept
**Task:**
Document how to start the NC Medicaid Navigator local stack for agent and web development.

**Changes:**
- Captured docker compose Neo4j service definition used during development.
- Recorded npm scripts that start Neo4j, agent, and web workspaces along with infra controls.

**Files:**
- docker-compose.yml
- package.json

**Flow:**
Ensure packages/agent/.env exists (linked from repo root) so Mastra sees credentials, run npm run dev to launch Neo4j plus @nc-medicaid/web and @nc-medicaid/agent dev servers in parallel, and toggle docker compose infra via dev:infra or dev:stop when needed.

**Timestamp:** 2026-04-02

**Author:** NC Medicaid Navigator team

## Narrative
### Structure
Local developer workflow is centered on docker-compose and the root package.json. docker-compose.yml defines the Neo4j 5 container with necessary ports, authentication, and storage volume while the workspace-based npm scripts coordinate turbo-powered builds and workspace dev servers.

### Dependencies
Requires Docker Compose for Neo4j, npm workspaces under packages/*, and the .env file that lives in packages/agent/ with a root symlink so Mastra load paths resolve as expected.

### Highlights
npm run dev starts docker compose up -d neo4j, then launches @nc-medicaid/web and @nc-medicaid/agent developer servers before waiting for both to exit, dev:infra/dev:stop manage the docker lifecyle, and dev:web/dev:agent allow targeting individual workspaces when only one frontend/backend process is needed.

### Rules
1. Keep the .env file inside packages/agent/ with a symbolic link at the repository root because Mastra reads packages/agent/.env directly. 2. Run npm run dev from the repo root to sequentially start Neo4j and concurrently start the web + agent dev servers. 3. Use npm run dev:infra to bring up shared Docker infrastructure and npm run dev:stop to tear it down when infrastructure is no longer required.

## Facts
- **neo4j_service**: Docker compose defines a neo4j:5 service exposing ports 7474 and 7687 and persisting data in the neo4j-data volume. [environment]
- **neo4j_auth**: Neo4j authentication uses NEO4J_AUTH=neo4j/medicaid-dev. [environment]
- **npm_workspaces**: The repo relies on npm@11.11.0 with workspace globs packages/*. [project]
- **dev_command**: Running npm run dev executes docker compose up -d neo4j then starts @nc-medicaid/web and @nc-medicaid/agent dev servers in parallel before waiting. [convention]
- **infra_scripts**: dev:infra brings up docker compose up -d and dev:stop tears down docker compose down for infrastructure management. [convention]
- **env_location**: Local .env belongs under packages/agent/ with a symlink at the repository root to satisfy Mastra expectations. [convention]
- **dev_dependencies**: Dev dependencies are turbo ^2.0.0 and typescript ^5.5.0. [project]
