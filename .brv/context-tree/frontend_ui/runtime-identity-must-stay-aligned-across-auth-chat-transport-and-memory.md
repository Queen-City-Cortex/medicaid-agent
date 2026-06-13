---
confidence: 0.97
sources: [frontend_ui/_index.md, auth_integration/_index.md]
synthesized_at: '2026-06-13T05:58:43.645Z'
type: synthesis
title: Runtime identity must stay aligned across auth, chat transport, and memory
summary: Thread and resource identity changes need to recreate chat transport and cache state so auth transitions and persisted messages stay consistent.
tags: [auth, chat, transport, memory]
related: []
keywords: [identity, threadId, resourceId, callback-origin, transport-reinit, cache-restore, runtime-boundary]
createdAt: '2026-06-13T05:58:43.645Z'
updatedAt: '2026-06-13T05:58:43.645Z'
---

# Runtime identity must stay aligned across auth, chat transport, and memory

Across frontend_ui and auth_integration, runtime identity is treated as the boundary that determines whether a chat session, transport, or callback path is still valid. In frontend_ui, `useChat` identity expands to `threadId:resourceId`, `DefaultChatTransport` is memoized on auth-sensitive inputs, and thread-keyed cache restoration waits for the new instance to mount. In auth_integration, callback routing must derive a stable public origin at runtime rather than trusting build-time or internal host assumptions. Together these show that identity changes must be propagated deliberately; otherwise stale transports, broken callbacks, or mismatched chat state appear.

## Evidence

- **frontend_ui**: Chat state is keyed by `threadId:resourceId`, `DefaultChatTransport` depends on auth inputs, and thread cache restoration is deferred until the new instance mounts.
- **auth_integration**: Auth reliability depends on resolving a stable public callback origin at runtime instead of using internal container hostnames or build-time assumptions.
