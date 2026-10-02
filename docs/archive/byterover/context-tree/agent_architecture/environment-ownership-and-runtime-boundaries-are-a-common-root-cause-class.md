---
confidence: 0.89
sources: [auth_integration/_index.md, agent_architecture/_index.md, database_operations/_index.md]
synthesized_at: '2026-06-23T02:57:24.792Z'
type: synthesis
title: Environment ownership and runtime boundaries are a common root cause class
summary: Several reliability bugs come from mixing build-time assumptions with runtime-owned configuration and state.
tags: [env, auth, database, runtime-boundaries]
related: []
keywords: [env, bootstrap, runtime, callback, neo4j, symlink, secrets, state]
createdAt: '2026-06-23T02:57:24.792Z'
updatedAt: '2026-06-23T02:57:24.792Z'
---

# Environment ownership and runtime boundaries are a common root cause class

Across auth, deployment, and database operations, the same class of bugs appears whenever build-time or first-run assumptions are used for runtime-owned values. `auth_integration` resolves public callback origins dynamically; `agent_architecture` centralizes environment ownership and symlinks package env files to the root `.env`; `database_operations` treats Neo4j credentials as initialization-only for first volume setup and requires live password changes for existing instances. These entries collectively show that runtime state must be sourced from the live environment, not inferred from the build artifact or initial bootstrap.

## Evidence

- **auth_integration**: Public-facing callback origins must be resolved dynamically at request/runtime, not from static build-time defaults.
- **agent_architecture**: The root .env is the source of truth, with package env files symlinked so runtime settings stay aligned.
- **database_operations**: NEO4J_AUTH only sets the password on first volume initialization; existing databases require live password changes, not reinitialization.
