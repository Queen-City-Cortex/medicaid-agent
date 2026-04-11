---
children_hash: f1c7ac97108d7601029b4f50ecdffcde08425611cb2b25624aa0979f421cce13
compression_ratio: 0.18430525557955363
condensation_order: 2
covers: [chat_page_review_fixes/_index.md, chat_page_scroll_stability/_index.md, chat_page_thread_cache/_index.md, chat_page_transport/_index.md, chat_streaming_error_handling/_index.md, context.md, message_feedback/_index.md, message_persistence_cache/_index.md, message_persistence_parsing/_index.md, proxy_handling/_index.md, scroll_area_sidebar_stability/_index.md, thread_sidebar/_index.md]
covers_token_total: 5556
summary_level: d2
token_count: 1024
type: summary
---
# frontend_ui Structural Overview

## Domain Purpose & Scope
- **frontend_ui/context.md** defines this domain as housing chat layout behaviors, scroll handling, and sidebar stability; excludes backend streams and generic tokens. Ownership lies with the Web Frontend Team.

## Chat Page Layout & Interaction Stability
- **chat_page_review_fixes**: Splits chat into collapsible `ThreadSidebar`, `ScrollArea`, and `MessageList`/`EmptyState`; uses Lucide icons, CSS `line-clamp`, and new empty-state CTA styling for the NC Medicaid policy experience. `ChatInput` now handles rerun/streaming while `ResearchTrace` surfaces policy tool status, and globals (palette, scrollbar) plus `${MASTRA_URL}/chat` transport remain shared.
- **chat_page_scroll_stability** & **scroll_area_sidebar_stability**: Both replace `scrollIntoView` with viewport `scrollTo` on `[data-slot="scroll-area-viewport"]`, enforce `preventScroll: true`, and use `min-h-0`/`overflow-clip` flex containers so ScrollArea adjustments never hide the fixed sidebar. ScrollArea viewport control and layout framing now rely on Mastra thread lifecycle hooks plus Tailwind utilities.

## Chat Transport & Message Lifecycle
- **chat_page_transport**: `useChat`’s identity now includes both `threadId` and auth-derived `resourceId`, and `DefaultChatTransport` memoizes over `threadId`, `resourceId`, and `getAccessToken`, ensuring a fresh transport once auth resolves (anonymous fallback until access token arrives).
- **chat_streaming_error_handling**: Migrates to `AISdkStreamBuilder` for SSE (start → deltas → tool events → finish), mocks AISdk streams in Playwright, and ensures ChatPage error states block input during streaming while reruns/auto-thread creation respect 10k-char caps and default AGENT_ID `nc-medicaid-navigator`.
- **message_persistence_cache** & **chat_page_thread_cache** (plus restoration): Introduce per-`threadId` `messageCache` plus `pendingRestore` to rehydrate assistant replies once new `useChat` instances mount, avoiding stale writes during thread switches and guaranteeing quick navigation never shows truncated conversations.

## Message Parsing & Feedback Integration
- **message_persistence_parsing**: Converts `MastraMessageContentV2` (format 2) into UI messages via `convertV4PartsToV5`, emitting `dynamic-tool`/`step-start` segments with `output-available`/`input-available` states; falls back to `extractText` with `\n\n` separators so ResearchTrace metadata stays aligned with legacy payloads.
- **message_feedback**: Covers persistence (LibSQL `feedback` table with `feedbackMap`; paths registered without `/api/`), API routes with zod validation and `getResourceId`, feedback client helpers, and `MessageActions` component with optimistic updates/rollbacks and optional comment capture for downvotes; `ChatPage` merges GET feedback into UI state to keep buttons and persistence aligned.

## Thread Sidebar & Proxy Concerns
- **thread_sidebar**: Fetch resilience relies on `useMastraReady`/`useMastraClient`, aborting stale `listMemoryThreads`, ignoring 401s before auth readiness, and ensuring cancelation via `AbortController`; UI includes creation/rename/delete flows with contextual menus, and threads are listed with formatted timestamps, all anchored to agent ID `nc-medicaid-navigator`.
- **proxy_handling**: Migrates WorkOS Authkit middleware to Next.js 16 `proxy.ts` with named `proxy` export, forwarding requests through `authkitProxy` (authenticated except `/auth/callback`) while excluding `_next` assets and metadata files; removes deprecated middleware exports and resolves adapter errors by matching Next.js proxy signature.

## Relationships & Dependencies
- Chat layout fixes reference stability topics (`chat_page_scroll_stability` ↔ `scroll_area_sidebar_stability`); message persistence entries link to broader UI/message persistence topics and `chat_page_transport`.
- Feedback and parse flows depend on the same transports and thread lifecycle hooks described above, ensuring consistent UI state, persistence, and tool metadata across the NC Medicaid Navigator chat experience.