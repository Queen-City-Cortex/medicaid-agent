---
confidence: 0.93
sources: [frontend_ui/_index.md, frontend_ui/_index.md, auth_integration/_index.md, frontend_ui/_index.md]
synthesized_at: '2026-06-20T18:42:30.183Z'
type: synthesis
title: Thread identity is the hidden coupling between chat state, cache, and auth
summary: Chat UI correctness depends on keeping thread identity and auth-derived resource identity aligned everywhere state is restored or streamed.
tags: [chat-ui, auth, cache, memory, transport]
related: []
keywords: [threadId, resourceId, cache, restore, transport, auth, memory, session, state, reinit]
createdAt: '2026-06-20T18:42:30.183Z'
updatedAt: '2026-06-20T18:42:30.183Z'
---

# Thread identity is the hidden coupling between chat state, cache, and auth

Across frontend_ui and auth_integration, chat correctness depends on stable runtime identity rather than only thread ID. The system binds transport, memory, cache restoration, and feedback to the active auth-derived resource so that switching users or sessions reinitializes the right state instead of replaying stale data.

## Evidence

- **frontend_ui**: `useChat` identity expands from `threadId` to `threadId:resourceId`, and `DefaultChatTransport` is memoized on `threadId`, `resourceId`, and `getAccessToken`.
- **frontend_ui**: `messageCache` stores assistant replies keyed by `threadId`, and `pendingRestore` applies after the new `useChat` instance mounts to avoid stale writes.
- **auth_integration**: The shared fix is to resolve public-facing settings at request time and keep configuration ownership centralized, refreshing transport/state bindings when auth or environment changes.
- **frontend_ui**: UI state is restored from cache or parsed persisted messages before falling back to fresh loads.
