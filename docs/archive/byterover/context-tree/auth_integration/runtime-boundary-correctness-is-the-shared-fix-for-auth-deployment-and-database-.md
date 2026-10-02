---
confidence: 0.98
sources: [auth_integration/_index.md, agent_architecture/_index.md, database_operations/_index.md]
synthesized_at: '2026-06-23T02:10:57.424Z'
type: synthesis
title: Runtime-boundary correctness is the shared fix for auth, deployment, and database initialization
summary: Several failures come from confusing build-time or first-run configuration with live runtime state, especially for origins, env ownership, and Neo4j auth.
tags: [runtime, auth, database, env]
related: []
keywords: [runtime, build-time, origin, env, symlink, neo4j, initialization, credentials]
createdAt: '2026-06-23T02:10:57.424Z'
updatedAt: '2026-06-23T02:10:57.424Z'
---

# Runtime-boundary correctness is the shared fix for auth, deployment, and database initialization

Across auth_integration, agent_architecture, and database_operations, reliability issues recur when build-time assumptions leak into runtime configuration. Auth callback routing must compute public origins at request time, the repo centralizes `.env` as the source of truth via symlinks, and Neo4j credentials only initialize on first volume setup so existing databases require live password changes.

## Evidence

- **auth_integration**: Authentication reliability depends on resolving public callback origins at runtime and not using internal container hostnames like 0.0.0.0.
- **agent_architecture**: The root .env is the single source of truth, with app-specific env files symlinked to it to keep runtime configuration aligned.
- **database_operations**: NEO4J_AUTH only sets the password on first volume initialization; it does not update an existing database.
