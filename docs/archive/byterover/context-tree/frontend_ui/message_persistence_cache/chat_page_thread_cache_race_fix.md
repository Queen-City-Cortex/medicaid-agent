---
title: Chat Page Thread Cache Race Fix
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-05T23:36:11.983Z'
updatedAt: '2026-04-05T23:36:11.983Z'
related: [frontend_ui/chat_page_thread_cache/chat_page_thread_cache_restoration.md, frontend_ui/message_persistence_parsing/message_persistence_parsing.md]
consolidated_at: '2026-06-17T20:30:06.528Z'
consolidated_from: [{date: '2026-06-17T20:30:06.528Z', path: frontend_ui/message_persistence_cache/chat_page_thread_cache_race_fix.abstract.md, reason: 'These files all describe the same chat page message persistence cache race fix from different levels of detail. The main markdown file is the richest source, while the abstract, overview, and topic context are overlapping summaries of the same concept, so they should be consolidated into a single canonical entry.'}, {date: '2026-06-17T20:30:06.528Z', path: frontend_ui/message_persistence_cache/chat_page_thread_cache_race_fix.overview.md, reason: 'These files all describe the same chat page message persistence cache race fix from different levels of detail. The main markdown file is the richest source, while the abstract, overview, and topic context are overlapping summaries of the same concept, so they should be consolidated into a single canonical entry.'}, {date: '2026-06-17T20:30:06.528Z', path: frontend_ui/message_persistence_cache/context.md, reason: 'These files all describe the same chat page message persistence cache race fix from different levels of detail. The main markdown file is the richest source, while the abstract, overview, and topic context are overlapping summaries of the same concept, so they should be consolidated into a single canonical entry.'}]
---
## Raw Concept
**Task:**
Document the NC Medicaid Navigator chat page message persistence cache guard that avoids savePerStep race conditions.

**Changes:**
- Added messageCache ref to hold the last thread messages when useChat onFinish fires.
- handleSelectThread now reads from messageCache before clearing it and then calls loadThread to refresh from the database.

**Files:**
- packages/web/src/app/chat/page.tsx

**Flow:**
useChat.onFinish -> messageCache.current.set(threadId, messages) -> user selects thread -> handleSelectThread checks cache -> setMessages(cached) -> cache.delete(threadId) -> loadThread fetches from Mastra memory thread and overwrites messages with DB results.

**Timestamp:** 2026-04-05

## Narrative
### Structure
packages/web/src/app/chat/page.tsx now caches the final UI messages for each thread inside a useRef Map to cover the race between the UI showing a thread and the async savePerStep DB write completing. handleSelectThread prioritizes the cache to instantly render the expected messages, deletes the cache entry on use, and then still calls loadThread so the database can overwrite the cache once the write finishes.

### Dependencies
Relies on useChat to expose OnFinish hooks, useMastraClient to list memory thread messages, and getAccessToken feedback helpers so this loading path stays consistent with other chat interactions.

### Highlights
Ensures +New then back navigation never shows truncated conversations despite delayed database writes; the cache is per-thread, short-lived, and consumed on first use to prevent staleness.

## Facts
- **message_persistence**: savePerStep writes to memory_threads messages are async, so clicking +New then immediately returning can read incomplete data from the database. [project]
- **message_cache**: messageCache ref stores the final UI messages per thread when onFinish fires so the UI can show the answer before the DB write completes. [project]
- **cache_consumption**: handleSelectThread checks the cache before hitting loadThread, renders cached messages if present, and deletes the entry to avoid stale data. [project]

## Overview
Captures the race condition around savePerStep writes on the NC Medicaid Navigator chat page and the cache guard that preloads UI messages while the database write finishes.

## Key Concepts
- messageCache useRef Map keyed by threadId
- handleSelectThread cache-first rendering plus loadThread refresh
- useChat onFinish hook populates cache before setThreadVersion

## Additional context
- Chat page message persistence depends on cached thread identity and careful thread restoration to avoid stale or mismatched state.
- A key fix was adding a `messageCache` ref to preserve the last thread messages when `useChat` `onFinish` fires.
- `handleSelectThread` now reads from `messageCache` before clearing it, then calls `loadThread` to refresh data from the database.
- The document emphasizes that persistence updates must stay aligned with the active thread during restoration and rehydration.
- The main risk described is a race condition between restoring thread state and applying message persistence updates.
- Related files indicate this topic sits within a broader frontend message-persistence and thread-cache context.
- Flow described: load chat page -> resolve thread identity -> restore cached thread state -> sync message persistence -> prevent stale writes.
- Notable entities/patterns include `thread_identity_cache`, `thread_cache_race`, `message_persistence_scope`, `messageCache`, `handleSelectThread`, and `loadThread`.