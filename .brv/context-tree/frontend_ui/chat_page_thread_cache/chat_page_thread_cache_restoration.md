---
title: Chat Page Thread Cache Restoration
tags: []
related: [frontend_ui/message_persistence_cache/message_persistence_cache.md, frontend_ui/message_persistence_parsing/message_persistence_parsing.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-06T02:19:15.855Z'
updatedAt: '2026-04-06T02:19:15.855Z'
---
## Raw Concept
**Task:**
Document how the chat page restores cached thread messages once setThreadId recreates the useChat instance.

**Changes:**
- Added a messageCache map keyed by threadId to capture assistant replies once status transitions from streaming to ready, preventing partial DB view when switching threads.
- Introduced a pendingRestore ref that holds cached messages from handleSelectThread and a threadId-dependent useEffect that applies them after the new useChat instance mounts.
- handleSelectThread now defers rehydration to the pendingRestore flow instead of calling setMessages immediately, so the new instance always receives cached data.

**Files:**
- packages/web/src/app/chat/page.tsx

**Flow:**
Thread selection -> setThreadId & transport recreation -> pendingRestore effect fires after threadId change -> setMessages applies cached messages to fresh useChat instance -> pendingRestore cleared.

**Timestamp:** 2026-04-06

## Narrative
### Structure
ChatPage maintains a messageCache map to persist assistant replies per thread when streaming completes, then stores those cached messages into pendingRestore before triggering a new thread. A useEffect watching threadId fires after the new useChat instance mounts, logs the restoration, calls setMessages with the buffered payload, and clears pendingRestore so the cached data is not replayed.

### Dependencies
Depends on useChat from @ai-sdk/react with id `${threadId}:${resourceId}`, DefaultChatTransport (reinitialized when threadId or resourceId changes), and Mastra client helpers that load thread histories and feedback.

### Highlights
This flow prevents setMessages from targeting the stale useChat instance that existed before threadId changed, keeps the UI in sync with the cached conversation state when returning to a thread, and logs restoration events for observability.

## Facts
- **usechat_recreation**: setThreadId causes the useChat instance to recreate, so calling setMessages from handleSelectThread before the new instance mounts would write to the old instance and drop the cached payload. [project]
- **message_caching**: When status transitions from streaming to ready with messages, the chat page caches assistant replies in messageCache keyed by threadId to avoid exposing partial DB snapshots after clicking +New. [project]
- **pending_restore_flow**: pendingRestore ref retains the cached messages until a threadId effect rehydrates them via setMessages after the fresh useChat instance mounts. [project]
