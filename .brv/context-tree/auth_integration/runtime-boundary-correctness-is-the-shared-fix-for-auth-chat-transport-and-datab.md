---
confidence: 0.98
sources: [auth_integration/_index.md, frontend_ui/_index.md, database_operations/_index.md]
synthesized_at: '2026-06-19T16:49:15.255Z'
type: synthesis
title: Runtime boundary correctness is the shared fix for auth, chat transport, and database state
summary: Several failures come from confusing build-time or initialization state with live runtime values.
tags: [auth, runtime-boundary, chat-transport, neo4j]
related: []
keywords: [runtime, origin, callback, resourceId, threadId, credentials, proxy, initialization, auth, state]
createdAt: '2026-06-19T16:49:15.255Z'
updatedAt: '2026-06-19T16:49:15.255Z'
---

# Runtime boundary correctness is the shared fix for auth, chat transport, and database state

Across auth_integration, frontend_ui, and database_operations, the same reliability pattern appears: public origins, access tokens, thread identity, and Neo4j credentials must be resolved from live runtime state, not static build-time or first-run assumptions. Auth callback routing must compute a public base URL at request time; chat transport must include resourceId/threadId so useChat reinitializes correctly on auth changes; and Neo4j auth must be treated as initialization-only, with existing volumes requiring runtime password updates.

## Evidence

- **auth_integration**: Auth reliability depends on deriving a stable public origin at runtime before calling handleAuth, with callback origin resolution order of NEXT_PUBLIC_WORKOS_REDIRECT_URI, WORKOS_REDIRECT_URI, then RAILWAY_PUBLIC_DOMAIN.
- **frontend_ui**: useChat identity expands from threadId to threadId:resourceId, and DefaultChatTransport is memoized on threadId, resourceId, and getAccessToken so the transport refreshes when auth changes.
- **database_operations**: NEO4J_AUTH only initializes credentials on first volume setup and does not update existing databases, so production fixes must use live password changes through the bolt proxy.
