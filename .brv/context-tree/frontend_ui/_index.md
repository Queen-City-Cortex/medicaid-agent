---
children_hash: ac76d33d7e5673dba82ebe37940bbab02b9f568d73d3c7f9784a2f0826f65bad
compression_ratio: 0.22912703445360388
condensation_order: 2
covers: [chat_page_review_fixes/_index.md, chat_page_scroll_stability/_index.md, chat_page_thread_cache/_index.md, chat_page_transport/_index.md, chat_streaming_error_handling/_index.md, context.md, live_testing/_index.md, message_feedback/_index.md, message_persistence_cache/_index.md, message_persistence_parsing/_index.md, proxy_handling/_index.md, runtime-identity-drives-both-auth-transport-and-chat-state.md, runtime-identity-must-propagate-through-auth-chat-transport-and-memory.md, runtime-identity-must-stay-aligned-across-auth-chat-transport-and-memory.md, scroll_area_sidebar_stability/_index.md, streaming-ui-memory-and-persistence-are-coupled-through-thread-identity.md, thread_sidebar/_index.md]
covers_token_total: 9462
summary_level: d2
token_count: 2168
type: summary
---
# Frontend UI: Chat Page, Scroll, Transport, and Testing

This layer captures the production chat shell and the developer workflows used to test it safely. The recurring structure is **thread- and auth-aware UI state**: transport, memory, cache restoration, scrolling, and feedback all depend on stable runtime identity.

## Shared architectural pattern

- **Identity coupling:** `threadId` and auth-derived `resourceId` coordinate chat transport, memory, and restoration.
- **Production-safe boundaries:** no env-gated auth bypass in `proxy.ts`; development/testing uses explicit alternate paths.
- **Scroll containment:** scrolling is confined to the chat viewport so the fixed sidebar remains visible.
- **Persistence-first UX:** chat state is restored from cache or parsed persisted messages before falling back to fresh loads.

## Chat page and transport

### `chat_page_review_fixes`
Improves the main `/chat` experience by splitting the page into smaller components and tightening layout, accessibility, and traceability.

- Main component split: `EmptyState`, `MessageList`, `ChatInput`, plus `ResearchTrace` for tool/reasoning visibility.
- Layout uses a flex shell with `ThreadSidebar`, main `ScrollArea`, and conditional empty/message states.
- Visual polish includes lighter sidebar styling, reduced borders, CSS `line-clamp`, Lucide icons, and a loading skeleton.
- Depends on `DefaultChatTransport` targeting `${MASTRA_URL}/chat`, `getAccessToken`, `mastraClient`, `ThemeToggle`, and WorkOS auth.
- Drill-down: `packages/web/src/app/chat/page.tsx`, `packages/web/src/components/ThreadSidebar.tsx`, `packages/web/src/components/ResearchTrace.tsx`, `packages/web/src/components/EmptyState.tsx`.

### `chat_page_transport`
Documents authenticated transport reinitialization.

- `useChat` identity expands from `threadId` to `threadId:resourceId`.
- `resourceId` defaults to `anonymous` until auth resolves.
- `DefaultChatTransport` is memoized on `threadId`, `resourceId`, and `getAccessToken`, forcing a fresh transport when auth changes.
- Ensures authenticated credentials and refreshed memory scope after auth transitions.
- Strongly linked to thread cache restoration and sidebar fetch readiness.

## Scroll and layout stability

### `chat_page_scroll_stability`
Focuses on keeping chat scrolling stable during streaming and thread switching.

- Uses `viewport.scrollTo` instead of `scrollIntoView` so the sidebar is not displaced.
- Adds `min-h-0` to the main `ScrollArea` container so flex children can shrink correctly.
- Uses `preventScroll: true` after input, new-thread, and thread-selection actions to avoid focus-driven jumps.
- Notes that `overflow-clip` does not replace `overflow-hidden` because it does not create a formatting context.
- Drill-down: `frontend_ui/scroll_area_sidebar_stability`.

### `scroll_area_sidebar_stability`
Explains the sidebar visibility bug and its fix.

- Chat layout is `h-screen` with a fixed sidebar and message `ScrollArea`.
- Scrolling moved from `messagesEndRef.scrollIntoView()` to the `data-slot="scroll-area-viewport"` element.
- Layout outer container changed from `overflow-hidden` to `overflow-clip` to stop sibling displacement.
- Root cause: `scrollIntoView` climbed to the layout root and pushed the sidebar off-screen.
- Drill-down: `packages/web/src/app/chat/page.tsx`.

## Thread state, cache, and persistence

### `chat_page_thread_cache`
Covers restoration after `setThreadId` recreates `useChat`.

- `messageCache` stores assistant replies keyed by `threadId`.
- `handleSelectThread` buffers cached messages in `pendingRestore` instead of calling `setMessages` immediately.
- A `useEffect` on `threadId` applies the buffered payload after the new `useChat` instance mounts.
- Prevents writes to the stale chat instance created before `threadId` changed.
- Depends on `useChat` from `@ai-sdk/react`, `DefaultChatTransport`, `useMastraClient`, and thread-history loading.
- Related areas: `frontend_ui/message_persistence_cache`, `frontend_ui/message_persistence_parsing`.

### `message_persistence_cache`
Describes the race fix between UI restoration and async persistence.

- The problem was a race between UI restore and `savePerStep` finishing.
- Fix: per-thread `messageCache` stores final UI messages in `useChat.onFinish`.
- `handleSelectThread` restores from cache immediately, removes the entry, and still calls `loadThread` so DB state can reconcile later.
- The cache is short-lived, thread-specific, and consumed on first use.
- Keeps UI, DB, and memory thread state aligned.

### `message_persistence_parsing`
Shows how persisted thread messages are rebuilt into UI messages.

- `convertThreadMessageToUIMessage` detects `MastraMessageContentV2` via the `format 2 + parts array` signal.
- Structured messages use `convertV4PartsToV5`; legacy text falls back to `extractText`.
- Tool invocation states are normalized for `ResearchTrace` compatibility:
  - `result` → `output-available`
  - other states → `input-available`
- Preserves structured content, tool metadata, and paragraph spacing.
- Related to `chat_page_transport`, `message_feedback`, and cache/restoration topics.

## Messaging, feedback, and streaming

### `message_feedback`
Defines the feedback pipeline for chat messages.

- Persistence: `FeedbackRepository` wraps `@libsql/client`, lazily creates `feedback`, and enforces `UNIQUE(message_id, resource_id)`.
- API: Hono routes via `registerApiRoute` expose `POST`, `GET`, `DELETE` on `/feedback` and `/feedback/:id`.
- Client: `submitFeedback`, `deleteFeedback`, `getFeedbackByThread` use Bearer auth with `credentials: include`.
- UI: `MessageActions.tsx` and `chat/page.tsx` use optimistic updates and `feedbackMap`.
- Rules:
  - `registerApiRoute` paths must not begin with `/api/`.
  - `getResourceId` must resolve `user.userId` or `user.id`, otherwise throw `"User not authenticated"`.
  - `FeedbackEntry.comment` is `null` for up ratings and only set for down ratings with user text.

### `chat_streaming_error_handling`
Covers SSE stream generation and error-state behavior.

- `AISdkStreamBuilder` replaces `MastraStreamBuilder` for deterministic Playwright SSE payloads.
- `mockMastraAPI` centralizes chat and memory endpoint routing for success/error flows.
- `ChatPage` handles:
  - thread creation before send,
  - 10k-character input limit,
  - rerun reuse of user text,
  - destructive error alerts on `useChat` failure,
  - disabled input while streaming/loading.
- The UI error message is: **"Sorry, there was an error processing your question. Please try again."**
- AGENT_ID is **`nc-medicaid-navigator`**.

## Safe local and end-to-end testing

### `live_testing`
Defines two supported ways to test UI without the WorkOS wall.

- **`/preview` dev gallery**
  - Fast component iteration against fixtures.
  - No auth, no Mastra/Neo4j dependency.
  - Protected in production by a `NODE_ENV` 404 gate.
- **Playwright design project**
  - Runs the real `/chat` shell.
  - Uses a WorkOS test-user cookie plus mocked backend responses.
  - Writes screenshots to `e2e/design-shots/`.
- Explicit rule: do **not** add an env-gated auth bypass to `proxy.ts`.
- Drill-down command: `npx playwright test --project=design`.

### `chat_page_review_fixes` + `live_testing`
These entries are paired: the first improves the production chat UI, and the second provides the safe way to validate that UI with real shell rendering or isolated component previews.

## Route/proxy integration

### `proxy_handling`
Documents the Next.js 16 proxy migration and WorkOS auth integration.

- `packages/web/src/proxy.ts` exports a named `proxy` function.
- It forwards requests to `authkitProxy` with `middlewareAuth: { enabled: true, unauthenticatedPaths: ['/auth/callback'] }`.
- Static assets and metadata paths are excluded from the proxy matcher.
- Migration highlights:
  - replaced `authkitMiddleware` with `authkitProxy`
  - removed `NextFetchEvent`
  - fixed the “adapterFn is not a function” error
- This proxy boundary supports the production-safe testing and auth behavior described above.

## Drill-down map

- **Production chat UI:** `chat_page_review_fixes`
- **Auth-bound transport:** `chat_page_transport`
- **Viewport scrolling:** `chat_page_scroll_stability`, `scroll_area_sidebar_stability`
- **Thread restoration and caching:** `chat_page_thread_cache`, `message_persistence_cache`
- **Message reconstruction:** `message_persistence_parsing`
- **Feedback pipeline:** `message_feedback`
- **Streaming/error behavior:** `chat_streaming_error_handling`
- **Testing without auth wall:** `live_testing`
- **Next.js proxy/Authkit boundary:** `proxy_handling`