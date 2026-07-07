---
children_hash: 4a1512723a023232f40bfaf8263d8c6e064d2e929579dd62300d2b537cf5708f
compression_ratio: 0.14466005252407355
condensation_order: 2
covers: [chat_page_review_fixes/_index.md, chat_page_scroll_stability/_index.md, chat_page_thread_cache/_index.md, chat_page_transport/_index.md, chat_streaming_error_handling/_index.md, context.md, design_system/_index.md, live_testing/_index.md, message_citations/_index.md, message_feedback/_index.md, message_persistence_cache/_index.md, message_persistence_parsing/_index.md, proxy_handling/_index.md, runtime-identity-and-live-state-must-stay-aligned-across-auth-chat-transport-and.md, runtime-identity-drives-both-auth-transport-and-chat-state.md, runtime-identity-is-the-coordination-boundary-for-auth-chat-transport-caching-an.md, runtime-identity-must-propagate-through-auth-chat-transport-and-memory.md, runtime-identity-must-stay-aligned-across-auth-chat-transport-and-memory.md, runtime-identity-must-stay-aligned-across-auth-chat-transport-and-thread-cache.md, scroll_area_sidebar_stability/_index.md, streaming-ui-memory-and-persistence-are-coupled-through-thread-identity.md, thread-identity-is-the-hidden-coupling-between-chat-state-cache-and-auth.md, thread_sidebar/_index.md]
covers_token_total: 13708
summary_level: d2
token_count: 1983
type: summary
---
# Frontend UI: Chat Stability, Persistence, and Testing

This cluster covers the chat page’s runtime behavior, persistence, and visual/testing infrastructure. The recurring theme is that **thread identity, auth state, and persisted UI state must stay aligned** so the chat experience remains stable across reloads, auth transitions, and streaming updates.

## 1) Chat page structure and review fixes
**Drill down:** `chat_page_review_fixes.md`

- `packages/web/src/app/chat/page.tsx` was refactored from a monolith into smaller pieces:
  - `EmptyState`
  - `MessageList`
  - `ChatInput`
  - `ResearchTrace`
- The layout centers on a flex container with:
  - collapsible `ThreadSidebar`
  - main `ScrollArea`
  - conditional `MessageList` vs `EmptyState`
- Chat transport still uses `useChat` + `DefaultChatTransport` targeting `${MASTRA_URL}/chat`, with `getAccessToken` and `mastraClient` thread management.
- UI polish includes softer sidebar styling, accessible actions, CSS `line-clamp` for titles, better empty-state spacing, auth loading skeletons, and corrected disclaimer opacity.

## 2) Live UI testing without the auth wall
**Drill down:** `live_ui_testing_without_workos_auth_wall.md`

- Two sanctioned dev/test paths:
  1. **`/preview`** dev-only component gallery under `packages/web/src/app/preview/`
  2. **Playwright `design` project** under `e2e/tests/design/`
- `/preview`:
  - renders real components against fixtures
  - no auth, no Mastra, no Neo4j
  - protected by production `404` gating
- Playwright design project:
  - uses a saved WorkOS cookie from `auth.setup.ts`
  - mocks backend routes with `mockMastraAPI`
  - runs against the real `/chat` shell
  - writes screenshots to `e2e/design-shots/`
- Rule: **do not add an env-gated auth bypass in `proxy.ts`**.

## 3) Scroll stability in chat
**Drill down:** `chat_page_scroll_stability.md`, `chat_sidebar_scroll_fix.md`

- Chat scrolling was hardened to keep the sidebar visible while message history updates.
- Core decision: keep using `viewport.scrollTo` on the `ScrollArea` viewport rather than `scrollIntoView`.
- Layout adjustments include:
  - `min-h-0` on the main `ScrollArea`
  - `preventScroll: true` on focus-related actions
  - `overflow-clip` at the layout root instead of `overflow-hidden`
- Important constraint: `overflow-clip` is not a substitute for `overflow-hidden` because it does not create a formatting context.

## 4) Auth-bound transport reinitialization
**Drill down:** `authenticated_chat_transport_reinitialization.md`

- Chat identity was expanded from `threadId` to `threadId:resourceId`.
- `resourceId` defaults to `anonymous` until auth loads.
- `DefaultChatTransport` is memoized on `threadId`, `resourceId`, and `getAccessToken`, so auth changes force a fresh transport and chat instance.
- This prevents anonymous-to-authenticated transitions from staying bound to stale memory resources.

## 5) Thread cache restoration and authenticated operations
**Drill down:** `chat_thread_cache_restoration.md`, `authenticated_thread_operations.md`, `thread_cache_restoration.md`, `thread_message_coalescing_fix.md`, `message_parts_and_thread_message_restoration.md`

- Thread state is cached per `threadId` and restored after `useChat` recreation.
- `pendingRestore` + `useEffect` rehydrate cached messages after remounts.
- `handleSelectThread` must avoid writing into stale `useChat` instances.
- Reload behavior preserves assistant answer parts, tool parts, and verification badges while dropping internal noise like `data-om-*`.
- Lower-level parsing responsibilities:
  - `message-parts.ts` owns tool/text detection, verification extraction, source extraction, citation normalization, and clipboard rendering.
  - `parse-message.ts` converts V4 tool-invocation parts to V5 dynamic-tool parts and coalesces assistant turns.
- `thread_message_coalescing_fix.md` narrows the merge rule so `step-start` parts are not merged into assistant turns.
- `thread_cache_restoration.md` also captures Mastra client upgrade effects:
  - `listMemoryThreads` sorting now uses `orderBy: { field, direction }`
  - timestamps are strings
  - rename/clone/export behaviors were adjusted
  - fresh-token-per-request handling became part of thread operations
- `authenticated_thread_operations.md` centralizes retry-on-401 behavior through `runWithFreshAuth(tokens, op)` and a stable runner API.

## 6) Message persistence, parsing, and citation behavior
**Drill down:** `message_persistence_parsing.md`, `quiet_citation_styling_in_messagelist.md`, `message_citation_resolution.md`

- Persisted Mastra thread messages are reconstructed into structured `UIMessage` payloads.
- `convertThreadMessageToUIMessage` detects `MastraMessageContentV2` and preserves structured parts during reload.
- Legacy fallback joins text with `\n\n` to preserve paragraph breaks.
- Citation styling in `MessageList` keeps mapped source links quiet and subtle, while unmapped links retain gold styling.
- Citation resolution now prefers:
  1. exact source-label match
  2. deepest same-policy dotted ancestor
  3. normalized URL fallback
- This keeps inline citations, Sources panel rows, and clipboard footnotes consistent.

## 7) Message feedback pipeline
**Drill down:** `message_feedback_flow.md`

- Feedback spans:
  - LibSQL-backed `FeedbackRepository`
  - `/feedback` API routes
  - `feedback-client.ts`
  - `MessageActions.tsx`
  - `packages/web/src/app/chat/page.tsx`
- UI updates are optimistic, then rollback on error.
- Down votes can capture optional “What went wrong?” comments.
- Important rules:
  - `registerApiRoute` paths must not begin with `"/api/"`
  - `getResourceId` must resolve `user.userId` or `user.id` from request context
  - comments are `null` for up ratings

## 8) Message citation resolution
**Drill down:** `message_citations/message_citation_resolution.md`

- `buildCitationResolver(sources)` in `packages/web/src/lib/message-parts.ts` is shared by markdown rendering and clipboard generation.
- The source alignment fix prevents policy PDFs with reused URLs from collapsing into the wrong source row.
- Source labels are disambiguated for numeric and non-numeric sections, and the resolver uses semantic matching before URL fallback.

## 9) Sidebar fetch resilience
**Drill down:** `thread_sidebar_fetch_resilience.md`

- `ThreadSidebar.tsx` and `use-mastra-client.ts` handle thread loading under auth and prop changes.
- Each fetch uses an `AbortController`.
- `401` responses are ignored while `useMastraReady` is false.
- `useMastraClient` recreates the client when the access token changes.
- Rule: abort previous `listMemoryThreads` requests whenever dependencies change.

## 10) Theme and proxy infrastructure
**Drill down:** `proxy_handling/context.md`, `next_js_16_proxy_authkit_migration.md`, `web_theme_persistence.md`, `design_system/document_of_record_design_language.md`

- Next.js 16 proxy migration uses `authkitProxy` in `packages/web/src/proxy.ts` with the new `NextRequest`-only signature.
- Auth routing stays gated to `/auth/callback`, while public asset routes remain excluded from proxying.
- Theme persistence is cookie-first:
  - first paint reads from cookie
  - WorkOS metadata is secondary for sync/backfill
- The design system uses a Document of Record editorial style with:
  - `Fraunces`, `Newsreader`, `IBM Plex Mono`
  - parchment/light and library-at-night/dark themes
  - paper-grain overlay
  - print-aware styling
- Testability is preserved by retaining `data-testid` attributes.

## Cross-cutting pattern
- **Runtime identity is the hidden coupling** across auth, transport, caching, and persistence.
- The stable rule across these entries is:
  - resolve live auth/resource context at runtime
  - key chat state by thread identity plus auth identity
  - recreate transport and restore cache on auth transitions
  - preserve structured message parts and verification metadata across reloads