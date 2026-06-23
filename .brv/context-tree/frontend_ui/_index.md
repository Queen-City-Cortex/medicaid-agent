---
children_hash: 5eac1e4ec574a8b29c3e7594c75147baf33c42079a96b37f78cc45707f345e44
compression_ratio: 0.15921678758093455
condensation_order: 2
covers: [chat_page_review_fixes/_index.md, chat_page_scroll_stability/_index.md, chat_page_thread_cache/_index.md, chat_page_transport/_index.md, chat_streaming_error_handling/_index.md, context.md, design_system/_index.md, live_testing/_index.md, message_citations/_index.md, message_feedback/_index.md, message_persistence_cache/_index.md, message_persistence_parsing/_index.md, proxy_handling/_index.md, runtime-identity-and-live-state-must-stay-aligned-across-auth-chat-transport-and.md, runtime-identity-drives-both-auth-transport-and-chat-state.md, runtime-identity-must-propagate-through-auth-chat-transport-and-memory.md, runtime-identity-must-stay-aligned-across-auth-chat-transport-and-memory.md, runtime-identity-must-stay-aligned-across-auth-chat-transport-and-thread-cache.md, scroll_area_sidebar_stability/_index.md, streaming-ui-memory-and-persistence-are-coupled-through-thread-identity.md, thread-identity-is-the-hidden-coupling-between-chat-state-cache-and-auth.md, thread_sidebar/_index.md]
covers_token_total: 12819
summary_level: d2
token_count: 2041
type: summary
---
# frontend_ui Structural Summary

This layer centers on the chat experience’s **UI stability, auth-aware transport, thread persistence, and testing strategy**. The main pattern across the child entries is that **runtime identity** must stay aligned across chat transport, cache restoration, message parsing, and sidebar/thread operations so the UI does not reuse stale state.

## 1) Chat page layout, review fixes, and live testing
Drill down into:
- `chat_page_review_fixes/_index.md`
- `chat_page_scroll_stability/_index.md`
- `scroll_area_sidebar_stability/_index.md`
- `chat_page_transport/_index.md`
- `live_testing/_index.md`
- `proxy_handling/_index.md`
- `design_system/_index.md`

### `chat_page_review_fixes`
Documents the cleanup of `packages/web/src/app/chat/page.tsx` into smaller components:
- `EmptyState`
- `MessageList`
- `ChatInput`
- `ResearchTrace`

The page layout is a centered flex container with:
- collapsible `ThreadSidebar`
- main `ScrollArea`
- conditional empty-state vs message list rendering

The chat flow remains tied to `useChat` and `DefaultChatTransport`, with auth/token and thread management provided through `getAccessToken` and `mastraClient`.

### `chat_page_scroll_stability` and `scroll_area_sidebar_stability`
These entries describe the scrolling hardening for the chat page:
- viewport scrolling uses `viewport.scrollTo(...)` rather than `scrollIntoView()`
- the `ScrollArea` container needs `min-h-0` so flex children can shrink correctly
- focus changes use `preventScroll: true` after input/thread actions
- `overflow-clip` is not a substitute for `overflow-hidden` in layout containment
- the fixed sidebar must remain visible while the message area scrolls

### `chat_page_transport`
Captures the auth-bound identity fix for `useChat`:
- `useChat` identity expanded from `threadId` to `threadId:resourceId`
- `resourceId` defaults to `anonymous` until auth resolves
- `DefaultChatTransport` is memoized on `threadId`, `resourceId`, and `getAccessToken`
- auth changes must recreate transport and chat state

### `live_testing`
Defines two sanctioned ways to test the UI without the WorkOS wall:
1. `/preview` dev-only component gallery
   - real components + fixtures
   - no auth, no Mastra, no Neo4j
   - gated to `404` in production
2. Playwright `design` project
   - runs against the real `/chat`
   - uses a saved WorkOS cookie
   - mocks backend routes
   - captures screenshots in `e2e/design-shots/`

Important rule: **do not add an env-gated auth bypass in `proxy.ts`**.

### `proxy_handling`
Documents the frontend request/auth boundary:
- Next.js 16 migration from middleware to `proxy.ts`
- `authkitProxy` replaces `authkitMiddleware`
- proxy signature uses `NextRequest` only
- public paths are gated by route matcher / unauthenticated paths
- theme persistence is cookie-first, with WorkOS used only for sync/backfill

### `design_system`
Defines the **Document of Record** editorial UI language:
- fonts: `Fraunces`, `Newsreader`, `IBM Plex Mono`
- theme model: parchment light / library-at-night dark
- paper-grain overlay at `z-index: 10`
- print-safe presentation and citation behavior
- `data-testid` attributes must be preserved during restyling

---

## 2) Thread cache restoration, auth retries, and message coalescing
Drill down into:
- `chat_page_thread_cache/_index.md`
- `message_persistence_cache/_index.md`
- `message_persistence_parsing/_index.md`
- `message_citations/_index.md`
- `message_feedback/_index.md`
- `thread_sidebar/_index.md`

### `chat_page_thread_cache`
Covers three related reliability layers:

#### Authenticated thread operations
- fixes 401s caused by expired WorkOS auth
- separates **client creation** from **execution**
- `runWithFreshAuth(tokens, op)` handles token lookup, refresh on 401, and one retry
- `useMastraClientRunner()` provides a stable `run()` callback
- `ThreadSidebar` routes thread/memory actions through `run()`

#### Thread cache restoration
- `messageCache` is keyed by `threadId`
- `pendingRestore` + `useEffect` rehydrate messages after `useChat` recreation
- avoids stale writes during thread selection
- reload restoration coalesces persisted assistant fragments into one UI message
- preserved metadata includes tools, answer text, and verification badges

#### Thread message coalescing
- `coalesceThreadMessages` refines persisted assistant turn merging
- `step-start` parts are dropped from merged assistant turns
- regression tests cover multi-turn isolation and step-start dropping
- verification metadata must be preserved

### `message_persistence_cache`
Focuses on a race between UI restoration and async `savePerStep` writes:
- `messageCache` stores final thread messages before persistence finishes
- `handleSelectThread` restores cached messages immediately
- cache entry is consumed once used
- `loadThread` still runs to reconcile with the database

### `message_persistence_parsing`
Covers reconstruction of persisted thread messages:
- `convertThreadMessageToUIMessage` recognizes `MastraMessageContentV2`
- structured `parts` are preserved on reload
- `convertV4PartsToV5` maps tool invocations into dynamic-tool / step-start / text parts
- legacy payloads fall back to `extractText`
- multi-paragraph formatting is preserved with `\n\n`

### `message_citations`
Documents citation-source alignment:
- shared resolver: `buildCitationResolver(sources)` in `packages/web/src/lib/message-parts.ts`
- resolution order:
  1. exact source-label match
  2. deepest same-policy dotted-ancestor
  3. normalized-URL fallback
- numeric and non-numeric policy sections use different label formats
- `MessageList` and clipboard text both use the same resolver

### `message_feedback`
Describes the message feedback pipeline:
- persistence in `packages/agent/src/feedback/repository.ts`
- API routes in `packages/agent/src/feedback/routes.ts`
- web client helpers in `packages/web/src/lib/feedback-client.ts`
- UI integration in `packages/web/src/components/MessageActions.tsx`
- optimistic feedback updates with rollback on failure
- down-vote comments are optional and only stored when supplied

### `thread_sidebar`
Documents resilient thread loading:
- `ThreadSidebar.tsx` and `use-mastra-client.ts` keep thread loading stable under auth changes
- every fetch gets a new `AbortController`
- `401` responses are ignored while `useMastraReady` is false
- `useMastraClient` recreates the client when the token changes
- thread list behavior is retry-friendly and avoids stale requests

---

## 3) Streaming, persistence, and shared runtime-identity pattern
Drill down into:
- `chat_streaming_error_handling/_index.md`
- `message_persistence_parsing/_index.md`
- `chat_page_thread_cache/_index.md`
- the runtime identity synthesis entries

### `chat_streaming_error_handling`
Covers the SSE chat streaming path:
- migrated from `MastraStreamBuilder` to `AISdkStreamBuilder`
- flow: request → SSE opens → chunks stream to UI → errors handled → stream closes
- `ChatPage` handles streaming state, reruns, and error rendering
- Playwright mock routes make Mastra endpoints deterministic in tests

### Cross-cutting runtime identity theme
Several synthesized entries reinforce the same architectural rule:
- `useChat` identity must include `threadId:resourceId`
- `DefaultChatTransport` must be memoized on auth-sensitive inputs
- cached thread state must wait for the new `useChat` instance
- public callback origins and runtime auth settings must be resolved at request time, not build time

Shared conclusion: **thread identity and auth-derived resource identity are the coordination boundary for chat transport, memory, cache, and persistence**.

---

## 4) Domain-level relationships
- **Chat page implementation** is tied directly to:
  - scroll stability
  - auth-bound transport recreation
  - thread cache restoration
  - streaming/error handling
- **Testing strategy** is split between:
  - fast `/preview` component checks
  - fully wired Playwright `design` validation
- **Design system** and **proxy handling** provide the presentation/runtime foundation that keeps the chat UI stable, authenticated, and visually consistent.