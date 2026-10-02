---
title: Thread Sidebar Fetch Resilience
summary: Documented sidebar fetch resilience patterns for thread loading and recovery.
tags: []
related: [frontend_ui/chat_page_transport/authenticated_chat_transport_reinitialization.md, frontend_ui/proxy_handling/web_theme_persistence.md, frontend_ui/design_system/document_of_record_design_language.md, frontend_ui/message_persistence_parsing/quiet_citation_styling_in_messagelist.md, frontend_ui/chat_streaming_error_handling/ai_sdk_v6_sse_streaming_and_error_handling.md, frontend_ui/chat_page_thread_cache/chat_page_thread_cache_restoration.md, frontend_ui/message_feedback/message_feedback_flow.md, frontend_ui/live_testing/live_testing_without_the_workos_wall.md, frontend_ui/chat_page_review_fixes/live_ui_testing_without_workos_auth_wall.md]
keywords: []
createdAt: '2026-04-04T19:29:55.936Z'
updatedAt: '2026-06-19T17:56:03.415Z'
---
## Reason
Curate thread sidebar fetch resilience knowledge from context.

## Raw Concept
**Task:**
Document thread sidebar fetch resilience and its role in loading thread data reliably.

**Changes:**
- Added AbortController for every fetch to cancel stale requests when props change
- Swallowed 401 responses when the WorkOS token is still pending so fetch retries after ready becomes true
- Recreated mastraClient via useMastraClient hook whenever the access token changes to keep fetchThreads stable
- Captured resilient sidebar fetch behavior for thread loading.

**Files:**
- packages/web/src/components/ThreadSidebar.tsx
- packages/web/src/lib/use-mastra-client.ts

**Flow:**
sidebar opens -> fetch thread list -> recover from transient failures -> display threads

**Timestamp:** 2026-06-19

## Narrative
### Structure
Covers the thread sidebar as a fetching surface that must tolerate transient failures.

### Dependencies
Relies on reliable runtime identity and backend responses to populate thread lists.

### Highlights
Emphasizes resilience during thread list retrieval and retry-friendly behavior.

### Rules
Rule 1: Treat a 401 response as a non-error when useMastraReady is false so the sidebar does not log noise while the token is pending. Rule 2: Abort any previous listMemoryThreads request whenever a new fetch is scheduled because dependencies changed (client, resourceId, refreshKey, or current selection).

## Facts
- **thread_sidebar_fetch_resilience**: The context also documents a thread sidebar fetch resilience topic. [project]
