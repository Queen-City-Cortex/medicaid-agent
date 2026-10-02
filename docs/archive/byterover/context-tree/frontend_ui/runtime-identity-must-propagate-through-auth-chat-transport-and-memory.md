---
confidence: 0.95
sources: [frontend_ui/_index.md, frontend_ui/_index.md, auth_integration/_index.md, auth_integration/_index.md]
synthesized_at: '2026-06-13T20:12:43.254Z'
type: synthesis
title: Runtime identity must propagate through auth, chat transport, and memory
summary: Thread and resource identity must be refreshed together or the UI will mix stale auth, transport, cache, and memory state.
tags: [auth, chat, memory, transport]
related: []
keywords: [runtime identity, threadId, resourceId, transport, cache, callback, workos, memory]
createdAt: '2026-06-13T20:12:43.254Z'
updatedAt: '2026-06-13T20:12:43.254Z'
---

# Runtime identity must propagate through auth, chat transport, and memory

Across frontend_ui and auth_integration, the system treats runtime identity as the coordination signal for chat transport, callback handling, and memory restoration. When auth state changes, transport and cache must be reinitialized with the new identity or the app risks sending requests with stale credentials, restoring the wrong thread state, or redirecting through incorrect public origins.

## Evidence

- **frontend_ui**: useChat identity expands from threadId to threadId:resourceId, with resourceId defaulting to anonymous until auth loads, and DefaultChatTransport is memoized on threadId, resourceId, and getAccessToken.
- **frontend_ui**: Thread cache restoration is delayed until the new useChat instance mounts because setThreadId recreates useChat.
- **auth_integration**: Callback base URL resolution uses runtime values in order: NEXT_PUBLIC_WORKOS_REDIRECT_URI, WORKOS_REDIRECT_URI, then RAILWAY_PUBLIC_DOMAIN to avoid internal hosts like 0.0.0.0.
- **auth_integration**: The shared lesson is that auth failures recur when build, container, and runtime assumptions diverge, so public origins must be resolved at runtime.
