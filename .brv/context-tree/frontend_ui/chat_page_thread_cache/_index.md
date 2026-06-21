---
children_hash: 8791d0ab95d857e167c1bcb01ac6088073fd6a8cdc4f427a56fd86bfd54e5684
compression_ratio: 0.7817715019255456
condensation_order: 1
covers: [chat_page_thread_cache_restoration.md, context.md]
covers_token_total: 779
summary_level: d1
token_count: 609
type: summary
---
# chat_page_thread_cache

## Overview
The chat page thread cache work ensures per-thread conversations survive transport changes and `useChat` instance recreation when switching threads. The core behavior is centered on restoring the correct cached conversation only after thread identity is stable, avoiding stale writes and cross-thread leakage.

## Structural Summary

- **Primary topic:** `frontend_ui/chat_page_thread_cache`
  - Focuses on per-thread message caching, restoration timing, and safe rehydration of chat state.
  - Drill down to `chat_page_thread_cache_restoration.md` for the concrete restoration fix and runtime flow details.

- **Thread identity and cache restoration**
  - Restoration depends on a stable `threadId` so the app can map the active thread to the right cached conversation.
  - The flow is: `thread identity -> cache lookup -> restore persisted chat state -> render conversation`.
  - The design goal is to keep cached messages aligned with the correct persisted thread state.

- **Message caching strategy**
  - `messageCache` is keyed by `threadId` and captures assistant replies once status transitions from streaming to ready.
  - This prevents partial DB views when the user switches threads mid-stream.
  - Drill down in `chat_page_thread_cache_restoration.md` for the cache timing change.

- **Rehydration flow**
  - `handleSelectThread` no longer calls `setMessages` directly.
  - Instead, it stores cached messages in a `pendingRestore` ref.
  - A `threadId`-dependent `useEffect` applies the cached messages after the new `useChat` instance mounts.
  - This avoids writing into a stale `useChat` instance.

- **Related behavior and neighboring concerns**
  - The topic is linked to broader message persistence and cache behavior in `frontend_ui/message_persistence_cache/message_persistence_cache.md`.
  - The restoration logic is also related to transport/session resilience and other chat-page state handling topics referenced in `chat_page_thread_cache_restoration.md`.

## Key Facts
- The implementation is in `packages/web/src/app/chat/page.tsx`.
- The fix was documented on `2026-06-19`.
- The main risk addressed is restoring the wrong thread or leaking state across thread switches.

## Drill-Down Entry
- `chat_page_thread_cache_restoration.md` — detailed documentation of the cache restoration behavior, the `messageCache`/`pendingRestore` flow, and the thread identity dependency.