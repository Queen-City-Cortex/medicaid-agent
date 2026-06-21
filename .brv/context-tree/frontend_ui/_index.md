---
children_hash: c881868ab977e34f446646853b71fb8bae9430c80900cc145ef94cff34b219d6
compression_ratio: 0.26766946292546523
condensation_order: 2
covers: [chat_page_review_fixes/_index.md, chat_page_scroll_stability/_index.md, chat_page_thread_cache/_index.md, chat_page_transport/_index.md, chat_streaming_error_handling/_index.md, context.md, design_system/_index.md, live_testing/_index.md, message_feedback/_index.md, message_persistence_cache/_index.md, message_persistence_parsing/_index.md, proxy_handling/_index.md, runtime-identity-drives-both-auth-transport-and-chat-state.md, runtime-identity-must-propagate-through-auth-chat-transport-and-memory.md, runtime-identity-must-stay-aligned-across-auth-chat-transport-and-memory.md, scroll_area_sidebar_stability/_index.md, streaming-ui-memory-and-persistence-are-coupled-through-thread-identity.md, thread-identity-is-the-hidden-coupling-between-chat-state-cache-and-auth.md, thread_sidebar/_index.md]
covers_token_total: 10371
summary_level: d2
token_count: 2776
type: summary
---
# Frontend UI Structural Summary

This layer organizes the chat experience around a few tightly coupled concerns: **chat page structure**, **runtime identity**, **thread/cache persistence**, **streaming/error handling**, **scroll stability**, **message feedback**, **message reconstruction/citation styling**, **theme/proxy behavior**, and **design language**. Many entries point back to `packages/web/src/app/chat/page.tsx`, with supporting behavior spread across `ThreadSidebar`, `useMastraClient`, `DefaultChatTransport`, and the app shell.

## 1) Chat page structure and testing workflows
### `chat_page_review_fixes`
- Documents the major cleanup of `packages/web/src/app/chat/page.tsx` into smaller components: `EmptyState`, `MessageList`, `ChatInput`, and `ResearchTrace`.
- The page layout centers on a flex container with a collapsible `ThreadSidebar`, main `ScrollArea`, and conditional `MessageList` vs `EmptyState`.
- Chat transport remains based on `useChat` + `DefaultChatTransport` targeting `${MASTRA_URL}/chat`, with `getAccessToken` and `mastraClient` thread management.
- Related UI refinements include sidebar visual softening, accessible thread actions, CSS-based truncation, improved empty state spacing, auth loading skeletons, and footer disclaimer styling.

### `live_ui_testing_without_workos_auth_wall`
- Defines two sanctioned ways to test the UI without full production auth/backend dependencies:
  1. dev-only `/preview` component gallery
  2. Playwright `design` project against the real `/chat` route with mocked backend calls
- `/preview` is fixture-driven, auth-free, and must stay `404` in production.
- The Playwright design path uses a saved WorkOS cookie, mocked Mastra routes, real chat shell rendering, and screenshot capture for light/dark themes.
- Explicit rule: do **not** add an env-based auth bypass in `proxy.ts`.

## 2) Scroll and layout stability
### `chat_page_scroll_stability`
- Focuses on keeping chat scrolling viewport-stable while streaming and switching threads.
- Key decision: use `viewport.scrollTo` instead of `scrollIntoView` so the sidebar stays visible and the layout root does not overscroll.
- Adds `min-h-0` to the main `ScrollArea` so flex children can shrink correctly.
- Uses `preventScroll: true` after input, new thread, and thread selection actions to avoid focus-driven jumps.
- Important constraint: `overflow-clip` is not a substitute for `overflow-hidden` because it does not create a formatting context.
- References `frontend_ui/scroll_area_sidebar_stability` for sidebar-specific fixes.

### `scroll_area_sidebar_stability`
- Captures the sidebar visibility bug fix where `messagesEndRef.scrollIntoView()` was replaced by direct scrolling on the `data-slot="scroll-area-viewport"` element.
- The conversation area scrolls with `viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" })` based on `messages`, `streamTimeline`, and `streamText`.
- Architectural decision: change the outer layout from `overflow-hidden` to `overflow-clip` to stop sibling displacement.
- Root cause: `scrollIntoView` climbed to the layout root and pushed the sidebar off-screen.

## 3) Thread identity, cache restoration, and transport reinitialization
These entries form the core runtime-identity model for chat correctness.

### `chat_page_transport`
- The `useChat` ID was expanded from `threadId` to `threadId:resourceId`, with `resourceId` defaulting to `anonymous` until auth resolves.
- `DefaultChatTransport` is memoized on `threadId`, `resourceId`, and `getAccessToken`, ensuring auth changes recreate transport and chat instance.
- `ChatPage` coordinates transport creation, auth scoping, thread lifecycle, sidebar toggles, empty states, message lists, and scroll helpers.
- Depends on `useAuth`/`useAccessToken`, `useMastraClient`, `DefaultChatTransport`, `ThreadSidebar`, and `ScrollArea`/UIKit components.

### `chat_page_thread_cache`
- Ensures per-thread conversations survive transport changes and `useChat` recreation during thread switching.
- Cache restoration depends on stable `threadId`; flow is `thread identity -> cache lookup -> restore persisted state -> render`.
- `messageCache` is keyed by `threadId` and captures assistant replies when streaming completes.
- `handleSelectThread` stores cached messages in `pendingRestore`; a `threadId`-dependent `useEffect` applies them after the new `useChat` instance mounts, avoiding stale writes.
- Related to broader message persistence/cache behavior and thread-state restoration.

### `message_persistence_cache`
- Describes a race between UI restoration and async `savePerStep` writes that could briefly show truncated conversations after switching threads.
- Fix in `packages/web/src/app/chat/page.tsx`:
  - `messageCache` `useRef(Map)` keyed by `threadId`
  - `useChat.onFinish` caches final messages before thread version advances
  - `handleSelectThread` restores cached messages first, removes the cache entry, then calls `loadThread`
- The cache is short-lived, per-thread, and consumed on first use to avoid stale data.

### Shared structural theme
- Multiple synthesis entries reinforce that **thread identity and auth-derived resource identity are the hidden coupling** between chat state, cache, memory, and transport.
- The common rule is: when auth changes, runtime identity must propagate through transport, cache restoration, and memory loading so stale credentials or the wrong thread state are not reused.

## 4) Streaming and error handling
### `chat_streaming_error_handling`
- Covers the SSE streaming path in the chat UI, centered on `AISdkStreamBuilder` and `ChatPage`.
- Core flow: request → stream opens → chunks render → errors are handled → stream closes.
- `ChatPage` owns streaming status, thread lifecycle helpers, and error rendering from `useChat`.
- Test support lives in `e2e/helpers/stream-builder.ts`, `e2e/helpers/mock-routes.ts`, and `e2e/tests/mocked/error-handling.spec.ts`.
- Closely related to authenticated transport and thread/cache handling.

## 5) Message persistence, parsing, and citation styling
### `message_persistence_parsing`
- Two linked behaviors:
  1. reconstructing persisted Mastra thread messages into `UIMessage`
  2. styling inline markdown citations in `MessageList`
- Parsing updates:
  - `convertThreadMessageToUIMessage` detects `MastraMessageContentV2` payloads (`format 2` with `parts`)
  - `convertV4PartsToV5` maps tool-invocation parts into dynamic-tool / step-start / text parts
  - legacy fallback uses `extractText`, joining text with `\n\n` to preserve paragraphs
- Key fact: tool invocation state `'result'` maps to `'output-available'`; all other states map to `'input-available'`.
- Citation styling pipeline:
  - markdown link → `normalizeCitationUrl` → source index lookup → quiet citation styling or external link styling → footnote navigation
- Mapped citations render subtly; unmapped external links keep gold accent styling.
- The superscript citation button remains the main affordance and jumps to the Sources panel.

## 6) Message feedback pipeline
### `message_feedback`
- Documents the end-to-end feedback flow across persistence, API routes, client helpers, and UI integration.
- Components:
  - `packages/agent/src/feedback/repository.ts` for LibSQL-backed persistence
  - `packages/agent/src/feedback/routes.ts` for POST/GET/DELETE routes
  - `packages/web/src/lib/feedback-client.ts` for submit/delete/fetch helpers
  - `packages/web/src/components/MessageActions.tsx` for optimistic UI and rollback
  - `packages/web/src/app/chat/page.tsx` for page-level integration
- Key behaviors:
  - feedback is message-centric and tied to persisted chat state
  - optimistic updates are rolled back on request failures
  - down votes may open a “What went wrong?” comment input
- Rules:
  - `registerApiRoute` paths must not begin with `"/api/"`
  - `getResourceId` must resolve `user.userId` or `user.id` from `c.get("requestContext")`, otherwise throw `User not authenticated`
  - `FeedbackEntry.comment` is `null` for up ratings and only populated for down ratings with text

## 7) Thread sidebar fetch resilience
### `thread_sidebar_fetch_resilience`
- Documents how `ThreadSidebar.tsx` and `use-mastra-client.ts` keep thread loading reliable as auth and props change.
- Uses an `AbortController` per fetch to cancel stale requests when dependencies change.
- `401` responses are swallowed while `useMastraReady` is false so token-pending states do not generate noise.
- `useMastraClient` recreates `mastraClient` when the access token changes, keeping `fetchThreads` stable.
- Rules:
  1. Treat `401` as non-error while `useMastraReady` is false.
  2. Abort any previous `listMemoryThreads` request when `client`, `resourceId`, `refreshKey`, or the current selection changes.

## 8) Proxy handling and theme persistence
### `proxy_handling`
- Captures two frontend infrastructure concerns: request interception/auth routing and persistent UI preference application.
- `next_js_16_proxy_authkit_migration`:
  - switches from `authkitMiddleware` to `authkitProxy` in `packages/web/src/proxy.ts`
  - uses the Next.js 16 `NextRequest`-only signature
  - keeps auth gated to `/auth/callback`
  - excludes `_next/static`, `_next/image`, `favicon`, `sitemap`, and `robots`
- `web_theme_persistence`:
  - uses cookie-first theme resolution for first paint
  - treats WorkOS metadata as secondary for cross-device sync and backfill
  - reads theme server-side in `layout.tsx` and client-side before paint to avoid flash of incorrect theme

## 9) Design system / editorial styling
### `design_system`
- Defines the “Document of Record” editorial design language for `packages/web`.
- Typography:
  - `Fraunces` for display
  - `Newsreader` for body text
  - `IBM Plex Mono` for apparatus/metadata
- Theme model:
  - light = parchment
  - dark = library at night
  - colors use OKLCH token palettes
- Visual texture includes a fixed paper-grain SVG overlay at `z-index: 10`.
- Print rules remove chrome and expand scroll areas for pagination; external links become print-safe.
- Implementation is via `packages/web/src/app/globals.css` and `packages/web/src/app/fonts.ts`.
- Important constraints:
  - preserve all `data-testid` attributes
  - grain overlay must stay below portaled overlays and sidebar/backdrop layers
  - `.font-mono` replaces, rather than merges with, body font feature settings

## Cross-entry relationships to drill into
- `chat_page_review_fixes` and `live_ui_testing_without_workos_auth_wall` together cover the stabilized chat page and its safe testing paths.
- `chat_page_transport`, `chat_page_thread_cache`, `message_persistence_cache`, and `thread_sidebar_fetch_resilience` form the runtime-identity/state-restoration cluster.
- `chat_page_scroll_stability` and `scroll_area_sidebar_stability` cover viewport/overflow behavior.
- `message_persistence_parsing` and `message_feedback` cover persisted content fidelity and response feedback.
- `proxy_handling` and `design_system` describe the infrastructure and visual foundation that the chat UI depends on.