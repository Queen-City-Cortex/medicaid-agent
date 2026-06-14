---
children_hash: d13f1f7a1b02c0912eaa225778ba39bb471231bbf2b5ffcc142a76f302670eac
compression_ratio: 0.3121067203624465
condensation_order: 2
covers: [chat_page_review_fixes/_index.md, chat_page_scroll_stability/_index.md, chat_page_thread_cache/_index.md, chat_page_transport/_index.md, chat_streaming_error_handling/_index.md, context.md, message_feedback/_index.md, message_persistence_cache/_index.md, message_persistence_parsing/_index.md, proxy_handling/_index.md, runtime-identity-drives-both-auth-transport-and-chat-state.md, runtime-identity-must-propagate-through-auth-chat-transport-and-memory.md, runtime-identity-must-stay-aligned-across-auth-chat-transport-and-memory.md, scroll_area_sidebar_stability/_index.md, streaming-ui-memory-and-persistence-are-coupled-through-thread-identity.md, thread_sidebar/_index.md]
covers_token_total: 7946
summary_level: d2
token_count: 2480
type: summary
---
# Frontend UI Chat Stability and Feedback

This cluster documents the NC Medicaid Navigator chat page as a set of tightly coupled UI, transport, persistence, and feedback behaviors. The main recurring pattern is **runtime identity**: `threadId`, auth-derived `resourceId`, and token readiness determine when chat transport, memory, cache restoration, and sidebar fetches must refresh.

## Core chat page structure

- **`chat_page_review_fixes/_index.md`**
  - Refactors `packages/web/src/app/chat/page.tsx` into clearer component boundaries:
    - `EmptyState`
    - `MessageList`
    - `ChatInput`
    - `ResearchTrace`
  - Main layout: collapsible `ThreadSidebar` + main `ScrollArea` for messages or empty state.
  - Chat transport uses `useChat` with `DefaultChatTransport` targeting `${MASTRA_URL}/chat` and `getAccessToken`.
  - UI hardening includes:
    - softened sidebar light-mode styling
    - accessible thread buttons
    - delete confirmation dialog
    - CSS `line-clamp` title truncation
    - Lucide icons
    - auth loading skeleton
  - Related drill-down: **`chat_page_scroll_stability.md`** and the message/transport/cache topics below.

## Scroll and layout stability

- **`chat_page_scroll_stability/_index.md`**
  - Focuses on viewport-safe scrolling during streaming and thread switching.
  - Decision: keep `viewport.scrollTo` rather than `scrollIntoView` so the sidebar stays visible and the layout root does not overscroll.
  - `min-h-0` was added to the main `ScrollArea` container to let flex children shrink correctly.
  - `preventScroll: true` is used after input, new thread, and thread selection actions to avoid focus jumps.
  - Constraint: `overflow-clip` is not a substitute for `overflow-hidden` because it does not create a formatting context.
  - Related drill-down: **`frontend_ui/scroll_area_sidebar_stability`**.

- **`scroll_area_sidebar_stability/_index.md`**
  - Describes the root cause of sidebar displacement: `scrollIntoView()` climbed to the layout root and pushed the fixed sidebar off-screen.
  - Fix: scroll the nearest `data-slot="scroll-area-viewport"` directly with `viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" })`.
  - Architectural decision: outer layout changed from `overflow-hidden` to `overflow-clip` to preserve sidebar visibility during streaming updates.
  - Related drill-down: **`Chat Sidebar Scroll Fix`**.

## Transport, auth, and runtime identity

- **`chat_page_transport/_index.md`**
  - Documents auth-bound chat transport reinitialization.
  - `useChat` identity was expanded from `threadId` to `threadId:resourceId`, with `resourceId` defaulting to `anonymous` until auth resolves.
  - `DefaultChatTransport` is memoized on `threadId`, `resourceId`, and `getAccessToken`, so auth changes recreate the transport and refresh chat state.
  - `ChatPage` coordinates auth scoping, thread lifecycle, sidebar toggles, empty state, message list, and scroll helpers.
  - Dependencies: `useAuth`, `useAccessToken`, `useMastraClient`, `DefaultChatTransport`, `ThreadSidebar`, `ScrollArea`.

- Cross-cutting synthesized entries reinforce the same rule:
  - **`runtime-identity-drives-both-auth-transport-and-chat-state.md`**
  - **`runtime-identity-must-propagate-through-auth-chat-transport-and-memory.md`**
  - **`runtime-identity-must-stay-aligned-across-auth-chat-transport-and-memory.md`**
  - Shared conclusion: auth transitions, callback routing, transport, cache restore, and memory access all require the same runtime identity boundary to stay aligned.

## Thread cache, restoration, and message persistence

- **`chat_page_thread_cache/_index.md`**
  - Restores per-thread conversations when `setThreadId` recreates `useChat`.
  - Uses `messageCache` keyed by `threadId` to store assistant replies when streaming completes.
  - `handleSelectThread` buffers cached messages in `pendingRestore` instead of calling `setMessages` immediately.
  - A `useEffect` on `threadId` applies the buffered payload after the new `useChat` instance mounts, then clears `pendingRestore`.
  - Prevents writes to the stale chat instance that existed before `threadId` changed.
  - Related areas:
    - **`frontend_ui/message_persistence_cache/message_persistence_cache.md`**
    - **`frontend_ui/message_persistence_parsing/message_persistence_parsing.md`**
    - **`frontend_ui/message_persistence_cache/chat_page_thread_cache_race_fix.md`**

- **`message_persistence_cache/_index.md`**
  - Covers the race condition caused by async `savePerStep` persistence.
  - Uses a short-lived `useRef Map` cache keyed by `threadId`.
  - Flow:
    - `useChat.onFinish` stores the final UI messages
    - `handleSelectThread` reads cache first and renders immediately
    - entry is deleted
    - `loadThread` refreshes from the database
  - Database remains authoritative once async writes finish; cache only bridges the timing gap.

- **`message_persistence_parsing/_index.md`**
  - Handles reconstruction of persisted thread messages into `UIMessage` payloads in `packages/web/src/lib/parse-message.ts`.
  - Structured Mastra payloads are preferred; legacy text is a fallback.
  - `convertThreadMessageToUIMessage` detects `MastraMessageContentV2` via `format 2 + parts array`.
  - `convertV4PartsToV5` translates older tool-invocation parts.
  - Tool states are normalized for `ResearchTrace` compatibility:
    - `result` → `output-available`
    - all others → `input-available`
  - `extractText` preserves paragraph spacing by joining segments with `\n\n`.

## Streaming errors and test-facing SSE behavior

- **`chat_streaming_error_handling/_index.md`**
  - Centers on AI SDK v6 SSE streaming, deterministic Playwright mocks, and ChatPage error behavior.
  - `AISdkStreamBuilder` replaces `MastraStreamBuilder` for test payloads and emits:
    - start
    - start-step
    - text deltas
    - tool input/output
    - finish-step
    - finish
  - `mockMastraAPI` centralizes routing for:
    - `POST /chat`
    - `GET/POST /api/memory/threads`
    - `GET /api/memory/threads/:id/messages`
  - ChatPage behavior includes:
    - create thread before sending
    - 10k-character input limit
    - reruns reuse the original user text
    - destructive error alert on `useChat` failure
    - textarea disabled while streaming/loading
  - Fixed agent ID: `nc-medicaid-navigator`.
  - Key UI error message:
    - “Sorry, there was an error processing your question. Please try again.”

## Thread sidebar resilience

- **`thread_sidebar/_index.md`**
  - Documents `ThreadSidebar.tsx` and `use-mastra-client.ts`.
  - Sidebar responsibilities:
    - `+ New`
    - thread list
    - loading/error states
    - rename/delete
    - signed-in user footer and sign-out
  - Fetch lifecycle is guarded by `useMastraReady` and `useMastraClient`, then `listMemoryThreads` with `AbortController`.
  - If `listMemoryThreads` returns `401` while auth is not ready, the error is swallowed and retried after auth resolves.
  - `mastraClient` is recreated whenever the access token changes.
  - Fixed agent ID for memory thread calls: `nc-medicaid-navigator`.
  - Related drill-down: **`Authenticated Chat Transport Reinitialization`**.

## Feedback pipeline

- **`message_feedback/_index.md`**
  - Covers persistence, API routing, web client helpers, and chat UI integration for message feedback.
  - Persistence layer:
    - `FeedbackRepository` in `packages/agent/src/feedback/repository.ts`
    - wraps `@libsql/client`
    - lazily creates `feedback` table
    - enforces `UNIQUE(message_id, resource_id)`
    - rating validation: `up` / `down`
  - API layer:
    - `packages/agent/src/feedback/routes.ts`
    - routes registered through `registerApiRoute`
    - handles `POST`, `GET`, and `DELETE` on `/feedback` and `/feedback/:id`
    - derives `resourceId` from `c.get("requestContext").get("user")`
    - payloads validated with `zod`
  - Web client layer:
    - `packages/web/src/lib/feedback-client.ts`
    - `submitFeedback`, `deleteFeedback`, `getFeedbackByThread`
    - uses `fetch` with Bearer auth and `credentials: include`
  - UI integration:
    - `packages/web/src/components/MessageActions.tsx`
    - `packages/web/src/app/chat/page.tsx`
    - uses `feedbackMap`, optimistic updates, and persistence hooks
  - Important rules:
    - `registerApiRoute` paths must not begin with `/api/`
    - `getResourceId` must resolve `user.userId` or `user.id`, otherwise throw `"User not authenticated"`
    - `FeedbackEntry.comment` is `null` for up ratings and only set for down ratings with user-entered text

## Proxy and auth routing

- **`proxy_handling/_index.md`**
  - Describes the move from Next.js middleware to Next.js 16 `proxy.ts` with WorkOS Authkit.
  - `packages/web/src/proxy.ts` exports a named `proxy` function that forwards each `NextRequest` to `authkitProxy`.
  - Middleware auth config:
    - `middlewareAuth: { enabled: true, unauthenticatedPaths: ['/auth/callback'] }`
  - Matcher excludes static assets and metadata paths:
    - `_next/static`
    - `_next/image`
    - `favicon.ico`
    - `sitemap.xml`
    - `robots.txt`
  - Migration highlights:
    - replaced `authkitMiddleware` with `authkitProxy`
    - removed unused `NextFetchEvent`
    - resolved the “adapterFn is not a function” error
  - Dependency: `@workos-inc/authkit-nextjs`

## Overall structural takeaway

The chat UI is organized around a few stable boundaries:
- **Layout stability**: `ScrollArea`, sidebar visibility, and flex sizing
- **Identity stability**: `threadId` + auth-derived `resourceId`
- **State durability**: message cache, pending restore, persisted parsing, and async persistence race handling
- **Operational reliability**: auth-aware transport refresh, sidebar fetch resilience, and deterministic streaming/error handling
- **User interaction integrity**: accessible thread controls, feedback persistence, and rerun-friendly streaming behavior