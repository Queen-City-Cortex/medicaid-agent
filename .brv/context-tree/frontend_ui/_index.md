---
children_hash: 1ade79d1affcd070fecca8230407a9e69f596722d01bd0a7a98bae5dd540e903
compression_ratio: 0.4362033195020747
condensation_order: 2
covers: [chat_page_review_fixes/_index.md, chat_page_scroll_stability/_index.md, context.md, proxy_handling/_index.md, scroll_area_sidebar_stability/_index.md]
covers_token_total: 1928
summary_level: d2
token_count: 841
type: summary
---
### frontend_ui domain overview
- **Purpose**: Captures chat UI layout, scrolling, and sidebar behavior decisions for the NC Medicaid Navigator web experience.
- **Ownership**: Web Frontend Team.
- **Scope**: ScrollArea viewport control, overflow handling, chat layout updates, proxy middleware shifts tied to frontend behavior.

### chat_page_review_fixes
- **Focus**: Refines the Navigator chat page layout with collapsible `ThreadSidebar`, improved `ScrollArea` rendering, accessible actions, and policy-aware empty states.
- **Architecture & Flow**: `ScrollArea` now toggles between `MessageList` and a dedicated `EmptyState`; `ChatInput` orchestrates reruns and streaming while `ResearchTrace` surfaces policy tool status.
- **Key relationships**: Palette, border, scrollbar styles live in shared globals; mastra-related flows rely on `${MASTRA_URL}/chat` and `mastraClient` thread management; changes span `chat/page.tsx`, `ThreadSidebar.tsx`, `ResearchTrace.tsx`, `EmptyState.tsx`, and `globals.css`.
- **Highlights**: Button semantics with Lucide icons and alert dialogs for thread actions, CSS `line-clamp` title truncation, tighter empty-state padding/CTA styles, loading skeleton for authentication, and consistent emoji replacement.

### chat_page_scroll_stability
- **Problem addressed**: Isolate ScrollArea scrolling so the fixed sidebar remains in place.
- **Flow & solution**: Messages render into the ScrollArea, `viewport.scrollTo` on the ScrollArea viewport (`[data-slot="scroll-area-viewport"]`), mastraClient lifecycle hooks run, and focus calls use `preventScroll: true` to keep layout stable.
- **Structural rules**: ScrollArea container has `min-h-0`, overflow-heavy ancestors keep `overflow-hidden`, and manual viewport scrolling replaces `scrollIntoView`.
- **Dependencies**: Tied to mastraClient hooks, ThreadSidebar, and Tailwind utilities; see topic entry for file-level changes and rules.

### scroll_area_sidebar_stability
- **Objective**: Keep the sidebar visible even when ScrollArea updates occur.
- **Architecture & fix**: `TuneScrollArea` effect finds the ScrollArea viewport, animates `scrollTo({ top: scrollHeight, behavior: "smooth" })`, and the outer flex container now uses `overflow-clip` to stop layout shifts.
- **Relationships**: Relies on `messages`, `streamTimeline`, `streamText` from `useAgentStream`, DOM traversal via `messagesEndRef.closest`, and the manual viewport scroll action prevents ScrollArea updates from hiding the sidebar.

### proxy_handling
- **Purpose**: Migrate auth middleware to Next.js 16 `proxy.ts` pattern while continuing WorkOS Authkit usage.
- **Architecture**: `packages/web/src/proxy.ts` exports a named `proxy` function that forwards every `NextRequest` to `authkitProxy`, enabling middleware auth with `/auth/callback` in `unauthenticatedPaths`.
- **Matcher strategy**: Excludes `_next/static`, `_next/image`, `favicon.ico`, `sitemap.xml`, and `robots.txt`.
- **Migration highlights**: Switched from `authkitMiddleware` to `authkitProxy`, removed unused `NextFetchEvent` parameter to match single-argument signature, and the auth flow passes requests through `authkitProxy` with `middlewareAuth`.
- **Dependencies & linkage**: Depends on `@workos-inc/authkit-nextjs` and adheres to Next.js 16 proxy requirements; connects to scroll stability topics to ensure consistent page behavior.