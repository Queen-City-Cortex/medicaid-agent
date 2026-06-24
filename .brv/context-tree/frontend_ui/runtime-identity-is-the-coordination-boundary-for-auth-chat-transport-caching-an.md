---
confidence: 0.97
sources: [auth_integration/_index.md, frontend_ui/_index.md, frontend_ui/_index.md]
synthesized_at: '2026-06-23T02:57:24.790Z'
type: synthesis
title: Runtime identity is the coordination boundary for auth, chat transport, caching, and persistence
summary: Auth-sensitive runtime identity must flow through transport, cache, and persistence to avoid stale chat state and callback mismatches.
tags: [auth, chat-transport, caching, runtime-boundaries]
related: []
keywords: [identity, runtime, transport, cache, persistence, auth, threadId, baseURL]
createdAt: '2026-06-23T02:57:24.790Z'
updatedAt: '2026-06-23T02:57:24.790Z'
---

# Runtime identity is the coordination boundary for auth, chat transport, caching, and persistence

Several domains converge on the same invariant: values that depend on live auth or thread context must be resolved at runtime and propagated through every layer that uses them. In `auth_integration`, callback origins and `handleAuth` baseURL must be computed from live deployment env values rather than build-time defaults. In `frontend_ui`, `useChat` identity expands to `threadId:resourceId`, `DefaultChatTransport` is memoized on auth-sensitive inputs, and thread cache restoration waits for the recreated chat instance. The shared failure mode is stale state caused by reusing build-time or pre-auth identity across request, transport, and persistence boundaries.

## Evidence

- **auth_integration**: Auth reliability depends on resolving callback origins dynamically across deployment environments, using NEXT_PUBLIC_WORKOS_REDIRECT_URI, WORKOS_REDIRECT_URI, or RAILWAY_PUBLIC_DOMAIN rather than static assumptions.
- **frontend_ui**: useChat identity expanded from threadId to threadId:resourceId, DefaultChatTransport is memoized on threadId, resourceId, and getAccessToken, and auth changes must recreate transport and chat state.
- **frontend_ui**: Thread cache restoration uses messageCache keyed by threadId and pendingRestore + useEffect to rehydrate messages after useChat recreation.
