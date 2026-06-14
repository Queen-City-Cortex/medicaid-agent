---
confidence: 0.93
sources: [auth_integration/_index.md, database_operations/_index.md, agent_architecture/_index.md]
synthesized_at: '2026-06-14T19:24:47.071Z'
type: synthesis
title: Runtime boundary bugs cluster around deploy, auth, and database initialization
summary: Deployment issues recur when build-time assumptions are used where live runtime values or initialized state are required.
tags: [runtime, deploy, auth, database]
related: []
keywords: [build-time, runtime, initialization, neo4j, redirect, env, volume, boundary]
createdAt: '2026-06-14T19:24:47.071Z'
updatedAt: '2026-06-14T19:24:47.071Z'
---

# Runtime boundary bugs cluster around deploy, auth, and database initialization

Across auth_integration, database_operations, and agent_architecture, the same failure mode appears repeatedly: values that only exist at runtime or first initialization are mistakenly treated as static build-time configuration, causing auth redirects, Neo4j credentials, and startup behavior to break until the live boundary is respected.

## Evidence

- **auth_integration**: The key failure mode is redirecting to internal hosts such as `0.0.0.0` instead of a public callback origin, so the callback base URL must be resolved dynamically at runtime.
- **database_operations**: `NEO4J_AUTH` only sets the password on first volume initialization; existing databases require a live password rotation through the bolt TCP proxy.
- **agent_architecture**: Local setup centralizes `.env` as the single source of truth and defines the runtime contract for Neo4j, web, and agent stacks, with CI validating the same contract.
