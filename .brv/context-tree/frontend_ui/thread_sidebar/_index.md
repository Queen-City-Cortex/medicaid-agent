---
children_hash: 43000b31fd9999b16ebf85e1efb601caff89ac3f49447057dfe8d725af86b10a
compression_ratio: 0.8527004909983633
condensation_order: 1
covers: [thread_sidebar_fetch_resilience.md]
covers_token_total: 611
summary_level: d1
token_count: 521
type: summary
---
# Structural Overview

## frontend_ui/thread_sidebar_fetch_resilience
This topic documents how `ThreadSidebar.tsx` and `use-mastra-client.ts` keep thread loading reliable under changing auth and prop state. The main pattern is a retry-friendly fetch path for `listMemoryThreads` that avoids stale requests, suppresses expected auth noise, and preserves stable client identity as tokens change.

### Key behaviors
- `AbortController` is created for every fetch so prior requests are canceled when dependencies change.
- `401` responses are swallowed while `useMastraReady` is false, allowing retry once the WorkOS token is available.
- `useMastraClient` recreates `mastraClient` when the access token changes, keeping `fetchThreads` stable.

### Flow
`sidebar opens -> fetch thread list -> recover from transient failures -> display threads`

### Dependencies and relationships
- Depends on reliable runtime identity and backend responses to populate thread lists.
- Closely related to:
  - `frontend_ui/chat_page_transport/authenticated_chat_transport_reinitialization.md` for auth-aware transport lifecycle
  - `frontend_ui/chat_page_thread_cache/chat_page_thread_cache_restoration.md` for restoring cached thread state
  - `frontend_ui/chat_streaming_error_handling/ai_sdk_v6_sse_streaming_and_error_handling.md` for fetch/stream failure handling patterns
  - `frontend_ui/proxy_handling/web_theme_persistence.md` for client/runtime boundary handling
  - `frontend_ui/message_persistence_parsing/quiet_citation_styling_in_messagelist.md` and `frontend_ui/message_feedback/message_feedback_flow.md` for adjacent UI stability concerns

### Rules to preserve
1. Treat a `401` response as non-error when `useMastraReady` is false so the sidebar does not log noise while the token is pending.
2. Abort any previous `listMemoryThreads` request whenever a new fetch is scheduled because dependencies changed (`client`, `resourceId`, `refreshKey`, or current selection).

### Drill-down entry
- `thread_sidebar_fetch_resilience.md` for the detailed resilience rules and implementation notes