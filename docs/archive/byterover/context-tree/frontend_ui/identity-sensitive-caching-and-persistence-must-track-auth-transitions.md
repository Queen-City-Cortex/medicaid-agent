---
confidence: 0.91
sources: [frontend_ui/_index.md, frontend_ui/_index.md, auth_integration/_index.md]
synthesized_at: '2026-07-26T03:28:08.853Z'
type: synthesis
title: Identity-sensitive caching and persistence must track auth transitions
summary: Thread caches, message persistence, and feedback flows all key off live auth identity so stale user state does not leak across sessions.
tags: [auth, cache, chat, persistence, transport]
related: []
keywords: [thread, rehydrate, token, identity, stale, cache, persistence, auth]
createdAt: '2026-07-26T03:28:08.853Z'
updatedAt: '2026-07-26T03:28:08.853Z'
---

# Identity-sensitive caching and persistence must track auth transitions

frontend_ui and auth_integration share a common invariant: when auth identity changes, every dependent cache or transport layer must be recreated or rehydrated from live identity rather than reusing stale thread-scoped state.

## Evidence

- **frontend_ui**: Thread cache restoration uses pendingRestore plus useEffect to rehydrate cached messages after the new useChat instance mounts, and handleSelectThread must not write to a stale useChat instance.
- **frontend_ui**: useMastraClient recreates the client when access tokens change, and ThreadSidebar ignores 401 responses while useMastraReady is false.
- **auth_integration**: Transport and auth fixes require runtime resolution of the current access token and resource identity instead of relying on build-time assumptions.
