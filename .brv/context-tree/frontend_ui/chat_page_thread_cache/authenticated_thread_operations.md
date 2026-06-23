---
title: Authenticated Thread Operations
tags: []
related: [frontend_ui/chat_page_transport/authenticated_chat_transport_reinitialization.md, frontend_ui/chat_page_thread_cache/chat_thread_cache_restoration.md, frontend_ui/message_citations/message_citation_resolution.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-06-22T18:58:49.078Z'
updatedAt: '2026-06-22T18:58:49.078Z'
---
## Raw Concept
**Task:**
Fix thread and memory operations that were returning 401 after WorkOS token expiry in the Mastra web client.

**Changes:**
- Added runWithFreshAuth(tokens, op) in mastra-client.ts
- Added useMastraClientRunner() with a ref-synced stable run() callback
- Updated ThreadSidebar to use run() for all memory/thread actions
- Documented the remaining snapshot-client gaps in useChatThread and useDeepResearch
- Unit-tested the fix

**Files:**
- packages/web/src/lib/mastra-client.ts
- packages/web/src/lib/use-mastra-client.ts
- packages/web/src/components/ThreadSidebar.tsx

**Flow:**
call op -> fetch fresh access token -> create MastraClient with Authorization header -> on 401 refresh token -> retry once -> return result

**Timestamp:** 2026-06-22T18:58:34.732Z

**Patterns:**
- `HTTP error! status: 401` - Unauthorized error string recognized by isUnauthorized

## Narrative
### Structure
The auth helper layer now separates client creation from execution: createMastraClient() still builds a client from an optional token, while runWithFreshAuth() handles token lookup, refresh, and single-retry recovery. The hook layer exposes a stable run() function whose behavior is kept current via a ref updated in useEffect, preventing dependency churn in callers. ThreadSidebar now delegates all thread CRUD and export actions through that runner.

### Dependencies
Depends on WorkOS AuthKit accessToken/getAccessToken/refresh callbacks and @mastra/client-js, which only accepts static headers at client construction time.

### Highlights
This resolves the 401s caused by expired auth snapshots for thread and memory operations. The approach matches the chat transport behavior by fetching a fresh token per request and adds a one-time refresh retry for server-side rejection or clock skew. Remaining work is to migrate useChatThread and useDeepResearch off the snapshot client.

### Rules
refs must not be written while rendering

### Examples
Example flow: listMemoryThreads() or getMemoryThread(...).delete() runs through run(), and a 401 causes refresh() plus one retry.

## Facts
- **mastra_client_auth_bug**: useMastraClient previously baked a render-time WorkOS token into a static-header MastraClient, which caused thread and memory operations to return 401 after token expiry. [project]
- **fresh_auth_retry_strategy**: runWithFreshAuth fetches a fresh access token for each operation, forces refresh() on a 401, and retries exactly once. [project]
- **stable_mastra_runner**: useMastraClientRunner returns a stable run() callback by storing the latest WorkOS callbacks in a ref and syncing that ref in useEffect. [project]
- **thread_sidebar_run_path**: ThreadSidebar routes thread list, load, delete, rename, duplicate, and export operations through run(). [project]
- **remaining_mastra_gaps**: Remaining gap: useChatThread and useDeepResearch still use the snapshot client. [project]
- **test_coverage**: The fix was unit-tested. [project]
