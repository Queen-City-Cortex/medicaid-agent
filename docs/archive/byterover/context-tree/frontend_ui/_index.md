---
children_hash: 3d8adb82d70607d364f92867bc26345a29d510e2c0a484923fd3ee0f48af4415
compression_ratio: 0.19514601420678768
condensation_order: 2
covers: [chat-persistence-keys-off-auth-identity-not-just-thread-identity.md, chat_page_review_fixes/_index.md, chat_page_scroll_stability/_index.md, chat_page_thread_cache/_index.md, chat_page_transport/_index.md, chat_streaming_error_handling/_index.md, context.md, design_system/_index.md, identity-sensitive-caching-and-persistence-must-track-auth-transitions.md, live_testing/_index.md, message_citations/_index.md, message_feedback/_index.md, message_persistence_cache/_index.md, message_persistence_parsing/_index.md, proxy_handling/_index.md, runtime-identity-and-live-state-must-stay-aligned-across-auth-chat-transport-and.md, runtime-identity-drives-both-auth-transport-and-chat-state.md, runtime-identity-is-the-coordination-boundary-for-auth-chat-transport-caching-an.md, runtime-identity-must-be-resolved-at-runtime-across-auth-chat-and-deployment.md, runtime-identity-must-be-resolved-at-the-boundary-not-cached-early.md, runtime-identity-must-propagate-through-auth-chat-transport-and-memory.md, runtime-identity-must-stay-aligned-across-auth-chat-transport-and-memory.md, runtime-identity-must-stay-aligned-across-auth-chat-transport-and-thread-cache.md, scroll_area_sidebar_stability/_index.md, streaming-ui-memory-and-persistence-are-coupled-through-thread-identity.md, thread-identity-is-the-hidden-coupling-between-chat-state-cache-and-auth.md, thread_sidebar/_index.md]
covers_token_total: 15204
summary_level: d2
token_count: 2967
type: summary
---
# frontend_ui Structural Summary

This level groups the frontend UI knowledge around a few recurring invariants: chat state is identity-sensitive, persistence must survive remounts and reloads, scrolling must stay layout-stable, and testing must be possible without depending on production auth or backend availability. The main drill-down areas are **chat_page_review_fixes**, **chat_page_thread_cache**, **chat_page_transport**, **chat_streaming_error_handling**, **message_citations**, **message_feedback**, **message_persistence_cache**, **message_persistence_parsing**, **proxy_handling**, **scroll_area_sidebar_stability**, **thread_sidebar**, and the identity/caching synthesis entries.

## 1) Chat page structure, review fixes, and testing paths
### `chat_page_review_fixes/_index.md`
- The chat page was decomposed from a monolith into `EmptyState`, `MessageList`, `ChatInput`, and `ResearchTrace`.
- Layout centers on a flex container with `ThreadSidebar`, a main `ScrollArea`, and conditional `MessageList` vs `EmptyState`.
- `useChat` still drives the chat flow through `DefaultChatTransport` targeting `${MASTRA_URL}/chat`, with `getAccessToken` and `mastraClient` thread management.
- UI polish includes softer sidebar styling, accessible actions, CSS `line-clamp` for truncation, improved empty-state spacing, auth loading skeletons, and footer disclaimer adjustments.

### `live_testing_without_workos_auth_wall.md`
- Defines two sanctioned testing paths: a dev-only `/preview` component gallery and a Playwright `design` project against the real `/chat` route.
- `/preview` is fixture-driven, auth-free, backend-free, and must stay `404` in production.
- The Playwright design path uses a saved WorkOS cookie, mocked backend routes, and captures screenshots for light/dark themes.
- Explicit rule: do not add an env-gated auth bypass in `proxy.ts`.

### Relationship
- `chat_page_review_fixes` describes the production chat UI shape.
- `live_ui_testing_without_workos_auth_wall` provides the safe validation path for that UI when auth or backend services are unavailable.

## 2) Thread cache, persistence, and authenticated thread operations
### `chat_page_thread_cache/_index.md`
- The thread lifecycle is centered on restoring cached chat state when switching threads and reconstructing persisted assistant turns after reload.
- `messageCache` is keyed by `threadId`, with `pendingRestore` and `useEffect` used to rehydrate messages only after the new `useChat` instance mounts.
- `handleSelectThread` must not write to a stale `useChat` instance; restoration happens after remount.
- Message reconstruction preserves verification markers, strips internal `data-om-*` noise, and anchors restored assistant `id`/`createdAt` on the answer-bearing message.

### `message_persistence_cache/_index.md`
- The key race fix was between UI restoration and async `savePerStep` writes.
- `useChat.onFinish` stores final UI messages in a per-thread `messageCache` before persistence catches up.
- `handleSelectThread` restores cached messages immediately, then still calls `loadThread` so database state can reconcile afterward.
- The cache is short-lived and consumed on first use.

### `authenticated_thread_operations.md`
- Thread and memory actions can fail with 401s if they use expired WorkOS auth snapshots.
- Fix: `runWithFreshAuth(tokens, op)` in `mastra-client.ts`, exposed through `useMastraClientRunner()`.
- `ThreadSidebar` routes list/load/delete/rename/duplicate/export actions through a fresh-auth runner.
- Remaining gap noted: `useChatThread` and `useDeepResearch` still use the snapshot client.

### `thread_cache_restoration.md`
- Covers broader SDK compatibility work after `@mastra/core` and `@mastra/client-js` upgrades.
- Thread helper types and sidebar actions were aligned with newer API shapes.
- Important rules include preserving `metadata` and `resourceId`, and using `"<title> (copy)"` for clones.

### Relationship
- These entries share the same boundary: thread state must be restored and operated on using live auth/runtime identity, not stale snapshots or racing persistence writes.

## 3) Auth-sensitive chat transport and identity alignment
### `chat_page_transport/_index.md`
- `useChat` identity was expanded from `threadId` to `threadId:resourceId`.
- `DefaultChatTransport` is memoized on `threadId`, `resourceId`, and `getAccessToken`.
- This ensures a fresh transport and chat instance when anonymous state resolves into authenticated state.

### Identity/caching synthesis entries
- `chat-persistence-keys-off-auth-identity-not-just-thread-identity.md`
- `identity-sensitive-caching-and-persistence-must-track-auth-transitions.md`
- `runtime-identity-and-live-state-must-stay-aligned-across-auth-chat-transport-and.md`
- `runtime-identity-drives-both-auth-transport-and-chat-state.md`
- `runtime-identity-is-the-coordination-boundary-for-auth-chat-transport-caching-an.md`
- `runtime-identity-must-be-resolved-at-runtime-across-auth-chat-and-deployment.md`
- `runtime-identity-must-be-resolved-at-the-boundary-not-cached-early.md`
- `runtime-identity-must-propagate-through-auth-chat-transport-and-memory.md`
- `runtime-identity-must-stay-aligned-across-auth-chat-transport-and-memory.md`
- `runtime-identity-must-stay-aligned-across-auth-chat-transport-and-thread-cache.md`
- `thread-identity-is-the-hidden-coupling-between-chat-state-cache-and-auth.md`
- `streaming-ui-memory-and-persistence-are-coupled-through-thread-identity.md`

Common invariant across these entries:
- Chat transport, cache, memory, and persistence all depend on live runtime identity.
- `threadId` alone is insufficient; `resourceId` and auth-derived identity must be part of the key.
- Auth transitions must recreate transport and rehydrate cached state together.
- Runtime values like callback origin and baseURL must be resolved at the boundary rather than cached early.

## 4) Streaming, scroll stability, and sidebar stability
### `chat_streaming_error_handling/_index.md`
- Captures the frontend chat streaming path centered on `AISdkStreamBuilder` SSE behavior.
- Flow is request → SSE stream opens → chunks stream to UI → errors handled → stream closes.
- Playwright mock routes centralize Mastra chat/memory endpoints for deterministic tests.
- `ChatPage` handles streaming status, reruns, and error rendering tied to `useChat` failures.

### `chat_page_scroll_stability/_index.md`
- Scroll behavior was refined so viewport-targeted scrolling uses `viewport.scrollTo` rather than `scrollIntoView`.
- `min-h-0` was added to the `ScrollArea` container to allow flex children to shrink correctly.
- Focus jumps were reduced with `preventScroll: true` after input, new thread, and thread selection actions.
- `overflow-clip` is not a substitute for `overflow-hidden` because it does not create a formatting context.

### `scroll_area_sidebar_stability/_index.md`
- The layout is a flex `h-screen` with a fixed sidebar and a message-history `ScrollArea`.
- Scrolling moved to the nearest `data-slot="scroll-area-viewport"` element with direct `scrollTo`.
- The outer container changed from `overflow-hidden` to `overflow-clip` so the sidebar stays visible during conversation scrolling.
- Root cause: `scrollIntoView` climbed to the layout root and pushed the sidebar off-screen.

### Relationship
- These entries form the layout/interaction stability layer for chat: streaming must not break scroll position, and message updates must not move the sidebar.

## 5) Message persistence, parsing, citations, and feedback
### `message_persistence_parsing/_index.md`
- `convertThreadMessageToUIMessage` now handles `MastraMessageContentV2` payloads with structured `parts`.
- `convertV4PartsToV5` translates tool-invocation parts into dynamic-tool / step-start / text parts.
- Legacy payloads still fall back to `extractText`, but multi-paragraph formatting is preserved with `\n\n`.
- Tool invocation state `'result'` maps to `'output-available'`; all other states map to `'input-available'`.

### `message_citations/_index.md`
- Introduces `buildCitationResolver(sources)` in `packages/web/src/lib/message-parts.ts`.
- Citation resolution order:
  1. exact source-label match
  2. deepest same-policy dotted-ancestor
  3. normalized-URL fallback
- `MessageList` and clipboard generation both use the same resolver so inline citations, sources rows, and copied text remain aligned.

### `message_feedback/_index.md`
- End-to-end feedback flow spans:
  - `packages/agent/src/feedback/repository.ts`
  - `packages/agent/src/feedback/routes.ts`
  - `packages/web/src/lib/feedback-client.ts`
  - `packages/web/src/components/MessageActions.tsx`
  - `packages/web/src/app/chat/page.tsx`
- Feedback is message-centric, stored with the originating message, and uses optimistic UI with rollback on errors.
- Down votes can surface a “What went wrong?” comment input.
- Important rules:
  - `registerApiRoute` paths must not begin with `"/api/"`
  - `getResourceId` must resolve `user.userId` or `user.id` from request context or throw
  - `FeedbackEntry.comment` is `null` for up ratings

### Relationship
- Persistence parsing preserves message structure across reloads.
- Citation resolution keeps sources readable and traceable.
- Feedback connects rendered messages back to persisted state and auth-derived resource identity.

## 6) Proxy, theme, and design-system infrastructure
### `proxy_handling/_index.md`
- Next.js 16 migration replaced deprecated middleware with `proxy.ts` using `authkitProxy`.
- Proxy signature now uses `NextRequest` only; `NextFetchEvent` was removed to fix adapter errors.
- Auth is still gated to `/auth/callback`, while matcher exclusions continue to skip static assets and public metadata routes.

### `web_theme_persistence.md`
- Theme persistence is cookie-first: cookie drives first paint, while WorkOS metadata is secondary for sync/backfill.
- Server-side read in `layout.tsx` and client-side pre-paint read prevent a flash of incorrect theme.
- Depends on `packages/web/src/app/actions/theme.ts` and `packages/web/src/app/layout.tsx`.

### `design_system/_index.md`
- Defines the “Document of Record” editorial design language for `packages/web`.
- Typography stack: `Fraunces`, `Newsreader`, `IBM Plex Mono`.
- Theme model: parchment light mode, library-at-night dark mode, OKLCH token palettes.
- A fixed paper-grain overlay must stay below portaled overlays and sidebar/backdrop layers.
- Preserve every `data-testid`; the test suite stayed green because they were retained.

### Relationship
- These entries define the app’s framework-level presentation and request-handling boundaries: auth routing, theme prepaint behavior, and the document-like visual language.

## 7) Structural relationships to drill into
- **Chat page implementation and polish:** `chat_page_review_fixes.md`
- **Thread cache restoration and thread switching:** `chat_thread_cache_restoration.md`, `message_persistence_cache.md`
- **Auth-sensitive transport reinitialization:** `authenticated_chat_transport_reinitialization.md`
- **Streaming and error handling:** `ai_sdk_v6_sse_streaming_and_error_handling.md`
- **Citation and message rendering:** `message_citation_resolution.md`, `quiet_citation_styling_in_messagelist.md`
- **Feedback pipeline:** `message_feedback_flow.md`
- **Scroll and sidebar stability:** `chat_page_scroll_stability.md`, `chat_sidebar_scroll_fix.md`
- **Theme and proxy handling:** `web_theme_persistence.md`, `next_js_16_proxy_authkit_migration.md`

## 8) Cross-cutting invariant
Across all child entries, the same design rule repeats: **runtime identity must be resolved live and propagated through transport, cache, persistence, and rendering**. Anything keyed only on thread identity, build-time assumptions, or stale snapshots risks mixing user state, breaking auth, or restoring the wrong chat UI.