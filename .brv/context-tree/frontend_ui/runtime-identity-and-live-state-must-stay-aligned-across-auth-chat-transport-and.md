---
confidence: 0.99
sources: [auth_integration/_index.md, frontend_ui/_index.md, frontend_ui/_index.md]
synthesized_at: '2026-06-23T02:10:57.423Z'
type: synthesis
title: Runtime identity and live state must stay aligned across auth, chat transport, and persistence
summary: Auth changes must reflow through chat transport and thread state so fresh runtime identity, not stale snapshots, drives user-visible behavior.
tags: [auth, chat, runtime-identity, transport]
related: []
keywords: [workos, callback, resourceId, threadId, token-refresh, transport, identity, snapshot, runner]
createdAt: '2026-06-23T02:10:57.423Z'
updatedAt: '2026-06-23T02:10:57.423Z'
---

# Runtime identity and live state must stay aligned across auth, chat transport, and persistence

Across auth_integration and frontend_ui, the same bug pattern appears: runtime identity has to be resolved live and propagated into chat transport, thread caching, and memory operations. auth_integration resolves callback origins from runtime env fallbacks rather than build-time assumptions, while frontend_ui expands chat identity to include resourceId, memoizes transport on auth-sensitive inputs, and uses fresh-auth/thread runners to avoid stale token failures.

## Evidence

- **auth_integration**: The WorkOS callback flow derives a stable public origin by checking NEXT_PUBLIC_WORKOS_REDIRECT_URI, then WORKOS_REDIRECT_URI, then RAILWAY_PUBLIC_DOMAIN before calling handleAuth.
- **frontend_ui**: useChat identity expands from threadId to threadId:resourceId, and DefaultChatTransport is memoized on threadId, resourceId, and getAccessToken so the transport refreshes when auth changes.
- **frontend_ui**: ThreadSidebar routes list/load/delete/rename/duplicate/export operations through a fresh-auth runner to avoid 401s from expired WorkOS auth snapshots.
