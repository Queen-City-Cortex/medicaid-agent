---
children_hash: 390c688bc940d149585f183eb1af646337449a4ed68211bde2bca270faec1881
compression_ratio: 0.1679339762611276
condensation_order: 2
covers: [chat_page_review_fixes/_index.md, chat_page_scroll_stability/_index.md, chat_page_thread_cache/_index.md, chat_page_transport/_index.md, chat_streaming_error_handling/_index.md, context.md, design_system/_index.md, live_testing/_index.md, message_feedback/_index.md, message_persistence_cache/_index.md, message_persistence_parsing/_index.md, proxy_handling/_index.md, runtime-identity-drives-both-auth-transport-and-chat-state.md, runtime-identity-must-propagate-through-auth-chat-transport-and-memory.md, runtime-identity-must-stay-aligned-across-auth-chat-transport-and-memory.md, runtime-identity-must-stay-aligned-across-auth-chat-transport-and-thread-cache.md, scroll_area_sidebar_stability/_index.md, streaming-ui-memory-and-persistence-are-coupled-through-thread-identity.md, thread-identity-is-the-hidden-coupling-between-chat-state-cache-and-auth.md, thread_sidebar/_index.md]
covers_token_total: 10784
summary_level: d2
token_count: 1811
type: summary
---
# Frontend UI: chat behavior, testing, and runtime stability

This layer groups the main chat-page UX workstreams and the testing/proxy/design infrastructure around them. The shared theme is **runtime identity and layout stability**: chat transport, cache restoration, scroll behavior, and thread loading all depend on thread/auth state staying aligned.

## Chat page structure and review fixes
**Drill down:** `chat_page_review_fixes.md`

- `packages/web/src/app/chat/page.tsx` was refactored from a monolith into:
  - `EmptyState`
  - `MessageList`
  - `ChatInput`
  - `ResearchTrace`
- The page layout centers on a flex container with:
  - collapsible `ThreadSidebar`
  - main `ScrollArea`
  - conditional `MessageList` vs `EmptyState`
- Chat still uses `useChat` with `DefaultChatTransport` targeting `${MASTRA_URL}/chat`, plus `getAccessToken` and `mastraClient` thread management.
- UI polish includes softer sidebar styling, accessible thread actions, CSS `line-clamp` for truncation, improved empty-state spacing, authentication loading skeletons, and a corrected footer disclaimer opacity.

## Live UI testing without the WorkOS wall
**Drill down:** `live_ui_testing_without_workos_auth_wall.md` and `live_testing_without_the_workos_wall.md`

Two approved local testing paths are defined:

1. **Dev-only `/preview` gallery**
   - Renders real components against fixtures.
   - No auth, Mastra, or Neo4j dependency.
   - Protected from production by `404` gating.
   - Intended for fast component/theme iteration.

2. **Playwright `design` project**
   - Runs against the real `/chat` route.
   - Uses a saved WorkOS cookie from `auth.setup.ts`.
   - Mocks backend routes with `mockMastraAPI`.
   - Produces screenshots in `e2e/design-shots/`.
   - Best for validating integrated behavior like streaming, citations, and sidebar interactions.

Key rule: **do not add an env-gated auth bypass in `proxy.ts`**.

## Scroll and sidebar stability
**Drill down:** `chat_page_scroll_stability.md` and `chat_sidebar_scroll_fix.md`

- Scrolling uses `viewport.scrollTo` on the `data-slot="scroll-area-viewport"` element rather than `scrollIntoView`.
- This keeps the fixed sidebar visible and avoids overscrolling the layout root.
- The layout requires `min-h-0` on the main `ScrollArea` container so flex children can shrink correctly.
- Focus changes after input/thread actions use `preventScroll: true` to prevent jumpiness.
- Important constraint: `overflow-clip` is not a substitute for `overflow-hidden` because it does not create a formatting context.

## Thread cache and restoration
**Drill down:** `chat_page_thread_cache_restoration.md` and `chat_page_thread_cache_race_fix.md`

The chat page preserves per-thread conversations across transport changes and thread switches.

- `messageCache` is keyed by `threadId` and stores the final UI messages once streaming completes.
- `handleSelectThread` restores cached messages immediately, then still calls `loadThread` so persisted state can reconcile afterward.
- `pendingRestore` delays applying cached messages until the new `useChat` instance mounts, avoiding stale writes into an old instance.
- The main risk addressed is restoring the wrong thread or leaking messages across thread switches.

## Auth-bound transport reinitialization
**Drill down:** `authenticated_chat_transport_reinitialization.md`

- `useChat` identity was expanded from `threadId` to `threadId:resourceId`.
- `resourceId` defaults to `anonymous` until auth loads.
- `DefaultChatTransport` is memoized on `threadId`, `resourceId`, and `getAccessToken`, so auth changes force a fresh transport and chat instance.
- This prevents anonymous and authenticated sessions from sharing stale transport or memory state.

## Streaming and error handling
**Drill down:** `ai_sdk_v6_sse_streaming_and_error_handling.md`

- Streaming now uses `AISdkStreamBuilder` instead of `MastraStreamBuilder`.
- The flow is:
  `request -> SSE stream opens -> chunks stream to UI -> errors are handled -> stream closes`
- `ChatPage` owns streaming status, thread lifecycle helpers, and error rendering from `useChat`.
- Test support comes from:
  - `e2e/helpers/stream-builder.ts`
  - `e2e/helpers/mock-routes.ts`
  - `e2e/tests/mocked/error-handling.spec.ts`

## Message persistence, parsing, and citation styling
**Drill down:** `message_persistence_parsing.md`, `quiet_citation_styling_in_messagelist.md`, and `message_feedback_flow.md`

- Persisted Mastra thread messages are reconstructed into `UIMessage` payloads with support for `MastraMessageContentV2` and structured `parts`.
- `convertV4PartsToV5` preserves tool-invocation semantics and maps tool states so research traces remain intact after reload.
- Legacy payloads still fall back to `extractText`, with multi-paragraph formatting preserved via `\n\n`.
- Citation rendering in `MessageList` keeps mapped source links visually quiet while leaving unmapped external links gold-styled.
- The superscript citation button remains the primary citation affordance and jumps to the Sources panel.
- Feedback is message-centric and flows through persistent storage, API routes, web client helpers, and optimistic UI updates.

## Sidebar thread loading resilience
**Drill down:** `thread_sidebar_fetch_resilience.md`

- `ThreadSidebar.tsx` and `use-mastra-client.ts` keep thread loading reliable as auth and props change.
- Each fetch uses an `AbortController`; older requests are canceled when dependencies change.
- `401` responses are suppressed while `useMastraReady` is false so token-pending noise does not surface.
- `useMastraClient` recreates `mastraClient` when the access token changes, keeping thread fetches aligned with current auth state.

## Design system and proxy/theme infrastructure
**Drill down:** `document_of_record_design_language.md`, `next_js_16_proxy_authkit_migration.md`, and `web_theme_persistence.md`

- The web app uses a **Document of Record** editorial design language with:
  - `Fraunces`, `Newsreader`, and `IBM Plex Mono`
  - parchment/light and library-at-night/dark themes
  - OKLCH token palettes
  - a fixed paper-grain overlay
- `next_js_16_proxy_authkit_migration.md` documents the move from `authkitMiddleware` to `authkitProxy` in `packages/web/src/proxy.ts`, with the Next.js 16 `NextRequest`-only signature.
- Theme persistence is cookie-first:
  - cookie determines first paint
  - WorkOS metadata is secondary for sync/backfill
  - server read in `layout.tsx` plus pre-paint client read prevent a flash of incorrect theme

## Structural relationship across the layer
- `chat_page_review_fixes.md` defines the stabilized production chat UI.
- `chat_page_thread_cache_restoration.md`, `authenticated_chat_transport_reinitialization.md`, and `ai_sdk_v6_sse_streaming_and_error_handling.md` explain how chat state survives auth changes, streaming, and thread switches.
- `live_ui_testing_without_workos_auth_wall.md` and `live_testing_without_the_workos_wall.md` provide the safe development harness for validating those UI behaviors without requiring full production auth or backend availability.
- `document_of_record_design_language.md` and `web_theme_persistence.md` frame the presentation layer that these chat flows render within.