---
title: Thread Sidebar Fetch Resilience
summary: Documented sidebar fetch resilience patterns for thread loading and recovery.
tags: []
related: [frontend_ui/chat_page_transport/authenticated_chat_transport_reinitialization.md]
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
