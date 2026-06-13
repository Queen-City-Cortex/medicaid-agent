---
children_hash: a63080ef12201d4fa847a64a52b8e8c53bda47815f64e84d66da3283961b4796
compression_ratio: 0.3894297635605007
condensation_order: 1
covers: [chat_page_thread_cache_race_fix.md, context.md]
covers_token_total: 719
summary_level: d1
token_count: 280
type: summary
---
# message_persistence_cache

## Overview
This topic covers the NC Medicaid Navigator chat page race condition caused by asynchronous `savePerStep` persistence and the cache-first guard used to keep thread re-navigation from showing truncated conversations. The central pattern is a short-lived `useRef Map` cache keyed by `threadId`, populated on `useChat.onFinish` and consumed by `handleSelectThread` before `loadThread` refreshes from the database.

## Key Concepts
- `messageCache` is a `useRef Map` used to store the final UI messages for each thread.
- `useChat.onFinish` writes the completed message list into cache before the thread UI transitions.
- `handleSelectThread` reads from cache first, renders cached messages immediately, deletes the entry, and then calls `loadThread`.
- Database state still remains authoritative after the async write completes, so the cache only bridges the timing gap.

## Related Entry
- `chat_page_thread_cache_race_fix.md` — detailed race-fix behavior in `packages/web/src/app/chat/page.tsx`, including the exact cache/read/delete/load flow and the `message_persistence` facts.