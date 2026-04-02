---
children_hash: 5b234ab9a2ef45456a3c158a70209879225cfdc1a3d28928cbf23c4a9f0ad9d1
compression_ratio: 0.48641304347826086
condensation_order: 2
covers: [chat_page_scroll_stability/_index.md, context.md, proxy_handling/_index.md, scroll_area_sidebar_stability/_index.md]
covers_token_total: 1472
summary_level: d2
token_count: 716
type: summary
---
# Frontend UI Layout Knowledge (domain: `frontend_ui`)

## Purpose & Scope (context.md)
- Captures layout-level behavior notes for the NC Medicaid Navigator web UI.
- Focus: ScrollArea/viewport scroll mechanics, layout overflow rules, and chat UI adjustments affecting scrolling or sidebar stability.
- Owned by the Web Frontend Team; excludes backend APIs, agent stream logic, and generic design tokens.

## Scroll Behavior Topics
- **`chat_page_scroll_stability`**
  - Objective: keep the ScrollArea scroll operations limited to the message column so the fixed sidebar remains in view.
  - Flow: messages render → locate `[data-slot="scroll-area-viewport"]` → call `viewport.scrollTo` → fire mastraClient thread hooks → apply `preventScroll: true` focus events → maintain flex layout (`min-h-0`, `overflow-hidden` wrappers).
  - Structural decisions include replacing `scrollIntoView` with viewport `scrollTo`, ensuring `preventScroll: true` on all focus changes, and allowing ScrollArea to shrink via `min-h-0`; cannot swap `overflow-hidden` for `overflow-clip` because it fails to create a formatting context.
  - See `chat_page_scroll_stability.md` for file-level changes (`packages/web/src/app/chat/page.tsx`), authorship, and specific behavioral rules.

- **`scroll_area_sidebar_stability`**
  - Documents how ScrollArea updates can hide the sidebar and the fixes to prevent that.
  - Strategy: use `TuneScrollArea` to find the viewport element and animate `viewport.scrollTo({ top: scrollHeight, behavior: "smooth" })`, so scroll actions don’t propagate to overflow-clipped ancestors.
  - Outer chat flex container now uses `overflow-clip` (not `overflow-hidden`), and effects depend on `messages`, `streamTimeline`, `streamText`, and DOM traversal (`messagesEndRef.closest`).
  - Highlights the sidebar disappearance caused by upward-propagating `scrollIntoView` and confirms the manual viewport scrolling decision preserves visibility.

## Proxy Handling Topic
- **`proxy_handling`**
  - Documents migrating Next.js middleware to the Next.js 16 `proxy.ts` naming and integrating WorkOS Authkit.
  - Architecture: `packages/web/src/proxy.ts` exports `proxy`, which forwards every `NextRequest` to `authkitProxy` with `middlewareAuth` enabled and only `/auth/callback` unauthenticated.
  - Matcher excludes `_next/static`, `_next/image`, and metadata paths so only dynamic routes trigger the proxy.
  - Migration highlights:
    - Replaced deprecated `authkitMiddleware` with `authkitProxy`.
    - Adjusted signature to the single-argument proxy (dropped `NextFetchEvent`) to resolve adapter errors.
    - Flow: request → `authkitProxy` (with auth config) → downstream routing.
  - Depends on `@workos-inc/authkit-nextjs` and Next.js 16 requirement for proxy entry points.
  - Related to `chat_page_scroll_stability` for page-specific behavior implications.