---
children_hash: 4175d9e5bad56edaf114526b8370ed1a51bb0b5613407384d2cf242cc0317828
compression_ratio: 0.33516617790811337
condensation_order: 2
covers: [chat_page_review_fixes/_index.md, chat_page_scroll_stability/_index.md, chat_page_thread_cache/_index.md, chat_page_transport/_index.md, chat_streaming_error_handling/_index.md, context.md, message_feedback/_index.md, message_persistence_cache/_index.md, message_persistence_parsing/_index.md, proxy_handling/_index.md, runtime-identity-drives-both-auth-transport-and-chat-state.md, runtime-identity-must-propagate-through-auth-chat-transport-and-memory.md, runtime-identity-must-stay-aligned-across-auth-chat-transport-and-memory.md, scroll_area_sidebar_stability/_index.md, streaming-ui-memory-and-persistence-are-coupled-through-thread-identity.md, thread_sidebar/_index.md]
covers_token_total: 8184
summary_level: d2
token_count: 2743
type: summary
---
# Frontend UI: Chat, Streaming, Persistence, and Sidebar Coordination

The `frontend_ui` knowledge set centers on a chat page whose behavior is tightly coupled to auth state, thread identity, streaming transport, persistence, and sidebar layout. The main drill-down areas are `chat_page_review_fixes`, `chat_page_scroll_stability`, `chat_page_thread_cache`, `chat_page_transport`, `chat_streaming_error_handling`, `message_feedback`, `message_persistence_cache`, `message_persistence_parsing`, `proxy_handling`, `scroll_area_sidebar_stability`, and `thread_sidebar`.

## Shared architectural themes
- **Runtime identity drives state reuse and reset**: chat transport, thread restoration, and memory loading all depend on `threadId` plus auth-derived `resourceId`.
- **UI layout is flex- and viewport-driven**: the page uses a fixed sidebar plus a main `ScrollArea`, with scrolling constrained to the viewport rather than the layout root.
- **Persistence is layered**: structured Mastra messages, cache restoration, and database-backed thread loading work together to preserve chat history across rerenders and thread switches.
- **Auth and proxy boundaries matter**: WorkOS/Authkit, Next.js 16 `proxy.ts`, and token-aware Mastra client creation ensure authenticated requests stay aligned with runtime state.

## Chat page review and layout refinement
### `chat_page_review_fixes`
- Documents the main ChatPage refactor in `packages/web/src/app/chat/page.tsx`.
- The original ~380-line page was split into `EmptyState`, `MessageList`, and `ChatInput`, with `ResearchTrace` centralizing policy-tool trace/status rendering.
- Layout includes a collapsible `ThreadSidebar`, a main `ScrollArea`, and top-level auth/loading handling.
- UI changes include softer light-mode sidebar styling, accessible thread buttons, deletion confirmation, CSS-based title truncation via `line-clamp`, Lucide icons, adjusted empty-state/footer spacing, and an auth loading skeleton.
- Key flow: auth loading → layout mount → thread lifecycle → message/empty-state render → input streaming/rerun → research trace rendering.
- Important facts: sidebar light mode uses `oklch(0.94)`, border strength is `0.85`, and empty-state examples use left accent borders.

## Scroll stability and viewport control
### `chat_page_scroll_stability`
- Focuses on message streaming and thread-switch scrolling behavior.
- Core decision: continue using `viewport.scrollTo` instead of `scrollIntoView` so the sidebar remains visible and the layout root does not overscroll.
- Adds `min-h-0` to the main `ScrollArea` container so flex children can shrink correctly.
- Focus management uses `preventScroll: true` after input, new-thread creation, and thread selection to avoid focus-driven jumps.
- Important constraint: `overflow-clip` is not a substitute for `overflow-hidden` because it does not create a formatting context.

### `scroll_area_sidebar_stability`
- Captures the sibling-preservation fix for the fixed sidebar while the conversation area scrolls.
- The page uses a flex `h-screen` layout with a fixed-width sidebar and a message-history `ScrollArea`.
- Scroll handling moved from `messagesEndRef.scrollIntoView()` to the nearest `data-slot="scroll-area-viewport"` element, using `viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" })`.
- Architectural choice: change the outer container from `overflow-hidden` to `overflow-clip` to prevent sidebar displacement.
- Root cause: `scrollIntoView` climbed to the overflow-hidden root and pushed the sidebar off-screen; a measurement showed `getBoundingClientRect().top = -458px`.

## Thread cache and restoration behavior
### `chat_page_thread_cache`
- Describes how per-thread conversations are preserved when `setThreadId` recreates `useChat`.
- A `messageCache` map keyed by `threadId` stores assistant replies when streaming finishes and status changes from `streaming` to `ready`.
- `handleSelectThread` buffers cached messages in `pendingRestore` instead of calling `setMessages` immediately.
- A `useEffect` watching `threadId` applies the buffered payload after the new `useChat` instance mounts, then clears `pendingRestore`.
- This avoids writing restored messages into the stale `useChat` instance created before the thread switch.
- Flow: thread select → `setThreadId` / transport recreation → pending restore effect → `setMessages` on fresh instance → clear buffer.
- Related areas: `message_persistence_cache` and `message_persistence_parsing`.

### `message_persistence_cache`
- Focuses on the race between restoring a thread and the async `savePerStep` write finishing.
- Canonical fix: a per-thread `messageCache` `useRef(Map)` is populated in `useChat.onFinish`.
- `handleSelectThread` reads cache first, restores immediately, deletes the cache entry after use, and still calls `loadThread` so the database can reconcile later.
- The cache is short-lived, per-thread, and consumed on first use to avoid stale data.
- Key dependency: `savePerStep` writes to `memory_threads` asynchronously, so DB reads may lag behind the UI state.

## Auth-bound transport and chat instance lifecycle
### `chat_page_transport`
- Documents authenticated chat transport reinitialization.
- `useChat` identity expands from `threadId` to `threadId:resourceId`, with `resourceId` defaulting to `anonymous` until auth loads.
- `DefaultChatTransport` is memoized on `threadId`, `resourceId`, and `getAccessToken`, forcing a fresh transport when auth changes.
- The core rule is that `useChat` only recreates internally when its `id` changes, so `resourceId` must be part of the identifier to handle anonymous-to-authenticated transitions.
- `ChatPage` owns transport creation, auth scoping, thread lifecycle, sidebar toggles, empty states, message lists, and scroll helpers.
- Dependencies include `useAuth`, `useAccessToken`, `useMastraClient`, `DefaultChatTransport`, `ThreadSidebar`, and `ScrollArea`.

## Streaming, SSE, and error handling
### `chat_streaming_error_handling`
- Centers on AI SDK v6 SSE stream generation, deterministic Playwright mocks, and ChatPage UI behavior.
- `AISdkStreamBuilder` replaces `MastraStreamBuilder` for test payloads and emits the sequence: start, start-step, text deltas, tool input/output, finish-step, finish.
- `mockMastraAPI` centralizes routing for:
  - `POST /chat`
  - `GET/POST /api/memory/threads`
  - `GET /api/memory/threads/:id/messages`
- ChatPage flow: create thread before sending, enforce a 10k-character input limit, reuse user text for reruns, show a destructive alert on `useChat` failure, and disable textarea/input while streaming or loading.
- Key facts: the UI error message is `"Sorry, there was an error processing your question. Please try again."`, and the page is keyed to agent ID `nc-medicaid-navigator`.

## Message feedback pipeline
### `message_feedback`
- Covers persistence, API routing, web client helpers, and chat UI integration for feedback.
- Persistence layer: `FeedbackRepository` wraps `@libsql/client`, lazily creates the `feedback` table, and enforces `UNIQUE(message_id, resource_id)` plus rating validation (`up` / `down`).
- API layer: Hono routes via `registerApiRoute` handle `POST`, `GET`, and `DELETE` on `/feedback` and `/feedback/:id`, validating with `zod` and deriving `resourceId` from `requestContext`.
- Web client layer: `submitFeedback`, `deleteFeedback`, and `getFeedbackByThread` use `fetch` with Bearer auth and `credentials: include`.
- UI integration: `MessageActions.tsx` and `chat/page.tsx` connect feedback state through `feedbackMap`, optimistic updates, and persistence hooks.
- Important rules: `registerApiRoute` paths must not begin with `/api/`; `getResourceId` must resolve `user.userId` or `user.id` or throw `"User not authenticated"`; `FeedbackEntry.comment` is `null` for up ratings and only set for down ratings with user-entered text.

## Message parsing and structured reloads
### `message_persistence_parsing`
- Documents reconstruction of chat-thread messages into `UIMessage` payloads in `packages/web/src/lib/parse-message.ts`.
- `convertThreadMessageToUIMessage` detects `MastraMessageContentV2` via the `format 2 + parts array` signal.
- Structured content uses `convertV4PartsToV5`; legacy text falls back to `extractText`.
- Tool invocation states are normalized for `ResearchTrace` compatibility: `result` becomes `output-available`, while all other states become `input-available`.
- `extractText` joins mixed text segments with `\n\n` to preserve paragraph spacing.
- The topic ensures persisted Mastra messages survive reloads with structured parts, tool metadata, and formatting intact.

## Frontend proxy and authkit migration
### `proxy_handling`
- Documents the move from Next.js middleware to the Next.js 16 `proxy.ts` pattern with WorkOS Authkit.
- `packages/web/src/proxy.ts` exports a named `proxy` function that forwards each `NextRequest` to `authkitProxy`.
- Configuration enables middleware auth and exempts only `/auth/callback`.
- Matcher excludes static assets and metadata paths (`_next/static`, `_next/image`, `favicon.ico`, `sitemap.xml`, `robots.txt`).
- Migration highlights: replace `authkitMiddleware` with `authkitProxy`, drop `NextFetchEvent`, and use the Next.js 16 single-argument proxy signature.

## Thread sidebar fetch resilience
### `thread_sidebar`
- Focuses on keeping the sidebar responsive while WorkOS auth and Mastra memory access initialize.
- `ThreadSidebar.tsx` renders `+ New`, a scrollable thread list, loading/error states, rename/delete flows, and a signed-in-user footer with sign-out.
- Fetch lifecycle: `useMastraReady` and `useMastraClient` establish readiness, `fetchThreads` uses an `AbortController`, `listMemoryThreads` retrieves threads, results are sorted by `updatedAt`, and loading clears after update.
- Key resilience rule: a `401` is non-fatal while `useMastraReady` is false; the sidebar silently retries once auth is ready.
- `useMastraClient` recreates `mastraClient` whenever the access token changes, keeping fetches aligned with auth state.
- Important facts: abort stale thread-list requests on dependency changes, and the fixed agent ID for memory thread calls is `nc-medicaid-navigator`.

## Cross-cutting relationships
- `chat_page_review_fixes`, `chat_page_scroll_stability`, and `scroll_area_sidebar_stability` all describe different layers of the same ChatPage layout/scroll system.
- `chat_page_transport`, `chat_page_thread_cache`, `message_persistence_cache`, and `message_persistence_parsing` form the runtime identity and persistence pipeline around `useChat`.
- `chat_streaming_error_handling` connects UI behavior to SSE test payloads and mocked Mastra endpoints.
- `message_feedback` integrates directly into the chat page’s message lifecycle and relies on the same auth/resource identity model.
- `proxy_handling` and `thread_sidebar` document the auth boundary conditions that keep chat transport and memory loading synchronized.