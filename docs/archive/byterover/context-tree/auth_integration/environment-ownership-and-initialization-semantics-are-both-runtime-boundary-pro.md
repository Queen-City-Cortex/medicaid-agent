---
confidence: 0.89
sources: [auth_integration/_index.md, database_operations/_index.md, agent_architecture/_index.md]
synthesized_at: '2026-07-10T19:50:59.157Z'
type: synthesis
title: Environment ownership and initialization semantics are both runtime-boundary problems
summary: A single mistaken assumption about first-run state causes auth and database failures across the stack.
tags: [environment, auth, neo4j, runtime-boundaries]
related: []
keywords: [initialization, runtime, password, callback, proxy, volume, origin, authkit]
createdAt: '2026-07-10T19:50:59.157Z'
updatedAt: '2026-07-10T19:50:59.157Z'
---

# Environment ownership and initialization semantics are both runtime-boundary problems

auth_integration and database_operations both show that initialization-only settings cannot be treated like mutable runtime state. Public callback origins must be resolved live, while Neo4j passwords and NEO4J_AUTH behave differently on first volume setup versus existing databases, requiring live password changes through the proxy.

## Evidence

- **auth_integration**: Public callback origins must not rely on internal container hostnames; the baseURL is computed dynamically to avoid redirects to 0.0.0.0 or similar internal hosts.
- **database_operations**: NEO4J_AUTH only sets the password on first volume initialization; existing databases require live password changes, often via the bolt TCP proxy.
- **agent_architecture**: Operational guidance emphasizes runtime-owned configuration and warns against build-time assumptions for values that only exist correctly at runtime.
