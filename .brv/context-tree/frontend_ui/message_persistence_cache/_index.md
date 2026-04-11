---
children_hash: fffd102d9eb627ef68f2e82d8661bc08cac52ac8795a5d6ccecbc601b53ef4bc
compression_ratio: 0.40294117647058825
condensation_order: 1
covers: [chat_page_thread_cache_race_fix.md, context.md]
covers_token_total: 680
summary_level: d1
token_count: 274
type: summary
---
### message_persistence_cache overview
- **Scope:** Addresses the savePerStep/write race encountered on the NC Medicaid Navigator chat page (`packages/web/src/app/chat/page.tsx`) and documents the cache guard that keeps UI conversations complete.
- **Key components:**  
  - `messageCache` (a `useRef<Map>`) caches final UI messages keyed by `threadId` when `useChat.onFinish` fires (see `context.md`).  
  - `handleSelectThread` reads from `messageCache` before clearing it, renders cached messages immediately, deletes that entry, then calls `loadThread` to refresh from Mastra memory (detailed in `chat_page_thread_cache_race_fix.md`).
- **Dependencies & Flow:** Relies on `useChat`’s `onFinish` hook, `useMastraClient` to list memory thread messages, and access token helpers to align with other chat interactions; flow is `onFinish → cache set → thread selection → cache read/delete → loadThread overwrite`.
- **Highlights:** Guarantees that quick navigation (+New then back) never shows truncated conversations despite async database writes by consuming the per-thread cache exactly once.