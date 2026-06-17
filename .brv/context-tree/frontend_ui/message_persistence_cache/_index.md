---
children_hash: 6ed18d2e6e2cf2fc0fb7112995d883e7b0ba47561541a571e8f3f954f5a49176
compression_ratio: 0.3938019652305367
condensation_order: 1
covers: [chat_page_thread_cache_race_fix.md]
covers_token_total: 1323
summary_level: d1
token_count: 521
type: summary
---
# Chat Page Thread Cache Race Fix

- **Core problem:** The NC Medicaid Navigator chat page had a race between the UI restoring a thread and the async `savePerStep` database write finishing. This could briefly show truncated conversations when a user clicked **+New** and then returned to a thread.

- **Canonical fix in `packages/web/src/app/chat/page.tsx`:**
  - Added a `messageCache` `useRef(Map)` keyed by `threadId`.
  - `useChat.onFinish` stores the final UI messages in `messageCache` before the thread version advances.
  - `handleSelectThread` now checks `messageCache` first, renders cached messages immediately, deletes the cache entry after use, and still calls `loadThread` so the database result can overwrite the cache once persistence completes.

- **Behavioral flow:**
  - `useChat.onFinish` → cache final messages per thread
  - user reselects thread → `handleSelectThread` restores cached messages
  - cache entry is consumed and removed
  - `loadThread` refreshes from Mastra memory thread storage and reconciles with DB state

- **Key dependencies and relationships:**
  - Depends on `useChat` finish hooks.
  - Uses `useMastraClient` for memory thread message loading.
  - Keeps compatibility with `getAccessToken` / feedback-related chat loading paths.
  - Sits within the broader `frontend_ui/message_persistence_cache` and `frontend_ui/chat_page_thread_cache` area, with related drill-downs in:
    - `frontend_ui/chat_page_thread_cache/chat_page_thread_cache_restoration.md`
    - `frontend_ui/message_persistence_parsing/message_persistence_parsing.md`

- **Important facts and patterns:**
  - `savePerStep` writes to `memory_threads` are async, so DB reads can lag behind UI state.
  - The cache is **per-thread**, **short-lived**, and **consumed on first use** to avoid stale data.
  - The fix protects thread identity during restoration so the active thread and persisted messages stay aligned.

- **What to drill into for details:**  
  - `chat_page_thread_cache_race_fix.md` for the exact cache-first restoration behavior and race condition narrative.