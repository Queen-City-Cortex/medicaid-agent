---
children_hash: 9eeda12e5fbda51314f79d1737b3bcd12ec3e557717b484f538e595e54edf8ea
compression_ratio: 0.3279967159277504
condensation_order: 1
covers: [authenticated_thread_operations.md, chat_thread_cache_restoration.md, context.md, message_parts_and_thread_message_restoration.md, thread_cache_restoration.md, thread_message_coalescing_fix.abstract.md, thread_message_coalescing_fix.md, thread_message_coalescing_fix.overview.md]
covers_token_total: 4872
summary_level: d1
token_count: 1598
type: summary
---
# Thread Restoration and Authenticated Web Operations

## Overview
These entries describe a shared set of frontend web-client fixes around thread state restoration, message parsing/coalescing, and authenticated Mastra operations. The common theme is making thread and chat behavior resilient across reloads, transport reinitialization, and expiring WorkOS tokens while preserving verification state and stable UI behavior.

## Main areas

### 1) Authenticated thread and memory operations
- **`authenticated_thread_operations.md`** documents the fix for 401s caused by expired auth snapshots in thread/memory actions.
- Architectural shift:
  - `createMastraClient()` remains responsible for client construction.
  - `runWithFreshAuth(tokens, op)` now handles fresh token lookup, refresh-on-401, and a single retry.
  - `useMastraClientRunner()` exposes a stable `run()` callback backed by ref-synced WorkOS callbacks.
- **ThreadSidebar** now routes all thread CRUD and export actions through `run()`.
- Dependency boundary: WorkOS AuthKit callbacks plus `@mastra/client-js`, which only accepts static headers at construction time.
- Remaining gap: **`useChatThread`** and **`useDeepResearch`** still use the snapshot client.
- Drill down in `authenticated_thread_operations.md` for the helper flow, retry rule, and test coverage.

### 2) Thread cache restoration across thread switches and reloads
- **`chat_thread_cache_restoration.md`** is the consolidated topic for per-thread message caching and restoration in the chat page.
- Core behavior:
  - Cache is keyed by `threadId`.
  - `pendingRestore` plus `useEffect` rehydrates cached messages after `useChat` recreation.
  - `handleSelectThread` must avoid writing into stale `useChat` instances.
- The consolidated note adds reload-specific behavior:
  - Persisted assistant turn parts are coalesced into one restored UI message.
  - Tool parts, answer text, and verification badges are preserved together.
  - Internal noise such as `data-om-*` parts is dropped.
  - Restored assistant identity and `createdAt` are anchored on the answer-bearing message.
- Related implementation files mentioned in the consolidated narrative:
  - `packages/web/src/app/chat/page.tsx`
  - `packages/web/src/lib/parse-message.ts`
  - `packages/web/src/lib/use-chat-thread.ts`
  - `packages/web/tests/lib/parse-message.test.ts`
- Drill down in `chat_thread_cache_restoration.md` for the full evolution, including the thread-switching cache and reload coalescing behavior.

### 3) Message part normalization and thread message restoration
- **`message_parts_and_thread_message_restoration.md`** refines the lower-level parsing layer that powers restored thread messages.
- `message-parts.ts` now owns reusable helpers for:
  - tool/text detection
  - verification state extraction
  - source extraction
  - citation normalization
  - clipboard rendering
- `parse-message.ts` restores persisted messages by:
  - converting V4 tool-invocation parts to V5 dynamic-tool parts
  - coalescing assistant turns
  - preserving verification parts during restoration
- Important exported constants:
  - `OK_PART_TYPE = 'data-verification-ok'`
  - `REWRITE_PART_TYPE = 'data-verification-rewrite'`
- Citation resolution behavior:
  - exact label match first
  - then deepest same-policy ancestor match
  - then URL fallback
- Internal noise dropped during restoration includes `data-om-*` and step-start parts.
- All 251 web tests pass after the cleanup.
- Drill down in `message_parts_and_thread_message_restoration.md` for the helper responsibilities and verification constant usage.

### 4) Thread message coalescing refinement
- **`thread_message_coalescing_fix.md`** captures a narrower fix inside `parse-message.ts`.
- Main behavioral change:
  - `mergeAssistantTurn` no longer buckets `step-start` parts into the merged assistant turn.
  - Only tool-invocation parts are merged into the tools bucket.
- Additional cleanup:
  - Removed stale orphaned JSDoc above `ThreadMessageMetadata`.
  - Added regression tests for:
    - multi-turn isolation
    - step-start dropping
- The merge order remains:
  - persisted raw thread messages -> coalesce assistant turn -> order tool parts before answer text -> preserve verification metadata -> render UI message
- Important rule: step boundaries are meaningless once split messages are merged; `MessageList` ignores `step-start`.
- Drill down in `thread_message_coalescing_fix.md` for the exact regression scope and merge rules.

### 5) Thread cache restoration under Mastra client upgrades
- **`thread_cache_restoration.md`** documents compatibility work after upgrading `@mastra/core` and `@mastra/client-js`.
- Key API and data-shape updates:
  - `listMemoryThreads` sorting changed from `sortDirection` to `orderBy: { field, direction }`
  - returned thread timestamps are strings, not `Date` objects
  - thread title derivation is limited and sequential for untitled threads
  - rename must preserve metadata and `resourceId`
  - clone uses `"<title> (copy)"`
  - export produces Markdown for legal-aid case files, not JSON
- Authentication resilience also became part of thread operations:
  - fetch a fresh token per call
  - retry once on 401
- Drill down in `thread_cache_restoration.md` for the upgrade-driven type and behavior changes.

## Cross-cutting patterns
- Fresh-token-per-request handling is the shared response to auth expiry in both thread operations and chat transport behavior.
- Cache restoration and message coalescing are layered:
  - thread-level cache preserves conversation state across `useChat` recreation
  - message parsing normalizes persisted parts into stable UI messages
- Verification metadata is treated as durable state and must survive reloads and part merging.
- Stale or internal-only parts (`step-start`, `data-om-*`) are intentionally excluded from the visible merged assistant message.

## Drill-down map
- Auth/session recovery for thread ops: **`authenticated_thread_operations.md`**
- Thread cache and persisted conversation restoration: **`chat_thread_cache_restoration.md`**
- Message-part helpers and verification constants: **`message_parts_and_thread_message_restoration.md`**
- Assistant-turn merge behavior and step-start regression fix: **`thread_message_coalescing_fix.md`**
- Mastra client upgrade compatibility for threads: **`thread_cache_restoration.md`**