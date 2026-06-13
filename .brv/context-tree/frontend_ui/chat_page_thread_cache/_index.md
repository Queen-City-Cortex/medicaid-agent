---
children_hash: c0a0d4ed784172e2c1ad1c1c3c2472d52b126896e6a1a275011d38454875ee4c
compression_ratio: 0.6338672768878718
condensation_order: 1
covers: [chat_page_thread_cache_restoration.md, context.md]
covers_token_total: 874
summary_level: d1
token_count: 554
type: summary
---
# chat_page_thread_cache

## Overview
The chat page thread cache restoration flow preserves per-thread conversations when `setThreadId` recreates the `useChat` instance. The main goal is to avoid writing restored messages into a stale chat instance and to keep the UI aligned with cached thread state after thread switches.

## Structural Summary
- **Core mechanism:** a `messageCache` map keyed by `threadId` stores assistant replies when streaming completes and status transitions from `streaming` to `ready`.
- **Restoration mechanism:** `handleSelectThread` no longer calls `setMessages` immediately; it places cached messages into a `pendingRestore` ref.
- **Rehydration timing:** a `useEffect` watching `threadId` runs after the new `useChat` instance mounts, applies `setMessages` with the buffered payload, and clears `pendingRestore`.
- **State safety:** this prevents updates from targeting the old `useChat` instance that existed before `threadId` changed.
- **Transport coupling:** the flow depends on `useChat` from `@ai-sdk/react` with id `${threadId}:${resourceId}` and `DefaultChatTransport`, which is reinitialized when `threadId` or `resourceId` changes.
- **Integration points:** also tied to Mastra client helpers that load thread histories and feedback.

## Key Flow
`Thread selection -> setThreadId / transport recreation -> pendingRestore effect after threadId change -> setMessages on fresh useChat instance -> pendingRestore cleared`

## Important Facts
- `setThreadId` recreates `useChat`, so early `setMessages` calls would write to the old instance and lose the restored payload.
- Assistant replies are cached per thread to avoid showing partial DB snapshots after switching threads or clicking `+New`.
- Restoration events are logged for observability.

## Drill-Down Entries
- **chat_page_thread_cache_restoration.md** — detailed restoration logic, cache flow, and implementation notes.
- **context.md** — topic-level overview and key concepts.
- Related areas: **frontend_ui/message_persistence_cache/message_persistence_cache.md**, **frontend_ui/message_persistence_parsing/message_persistence_parsing.md**, **frontend_ui/message_persistence_cache/chat_page_thread_cache_race_fix.md**