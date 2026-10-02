---
confidence: 0.92
sources: [frontend_ui/_index.md, auth_integration/_index.md]
synthesized_at: '2026-06-12T17:22:51.304Z'
type: synthesis
title: Runtime identity drives both auth transport and chat state
summary: Thread identity and auth state are the shared keys that keep chat transport, memory, cache, and persistence aligned.
tags: [auth, chat-ui, transport, memory, proxy]
related: []
keywords: [threadId, resourceId, callback-origin, transport, auth-state, memory, cache, proxy]
createdAt: '2026-06-12T17:22:51.304Z'
updatedAt: '2026-06-12T17:22:51.304Z'
---

# Runtime identity drives both auth transport and chat state

Across frontend_ui and auth_integration, the system treats runtime identity as the coordination boundary: frontend_ui expands `useChat` identity to `threadId:resourceId`, memoizes `DefaultChatTransport` on auth inputs, and uses cache/pending-restore flows keyed by thread; auth_integration emphasizes resolving public callback origins at runtime and handling proxy behavior through environment-aware boundaries so authentication transitions remain stable.

## Evidence

- **frontend_ui**: `useChat` identity was expanded from `threadId` to `threadId:resourceId`, `DefaultChatTransport` is memoized on `threadId`, `resourceId`, and `getAccessToken`, and thread/cache restoration is keyed by `threadId`.
- **auth_integration**: Authentication reliability depends on resolving runtime environment boundaries correctly, deriving a stable public callback origin from environment fallbacks before calling `handleAuth`, and using framework-compatible proxy entrypoints.
