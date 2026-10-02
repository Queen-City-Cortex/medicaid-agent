---
confidence: 0.98
sources: [auth_integration/_index.md, frontend_ui/_index.md, database_operations/_index.md]
synthesized_at: '2026-07-26T03:28:08.850Z'
type: synthesis
title: Runtime-boundary correctness is the shared fix for auth, chat state, and database state
summary: Across auth, frontend chat, and Neo4j ops, bugs come from freezing runtime-owned state too early instead of resolving it from the live boundary.
tags: [auth, frontend, database, runtime-boundary]
related: []
keywords: [callback, identity, memoization, neo4j, initialization, runtime, auth, transport]
createdAt: '2026-07-26T03:28:08.850Z'
updatedAt: '2026-07-26T03:28:08.850Z'
---

# Runtime-boundary correctness is the shared fix for auth, chat state, and database state

The same failure class spans auth_integration, frontend_ui, and database_operations: public callback origins, chat transport/cache identity, and Neo4j password handling all break when build-time or stale state is reused instead of resolving current runtime identity and initialization state.

## Evidence

- **auth_integration**: Auth callback origins must resolve dynamically at request time, and public origins must not use internal hostnames like 0.0.0.0.
- **frontend_ui**: DefaultChatTransport is memoized on threadId, resourceId, and getAccessToken so transport refreshes when auth changes; cached thread messages rehydrate only after the new useChat instance mounts.
- **database_operations**: NEO4J_AUTH only sets the password on first volume initialization; existing databases require live password changes via runtime operations.
