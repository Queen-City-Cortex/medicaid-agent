---
title: Thread Cache Restoration
tags: []
related: [frontend_ui/chat_page_transport/authenticated_chat_transport_reinitialization.md, frontend_ui/chat_page_thread_cache/chat_thread_cache_restoration.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-06-23T04:11:47.019Z'
updatedAt: '2026-06-23T04:11:47.019Z'
---
## Raw Concept
**Task:**
Document thread sidebar and memory client compatibility changes after upgrading @mastra/core and @mastra/client-js.

**Changes:**
- Changed listMemoryThreads sorting to orderBy { field, direction }
- Modeled returned thread objects with string timestamps derived from ListMemoryThreadsResponse
- Limited untitled-thread title derivation and made it sequential
- Preserved metadata and resourceId during rename
- Adjusted clone and export behavior
- Added per-call fresh token fetching and retry-on-401 resilience

**Files:**
- packages/agent/tests/helpers/run-tool.ts
- packages/web/src/components/ThreadSidebar.tsx

**Flow:**
client upgrade -> type mismatches surface -> thread helper types and API calls are updated -> sidebar rendering and actions remain stable

**Timestamp:** 2026-06-23

## Narrative
### Structure
The work centers on aligning web thread sidebar helpers and actions with the newer Mastra client response shape and sorting API. It also documents operational behavior changes around title derivation, rename, clone, export, and authentication resilience.

### Dependencies
Depends on @mastra/client-js response typing, @mastra/core server/memory conventions, and access-token handling in thread-related UI calls.

### Highlights
Thread display logic now treats returned timestamps as strings and sorts with the new orderBy shape. The upgrade also clarified that the question becomes the thread title for new server-created threads.

### Examples
Example thread listing call uses orderBy: { field: "updatedAt", direction: "DESC" }. Example rename behavior keeps the existing metadata instead of sending an empty object.

## Facts
- **client_thread_sort_api**: Upgrading @mastra/client-js from 1.10 to 1.26 changes listMemoryThreads orderBy from sortDirection to { field, direction }. [project]
- **thread_timestamp_shape**: Thread timestamps from @mastra/client-js are serialized as strings, not Date objects. [project]
- **thread_title_source**: Server threads are created with the question as their title, making legacy title derivation only relevant for older threads. [project]
- **untitled_thread_title_derivation_limit**: Untitled thread title derivation is limited to the most recent 10 threads and runs sequentially. [project]
- **thread_rename_metadata_preservation**: Rename must preserve metadata and resourceId because sending an empty object wiped metadata. [project]
- **thread_clone_title_format**: Clone uses a fresh title in the format "<title> (copy)". [project]
- **thread_export_format**: Export produces Markdown for legal-aid case files rather than JSON. [project]
- **thread_token_refresh_strategy**: Thread operations fetch a fresh client token per call and retry on 401 to survive mid-session access-token expiry. [project]
