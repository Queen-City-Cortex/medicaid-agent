---
confidence: 0.92
sources: [frontend_ui/_index.md, frontend_ui/_index.md, auth_integration/_index.md]
synthesized_at: '2026-07-10T19:50:59.157Z'
type: synthesis
title: Chat persistence keys off auth identity, not just thread identity
summary: UI state, memory, and transport must all refresh together when the authenticated user changes.
tags: [chat, auth, persistence, memory]
related: []
keywords: [threadId, resourceId, restore, memoize, auth, state, transport, cache]
createdAt: '2026-07-10T19:50:59.157Z'
updatedAt: '2026-07-10T19:50:59.157Z'
---

# Chat persistence keys off auth identity, not just thread identity

frontend_ui and auth_integration both treat auth identity as part of the state key: the chat transport is recreated when auth changes, and thread caches are restored only in a way that respects the live authenticated resource/user context. This prevents anonymous-to-authenticated transitions from reusing stale memory or transport bindings.

## Evidence

- **frontend_ui**: DefaultChatTransport is memoized on threadId, resourceId, and getAccessToken so auth changes force a fresh transport and chat instance.
- **frontend_ui**: Thread state is cached per threadId and restored after useChat recreation, with pendingRestore and useEffect used to rehydrate cached messages after remounts.
- **auth_integration**: Runtime-boundary correctness extends into frontend chat transport, where live auth state must be resolved at runtime instead of using stale assumptions.
