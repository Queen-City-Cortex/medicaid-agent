---
title: Chat Page Thread Cache Restoration
summary: Documented chat page thread cache restoration behavior and the related thread identity and persistence concerns.
tags: []
related: [frontend_ui/message_persistence_cache/message_persistence_cache.md, frontend_ui/message_persistence_parsing/message_persistence_parsing.md, frontend_ui/message_persistence_cache/chat_page_thread_cache_race_fix.md, frontend_ui/proxy_handling/web_theme_persistence.md, frontend_ui/design_system/document_of_record_design_language.md, frontend_ui/message_persistence_parsing/quiet_citation_styling_in_messagelist.md, frontend_ui/chat_streaming_error_handling/ai_sdk_v6_sse_streaming_and_error_handling.md, frontend_ui/thread_sidebar/thread_sidebar_fetch_resilience.md, frontend_ui/message_feedback/message_feedback_flow.md, frontend_ui/live_testing/live_testing_without_the_workos_wall.md, frontend_ui/chat_page_review_fixes/live_ui_testing_without_workos_auth_wall.md]
keywords: []
createdAt: '2026-04-06T02:19:15.855Z'
updatedAt: '2026-06-19T17:56:03.403Z'
---
## Reason
Curate chat page thread cache restoration knowledge from context.

## Raw Concept
**Task:**
Document chat page thread cache restoration behavior and its relationship to runtime identity and persisted thread state.

**Changes:**
- Added a messageCache map keyed by threadId to capture assistant replies once status transitions from streaming to ready, preventing partial DB view when switching threads.
- Introduced a pendingRestore ref that holds cached messages from handleSelectThread and a threadId-dependent useEffect that applies them after the new useChat instance mounts.
- handleSelectThread now defers rehydration to the pendingRestore flow instead of calling setMessages immediately, so the new instance always receives cached data.
- Captured thread cache restoration behavior in the chat page flow.

**Files:**
- packages/web/src/app/chat/page.tsx

**Flow:**
thread identity -> cache lookup -> restore persisted chat state -> render conversation

**Timestamp:** 2026-06-19

## Narrative
### Structure
Describes how chat page state is restored from thread cache when the active thread identity is available.

### Dependencies
Depends on stable thread identity and persisted state alignment to restore the correct chat conversation.

### Highlights
Focuses on restoring the right thread cache without cross-thread leakage.

## Facts
- **chat_page_thread_cache_restoration**: The context contains a curated notes document about a chat page thread cache restoration fix. [project]
