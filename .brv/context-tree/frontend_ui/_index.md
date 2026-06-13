---
children_hash: a30ad45a3f9349dd4f4151ff75e0f1a47cc8f4de889627068c36d46e19923172
compression_ratio: 0.2539367286139878
condensation_order: 2
covers: [chat_page_review_fixes/_index.md, chat_page_scroll_stability/_index.md, chat_page_thread_cache/_index.md, chat_page_transport/_index.md, chat_streaming_error_handling/_index.md, context.md, message_feedback/_index.md, message_persistence_cache/_index.md, message_persistence_parsing/_index.md, proxy_handling/_index.md, runtime-identity-drives-both-auth-transport-and-chat-state.md, scroll_area_sidebar_stability/_index.md, streaming-ui-memory-and-persistence-are-coupled-through-thread-identity.md, thread_sidebar/_index.md]
covers_token_total: 7049
summary_level: d2
token_count: 1790
type: summary
---
# frontend_ui

## Chat page structure and UI refinement
The chat experience is split across layout, accessibility, and interaction fixes. See **chat_page_review_fixes** for the main page decomposition and visual polish, and **chat_page_scroll_stability** plus **scroll_area_sidebar_stability** for scroll/layout behavior.

- The original `packages/web/src/app/chat/page.tsx` was decomposed into `EmptyState`, `MessageList`, and `ChatInput`.
- `ResearchTrace` centralizes policy-tool trace/status rendering with reasoning entries.
- Layout is a flex container with a collapsible `ThreadSidebar`, a main `ScrollArea`, and auth/loading handling at the top.
- UI refinements include softened sidebar styling, accessible thread buttons, confirmation-gated deletion, CSS `line-clamp` title truncation, Lucide icon replacement, and an auth loading skeleton.
- Shared styling comes from `globals.css`, with oklch palettes and scrollbar rules; the page aligns with NC Medicaid branding while supporting streaming and rerun flows.

## Scroll behavior and viewport stability
Scroll behavior was tightened to keep the sidebar visible and prevent layout jumps. See **chat_page_scroll_stability** and **scroll_area_sidebar_stability**.

- Scrolling uses viewport-targeted `scrollTo` on the `data-slot="scroll-area-viewport"` element rather than `scrollIntoView`.
- `min-h-0` was added to the main `ScrollArea` container so flex children can shrink correctly.
- Focus-driven jumps are suppressed with `preventScroll: true` after input, new-thread, and thread-selection actions.
- `overflow-clip` was found not to replace `overflow-hidden` because it does not create a formatting context.
- The sidebar displacement bug was traced to `scrollIntoView` climbing to the layout root; the fix confines scrolling to the conversation viewport.

## Thread identity, transport, and cache restoration
Chat state is coordinated by thread identity and auth-derived transport identity. See **chat_page_transport** and **chat_page_thread_cache**.

- `useChat` identity was expanded from `threadId` to `threadId:resourceId`.
- `resourceId` defaults to `anonymous` until auth resolves, forcing a fresh chat instance on anonymous-to-authenticated transitions.
- `DefaultChatTransport` is memoized on `threadId`, `resourceId`, and `getAccessToken`, ensuring auth changes recreate transport.
- The thread cache uses a `messageCache` map keyed by `threadId` to preserve conversations across remounts.
- On thread selection, cached messages are restored via a `pendingRestore` ref and applied in a `useEffect` after the new `useChat` instance mounts.
- This avoids writing restored messages into the stale instance that existed before `setThreadId` recreated the hook.
- Related pattern: per-thread cache bridges the gap while asynchronous persistence catches up, so UI and database stay aligned.

## Streaming, persistence, and message reconstruction
Persistent chat state depends on structured message parsing and replay-friendly stream behavior. See **chat_streaming_error_handling**, **message_persistence_parsing**, and **message_persistence_cache**.

- `AISdkStreamBuilder` replaces `MastraStreamBuilder` for deterministic SSE test payloads.
- `mockMastraAPI` centralizes Mastra chat and memory endpoint routing for success/error flows.
- ChatPage uses `useChat`, `useAuth`, `useAccessToken`, `useMastraClient`, `useIsMobile`, `generateUUID`, and `convertThreadMessageToUIMessage`.
- The UI enforces a 10k-character input limit, reuses user text for reruns, and shows a destructive error alert when `useChat` fails.
- Structured persisted messages are preferred via `MastraMessageContentV2` detection and `convertV4PartsToV5`; legacy text falls back to `extractText`.
- Tool invocation states are normalized for `ResearchTrace` compatibility, mapping `result` to `output-available` and other states to `input-available`.
- `extractText` preserves paragraph spacing by joining mixed segments with `\n\n`.
- The message cache also protects against a race caused by asynchronous `savePerStep` persistence, using a short-lived thread-keyed cache to avoid truncated reloads.

## Feedback, auth, and client coupling
Feedback and transport are both bound to runtime identity and auth state. See **message_feedback**, **proxy_handling**, and **chat_page_transport**.

- `FeedbackRepository` wraps `@libsql/client`, lazily creates the `feedback` table, and enforces `UNIQUE(message_id, resource_id)` with `up` / `down` validation.
- `packages/web/src/lib/feedback-client.ts` provides `submitFeedback`, `deleteFeedback`, and `getFeedbackByThread` using Bearer auth and `credentials: include`.
- The chat UI hydrates feedback into `feedbackMap` and uses optimistic updates with rollback.
- `registerApiRoute` paths must not begin with `/api/`, and `getResourceId` must resolve `user.userId` or `user.id`.
- Next.js 16 moved middleware responsibilities to `proxy.ts`; the proxy forwards `NextRequest` to `authkitProxy` with `middlewareAuth` enabled and exempts only `/auth/callback`.
- Static assets and metadata paths are excluded from the proxy matcher so only dynamic routes reach authentication handling.

## Thread sidebar resilience
The sidebar stays responsive while auth and Mastra memory initialize. See **thread_sidebar**.

- The sidebar renders `+ New`, a scrollable thread list, loading/error states, rename/delete flows, and a signed-in user footer with sign-out.
- Thread fetches are gated by `useMastraReady` and `useMastraClient`, then loaded via `listMemoryThreads` with an `AbortController`.
- Results are sorted by `updatedAt`, and dependent effects rerun on client, `currentThreadId`, or `refreshKey` changes.
- A `401` from `listMemoryThreads` is treated as non-fatal while `useMastraReady` is false; the sidebar retries once auth is ready.
- A new `mastraClient` is recreated when the access token changes, keeping fetch behavior aligned with auth state.
- The fixed agent ID for memory thread calls is `nc-medicaid-navigator`.

## Key drill-down entries
- **chat_page_review_fixes** — page decomposition, accessibility, visual refinements, and chat layout responsibilities.
- **chat_page_scroll_stability** — viewport-stable scrolling, focus suppression, and flex sizing.
- **scroll_area_sidebar_stability** — sidebar visibility bug and scroll confinement to the conversation viewport.
- **chat_page_thread_cache** — thread-keyed cache, pending restore timing, and stale-instance avoidance.
- **chat_page_transport** — auth-bound `useChat` identity and transport reinitialization.
- **chat_streaming_error_handling** — SSE stream model, deterministic mocks, and error-state behavior.
- **message_persistence_parsing** — structured Mastra message reconstruction and legacy fallback parsing.
- **message_persistence_cache** — race fix for asynchronous persistence and cache-first thread re-navigation.
- **message_feedback** — feedback persistence, API routing, client helpers, and chat UI integration.
- **proxy_handling** — Next.js 16 proxy migration and Authkit integration.
- **thread_sidebar** — fetch resilience during auth initialization and memory client refresh behavior.