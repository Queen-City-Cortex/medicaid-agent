---
children_hash: d16d8975e998ea6dcdda30b41ba452ad74c9fa0e7f2e2dbce6a39148fe5051a0
compression_ratio: 0.298523664785063
condensation_order: 1
covers: [authenticated_thread_operations.md, chat_thread_cache_restoration.md, context.md, message_parts_and_thread_message_restoration.md, thread_cache_restoration.md, thread_message_coalescing_fix.md]
covers_token_total: 4606
summary_level: d1
token_count: 1375
type: summary
---
## Structural Overview: Chat Page Thread Cache, Message Restoration, and Authenticated Thread Operations

This cluster describes the web client’s thread lifecycle in the NC Medicaid Navigator: how cached chat state is restored when switching threads, how persisted assistant turns are reconstructed on reload, and how authenticated thread/memory actions survive WorkOS token expiry. The main implementation surface is `packages/web/src/app/chat/page.tsx`, `packages/web/src/lib/parse-message.ts`, `packages/web/src/lib/message-parts.ts`, `packages/web/src/lib/use-chat-thread.ts`, `packages/web/src/lib/mastra-client.ts`, `packages/web/src/lib/use-mastra-client.ts`, and `packages/web/src/components/ThreadSidebar.tsx`.

### 1) Thread cache restoration and thread switching
- **`chat_thread_cache_restoration.md` / `context.md`** documents the per-`threadId` cache used to preserve conversations across `useChat` recreation.
- Core pattern: `messageCache` keyed by `threadId` + `pendingRestore` ref + `useEffect` rehydration.
- Important behavior: avoid writing to stale `useChat` instances during `handleSelectThread`; restore after the new instance mounts.
- The consolidated note adds a second restoration path for reloading persisted threads, where split assistant parts are merged back into a single UI message.
- Key rules:
  - preserve `data-verification-rewrite` and `data-verification-ok`
  - drop `data-om-*` internal noise
  - anchor restored assistant `id` and `createdAt` on the answer-bearing message
  - do not call `setMessages` immediately from `handleSelectThread`

### 2) Message-part ownership and thread-message reconstruction
- **`message_parts_and_thread_message_restoration.md`** and **`thread_message_coalescing_fix.md`** focus on `parse-message.ts` and `message-parts.ts`.
- `message-parts.ts` owns reusable helpers for:
  - tool/text detection
  - verification state extraction
  - source extraction
  - citation normalization
  - clipboard rendering
- `parse-message.ts` reconstructs persisted messages by:
  - converting V4 tool-invocation parts to V5 dynamic-tool parts
  - coalescing assistant turns into one UI message
  - preserving verification markers through reload
- The coalescing fix refines `mergeAssistantTurn` so:
  - `step-start` is excluded from merged assistant turns
  - only tool-invocation parts go into the tools bucket
  - multi-turn assistant messages remain isolated
- The cleanup also removed dead `buildSourceIndex` in favor of `buildCitationResolver`.
- Important exported constants:
  - `OK_PART_TYPE = 'data-verification-ok'`
  - `REWRITE_PART_TYPE = 'data-verification-rewrite'`

### 3) Authenticated thread and memory operations
- **`authenticated_thread_operations.md`** addresses 401s caused by expired WorkOS auth snapshots in the Mastra web client.
- Main fix:
  - `runWithFreshAuth(tokens, op)` in `mastra-client.ts`
  - `useMastraClientRunner()` provides a stable `run()` callback
  - `ThreadSidebar` routes all thread/memory actions through `run()`
- Execution flow:
  - call op -> fetch fresh access token -> create `MastraClient` with Authorization header -> on 401 refresh token -> retry once -> return result
- Dependency boundary:
  - `@mastra/client-js` only accepts static headers at client construction time
  - the auth layer depends on WorkOS `accessToken`, `getAccessToken`, and `refresh`
- Remaining gap:
  - `useChatThread` and `useDeepResearch` still use the snapshot client
- Rule preserved: refs must not be written while rendering.

### 4) Mastra client and sidebar compatibility after SDK upgrade
- **`thread_cache_restoration.md`** captures the broader compatibility work after upgrading `@mastra/core` and `@mastra/client-js`.
- The update aligned thread helper types and sidebar actions with newer API shapes:
  - `listMemoryThreads` sorting changed to `orderBy: { field, direction }`
  - thread timestamps are strings, not `Date`
  - rename must preserve `metadata` and `resourceId`
  - clone uses `"<title> (copy)"`
  - export produces Markdown for legal-aid case files
- Thread title logic:
  - server-created threads use the question as title
  - untitled-thread derivation is sequential and limited to the most recent 10 threads
- Authentication resilience is part of the same topic:
  - per-call fresh token fetching
  - retry-on-401 behavior

### 5) Cross-cutting relationships
- The **chat thread cache** and **message restoration** work are tightly coupled: restored messages must remain consistent with the auth/transport lifecycle and with persisted part shapes.
- **`authenticated_thread_operations.md`** is the operational counterpart to the cache/restoration topics: it fixes failures when thread actions are executed after token expiry.
- The **message-part cleanup** and **thread coalescing fix** support the same user-visible outcome: a stable restored thread view with tools, answer text, and verification badges rendered together.
- The transport/auth work referenced in related entries (`authenticated_chat_transport_reinitialization.md`) connects to the same theme of avoiding stale client state.

### Drill-down map
- **Thread switching and cache rehydration:** `chat_thread_cache_restoration.md`, `context.md`
- **Reload-time message reconstruction:** `message_parts_and_thread_message_restoration.md`, `thread_message_coalescing_fix.md`
- **Authenticated thread/memory calls:** `authenticated_thread_operations.md`
- **Mastra SDK/thread API compatibility:** `thread_cache_restoration.md`