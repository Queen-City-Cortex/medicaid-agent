---
confidence: 0.97
sources: [auth_integration/_index.md, frontend_ui/_index.md, agent_architecture/_index.md]
synthesized_at: '2026-06-21T19:22:42.188Z'
type: synthesis
title: Runtime identity must stay aligned across auth, chat transport, and thread cache
summary: Chat reliability depends on propagating auth-derived runtime identity through transport reinitialization, cache restoration, and memory loading.
tags: [auth, chat, runtime-boundary, transport, cache]
related: []
keywords: [runtime, identity, auth, thread, transport, cache, credentials, memoization]
createdAt: '2026-06-21T19:22:42.188Z'
updatedAt: '2026-06-21T19:22:42.188Z'
---

# Runtime identity must stay aligned across auth, chat transport, and thread cache

The same hidden coupling appears in auth_integration, frontend_ui, and agent_architecture: public/runtime values must be resolved at request time, and the chat UI must key `useChat`, `DefaultChatTransport`, and thread-cache restoration off live identity (`threadId:resourceId`) so stale credentials or mismatched thread state are not reused.

## Evidence

- **auth_integration**: Public origins, callbacks, credentials, and chat identity must be derived from runtime context, not static hostnames or first-run assumptions.
- **frontend_ui**: `useChat` ID was expanded from `threadId` to `threadId:resourceId`, and `DefaultChatTransport` is memoized on `threadId`, `resourceId`, and `getAccessToken` so auth changes recreate transport and chat instance.
- **agent_architecture**: Runtime boundary correctness appears repeatedly: configuration and credentials must be resolved at live runtime, not assumed at build time.
