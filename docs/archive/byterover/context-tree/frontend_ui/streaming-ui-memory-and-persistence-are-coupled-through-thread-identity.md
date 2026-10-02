---
confidence: 0.95
sources: [frontend_ui/_index.md, frontend_ui/_index.md, qa/_index.md]
synthesized_at: '2026-06-12T03:05:29.161Z'
type: synthesis
title: Streaming UI, memory, and persistence are coupled through thread identity
summary: Chat UX stability depends on treating threadId as the key for transport, caching, restoration, and feedback state.
tags: [chat-ui, persistence, streaming, threads, testing]
related: []
keywords: [threadId, cache, restore, transport, reload, messages, feedback, streaming]
createdAt: '2026-06-12T03:05:29.161Z'
updatedAt: '2026-06-12T03:05:29.161Z'
---

# Streaming UI, memory, and persistence are coupled through thread identity

Across frontend_ui and qa, the chat experience is built around a stable thread lifecycle: transport instances reinitialize on thread/auth changes, message caches restore assistant output after remounts, parsing preserves tool metadata, and Playwright flows assert persistence across reloads.

## Evidence

- **frontend_ui**: useChat identity includes both threadId and auth-derived resourceId, and DefaultChatTransport memoizes over threadId, resourceId, and getAccessToken so transport is fresh after auth resolves.
- **frontend_ui**: Per-threadId messageCache plus pendingRestore rehydrate assistant replies when new useChat instances mount, preventing stale writes during thread switches.
- **qa**: The message persistence smoke test verifies savePerStep persists assistant answers, research-trace metadata, and MessageActions across reloads using ChatPage and LibSQL-backed storage.
