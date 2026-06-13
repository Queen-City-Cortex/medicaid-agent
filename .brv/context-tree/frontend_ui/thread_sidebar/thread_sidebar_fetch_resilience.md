---
title: Thread Sidebar Fetch Resilience
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-04T19:29:55.936Z'
updatedAt: '2026-04-04T19:29:55.936Z'
related: [frontend_ui/chat_page_transport/authenticated_chat_transport_reinitialization.md]
---
## Raw Concept
**Task:**
Explain how the ThreadSidebar component fetches, updates, and manages memory threads without racing against WorkOS token availability

**Changes:**
- Added AbortController for every fetch to cancel stale requests when props change
- Swallowed 401 responses when the WorkOS token is still pending so fetch retries after ready becomes true
- Recreated mastraClient via useMastraClient hook whenever the access token changes to keep fetchThreads stable

**Files:**
- packages/web/src/components/ThreadSidebar.tsx
- packages/web/src/lib/use-mastra-client.ts

**Flow:**
ThreadSidebar renders -> useMastraReady/useMastraClient set ready flag and client -> fetchThreads triggered with AbortController -> listMemoryThreads called -> if 401 while ready false return quietly -> setThreads and clear loading -> effects rerun for client or refreshKey changes -> fetch aborts stale signal

**Timestamp:** 2026-04-04

## Narrative
### Structure
ThreadSidebar is a client-side React component that displays a scrollable list of threads, with controls for creating, renaming, deleting, and refreshing conversations. It renders a header (+ New button), the thread list with loading/error states, an editing flow using inputs and DropdownMenu actions, and a footer showing the signed-in user plus a sign-out button.

### Dependencies
Depends on WorkOS authkit (useAuth, useAccessToken) via useMastraClient/useMastraReady, Mastra memory APIs (listMemoryThreads, getMemoryThread), and UI primitives like ScrollArea, Button, Separator, DropdownMenu, and AlertDialog for user interactions.

### Highlights
Uses AbortController in useEffect to cancel stale fetch requests triggered by dependency changes (fetchThreads, currentThreadId, refreshKey). The fetch handler sets loading/error state, lists threads sorted by updatedAt, ignores 401s until useMastraReady becomes true, and logs unexpected errors while keeping the existing threads array empty. Editing flows focus inputs, rename and delete operations call mastraClient.getMemoryThread and refresh the list after each update. Threads map to buttons with contextual menus for rename/delete and formatDate-based timestamps.

### Rules
Rule 1: Treat a 401 response as a non-error when useMastraReady is false so the sidebar does not log noise while the token is pending. Rule 2: Abort any previous listMemoryThreads request whenever a new fetch is scheduled because dependencies changed (client, resourceId, refreshKey, or current selection).

## Facts
- **thread_agent_id**: ThreadSidebar uses AGENT_ID 'nc-medicaid-navigator' for every memory thread call [project]
- **thread_fetch_cancellation**: ThreadSidebar cancels previous thread fetches with AbortController before issuing a new request [project]
- **thread_fetch_401_handling**: 401 errors are silently ignored while useMastraReady returns false so the sidebar keeps retrying after the token arrives [project]
