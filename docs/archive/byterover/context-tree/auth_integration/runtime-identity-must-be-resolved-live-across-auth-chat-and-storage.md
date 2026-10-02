---
confidence: 0.98
sources: [auth_integration/_index.md, frontend_ui/_index.md, database_operations/_index.md]
synthesized_at: '2026-07-26T18:01:44.040Z'
type: synthesis
title: Runtime identity must be resolved live across auth, chat, and storage
summary: Live runtime identity, not cached thread or build-time state, is the coordination boundary for auth, chat transport, persistence, and database initialization.
tags: [auth, chat-state, runtime-boundaries, persistence, neo4j]
related: []
keywords: [runtime, identity, boundary, auth, thread, cache, transport, credentials, initialization]
createdAt: '2026-07-26T18:01:44.040Z'
updatedAt: '2026-07-26T18:01:44.040Z'
---

# Runtime identity must be resolved live across auth, chat, and storage

Several domains converge on the same failure mode: assuming identity or ownership is static when it is actually runtime-owned. In auth_integration, callback origins must be derived at runtime and Neo4j credentials only initialize on first volume setup; in frontend_ui, `useChat` identity expands to `threadId:resourceId` and caches must refresh on auth transitions; in database_operations, Railway and Neo4j behavior depends on live credentials and initialization semantics. The shared fix is to resolve identity at the boundary and propagate it through transport, cache, and storage instead of reusing stale snapshots.

## Evidence

- **auth_integration**: Callback origin resolution must follow a runtime fallback chain (`NEXT_PUBLIC_WORKOS_REDIRECT_URI -> WORKOS_REDIRECT_URI -> RAILWAY_PUBLIC_DOMAIN`), and `NEO4J_AUTH` only initializes credentials on first volume setup.
- **frontend_ui**: `useChat` identity was expanded from `threadId` to `threadId:resourceId`, and `DefaultChatTransport` is memoized on `threadId`, `resourceId`, and `getAccessToken` so auth transitions create a fresh instance.
- **database_operations**: Railway-specific Neo4j auth handling requires live password rotation for existing databases because initialization-only settings do not update an existing volume.
