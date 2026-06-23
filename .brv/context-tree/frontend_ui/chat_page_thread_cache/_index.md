---
children_hash: 71d5134f0157156fe83a67afce27db515b490e185e986926d6f077ba962afef5
compression_ratio: 0.4052665382145151
condensation_order: 1
covers: [authenticated_thread_operations.md, chat_thread_cache_restoration.md, context.md, thread_message_coalescing_fix.md]
covers_token_total: 3114
summary_level: d1
token_count: 1262
type: summary
---
## d1 Structural Summary: Thread Cache Restoration and Authenticated Thread Operations

### Scope
These entries describe two tightly related frontend reliability layers in the NC Medicaid Navigator web client:

- **Authenticated thread/memory operations**: preventing 401s when WorkOS auth expires.
- **Thread cache restoration**: preserving and rehydrating per-thread chat state across transport recreation and page reloads.
- **Thread message coalescing**: refining how persisted assistant turn fragments are merged back into a single UI message.

### Main Structural Themes

#### 1) Authenticated thread operations
**`authenticated_thread_operations.md`** documents the fix for thread and memory actions that failed after WorkOS token expiry.

- Core architectural change: separate **client creation** from **execution**.
- `createMastraClient()` still builds a client from an optional token.
- `runWithFreshAuth(tokens, op)` now handles:
  - fresh access-token lookup
  - refresh on 401
  - a single retry
- `useMastraClientRunner()` exposes a **stable `run()` callback** backed by refs and `useEffect`, avoiding dependency churn.
- `ThreadSidebar` routes all thread/memory actions through `run()`.
- Remaining gap: `useChatThread` and `useDeepResearch` still use the snapshot client.

Key dependency: **WorkOS AuthKit** callbacks plus `@mastra/client-js`, which only accepts static headers at construction time.

Related drill-down:
- `frontend_ui/chat_page_transport/authenticated_chat_transport_reinitialization.md`
- `frontend_ui/chat_page_thread_cache/chat_thread_cache_restoration.md`
- `frontend_ui/message_citations/message_citation_resolution.md`

#### 2) Chat page thread cache restoration
**`chat_thread_cache_restoration.md`** is the consolidated topic for thread-specific message cache restoration.

It captures two restoration behaviors:
- **Thread switching restoration**
  - `messageCache` keyed by `threadId`
  - `pendingRestore` ref + `useEffect` rehydrates cached messages after `useChat` recreation
  - avoids stale writes during `handleSelectThread`
- **Reload restoration**
  - persisted assistant turn fragments are coalesced into one restored UI message
  - preserved content includes tools, answer text, and verification badges
  - observational-memory noise is filtered out

Important implementation files:
- `packages/web/src/app/chat/page.tsx`
- `packages/web/src/lib/parse-message.ts`
- `packages/web/src/lib/use-chat-thread.ts`
- `packages/web/tests/lib/parse-message.test.ts`

Important rules:
- preserve `data-verification-rewrite` and `data-verification-ok`
- drop `data-om-*` parts
- anchor restored assistant `id` and `createdAt` on the answer-bearing message
- do not call `setMessages` immediately from `handleSelectThread`; use `pendingRestore`

A noted testing gap: mocked e2e fixtures did not reproduce the multi-message persisted shape, so the degradation was missed earlier.

Related drill-down:
- `frontend_ui/message_persistence_cache/message_persistence_cache.md`
- `frontend_ui/chat_page_transport/authenticated_chat_transport_reinitialization.md`
- `frontend_ui/chat_streaming_error_handling/context.md`

#### 3) Thread message coalescing fix
**`thread_message_coalescing_fix.md`** refines `coalesceThreadMessages` in `parse-message.ts`.

Structural changes:
- removes stale orphaned JSDoc
- stops `mergeAssistantTurn` from including `step-start` parts in merged assistant turns
- adds regression tests for:
  - multi-turn isolation
  - step-start dropping

Processing flow:
- persisted raw thread messages -> coalesce assistant turn -> order tool parts before answer text -> preserve verification metadata -> render UI message

Implementation focus:
- `packages/web/src/lib/parse-message.ts`
- `packages/web/tests/lib/parse-message.test.ts`

Behavioral rules:
- step boundaries are meaningless after split messages are merged
- `MessageList` ignores `step-start` because it is neither a tool nor text
- `step-start` is filtered from visible parts and does not affect `lastToolIndex` or `finalAnswer`

### Cross-Cutting Relationships

- **Auth reliability and cache restoration are linked**: both address stale runtime state in the chat experience, but at different layers.
  - Auth fix handles expired tokens and retry behavior.
  - Cache restoration handles message/thread state survival across rerenders, transport resets, and reloads.
- **`parse-message.ts` is central** to chat reload behavior:
  - it reconstructs UI messages from persisted thread records
  - it also enforces coalescing rules that preserve verification and tool ordering
- **ThreadSidebar and chat page are the main UI surfaces** affected by these fixes.
- **Fresh token per request** is the repeated design principle across transport and thread operations.

### Drill-Down Map
- **Authentication and 401 recovery**: `authenticated_thread_operations.md`
- **Thread cache restoration and thread switching**: `chat_thread_cache_restoration.md`
- **Assistant turn merge/coalescing rules**: `thread_message_coalescing_fix.md`