---
confidence: 0.93
sources: [auth_integration/_index.md, agent_architecture/_index.md, database_operations/_index.md]
synthesized_at: '2026-06-13T05:58:43.648Z'
type: synthesis
title: Environment boundaries drive both deployment fixes and auth reliability
summary: Auth and database incidents recur when runtime environment assumptions leak across build, container, and volume boundaries.
tags: [auth, deployment, env, database]
related: []
keywords: [runtime, environment, docker, symlink, bolt-proxy, callback, credentials]
createdAt: '2026-06-13T05:58:43.648Z'
updatedAt: '2026-06-13T05:58:43.648Z'
---

# Environment boundaries drive both deployment fixes and auth reliability

auth_integration, agent_architecture, and database_operations all show that deployment bugs come from mismatched runtime boundaries. Auth callback resolution must use public origins instead of internal hostnames, agent architecture centralizes `.env` at the repo root and symlinks app env files to keep runtime settings synchronized, and Neo4j password handling depends on whether credentials are initializing a fresh volume or modifying an existing instance. The shared lesson is that environment resolution must happen at runtime with explicit ownership of public vs internal settings.

## Evidence

- **auth_integration**: Authentication reliability depends on resolving public callback origins at runtime and not using internal container hostnames like `0.0.0.0`.
- **agent_architecture**: The root `.env` is the single source of truth, with app-specific env files symlinked to it to keep runtime configuration aligned.
- **database_operations**: `NEO4J_AUTH` only initializes credentials on first volume setup; existing Neo4j instances require live password changes through the bolt proxy.
