---
children_hash: dec10293f1645c0c0ddc3879263da2bc6415903f2a0780b7c0f223a906486abb
compression_ratio: 0.5157894736842106
condensation_order: 1
covers: [chat_page_thread_cache_restoration.md, context.md]
covers_token_total: 855
summary_level: d1
token_count: 441
type: summary
---
# Summary – chat_page_thread_cache

- **chat_page_thread_cache (context.md)**
  - Documents the NC Medicaid Navigator chat page’s thread-specific message persistence strategy.
  - Key mechanisms: a `messageCache` keyed by `threadId`, a `pendingRestore` ref, and a `useEffect` that rehydrates cached data when a new `useChat` instance mounts, preventing writes to stale instances during thread switches.
  - Links to broader message persistence topics such as `frontend_ui/message_persistence_cache/message_persistence_cache.md`.

- **Chat Page Thread Cache Restoration**
  - **Task & Flow**: Restores cached assistant replies by buffering them per `threadId` when streaming becomes ready, then applying them through `pendingRestore` after `setThreadId` triggers a transport/useChat recreation.
  - **Changes**
    - `messageCache`: captures replies after streaming completes to avoid showing partial datastore snapshots when switching threads.
    - `pendingRestore` flow: defers `setMessages` until the new `useChat` instance is ready, ensuring cached payloads replay against the fresh instance.
    - `handleSelectThread`: stops directly calling `setMessages`, relying on the pending restore effect instead.
  - **Dependencies**: `useChat` from `@ai-sdk/react` (id `${threadId}:${resourceId}`), `DefaultChatTransport`, and Mastra client helpers for thread history and feedback loading.
  - **Highlights & Facts**
    - Ensures the UI stays consistent by avoiding stale-instance writes and logs restoration events.
    - Confirms `setThreadId` triggers useChat recreation (`usechat_recreation` fact), caches assistant replies post-streaming (`message_caching`), and defers rehydration via `pendingRestore` until the new instance mounts (`pending_restore_flow`).