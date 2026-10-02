---
confidence: 0.92
sources: [auth_integration/_index.md, database_operations/_index.md, agent_architecture/_index.md]
synthesized_at: '2026-06-21T19:22:42.190Z'
type: synthesis
title: Runtime boundary bugs cluster around deployment, auth, and database initialization
summary: Deployment failures often come from confusing public runtime state with internal or first-run configuration semantics.
tags: [deployment, auth, database, runtime, config]
related: []
keywords: [deployment, runtime, boundary, neo4j, init, env, callback, credentials]
createdAt: '2026-06-21T19:22:42.190Z'
updatedAt: '2026-06-21T19:22:42.190Z'
---

# Runtime boundary bugs cluster around deployment, auth, and database initialization

auth_integration, database_operations, and agent_architecture all show that the same class of bug appears when build-time assumptions are mistaken for live runtime state, whether for callback URLs, env ownership, or Neo4j password initialization.

## Evidence

- **auth_integration**: Neo4j credential behavior differs on fresh volume initialization versus existing instances.
- **database_operations**: NEO4J_AUTH only sets the password on first volume initialization; it does not update existing databases.
- **agent_architecture**: Runtime boundary correctness appears repeatedly: configuration and credentials must be resolved at live runtime, not assumed at build time.
