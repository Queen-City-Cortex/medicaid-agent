---
children_hash: fe0af40a0d67142d2cb46a94f22f90fcfef2606b5d044e4a6886f5de143b8acf
compression_ratio: 0.49614643545279385
condensation_order: 2
covers: [chat_page_scroll_stability/_index.md, context.md, scroll_area_sidebar_stability/_index.md]
covers_token_total: 1038
summary_level: d2
token_count: 515
type: summary
---
### frontend_ui (domain context)
- Purpose: document frontend layout behaviors, specifically scroll handling and sidebar stability for the NC Medicaid Navigator chat interface.
- Scope: ScrollArea/viewport scrolling, layout overflow interactions affecting chat/sidebar layout; excludes backend agents or unrelated design tokens.
- Ownership: Web Frontend Team.

### chat_page_scroll_stability (topic)
- Objective: keep the ScrollArea column scrolling independently while preserving the fixed sidebar.
- Key architectural steps: render messages into ScrollArea → use `[data-slot="scroll-area-viewport"]` ref → invoke `viewport.scrollTo` (replacing `scrollIntoView`) → engage mastraClient thread lifecycle hooks → apply `preventScroll: true` on all focus events to prevent ancestor shift → add `min-h-0` to the flex container and preserve `overflow-hidden` for formatting context.
- Dependencies: mastraClient thread hooks, ThreadSidebar integration, and Tailwind layout utilities; detailed file-level actions documented in `chat_page_scroll_stability.md`, with relations to the sidebar stability topic (`frontend_ui/scroll_area_sidebar_stability/context.md`).

### scroll_area_sidebar_stability (topic)
- Context: ensures the chat sidebar remains visible despite ScrollArea changes by controlling viewport behavior and layout overflow.
- Chat Sidebar Scroll Fix:
  - Flow: on message/stream updates, `TuneScrollArea` locates the ScrollArea viewport and scrolls to `scrollHeight` smoothly.
  - Structural change: chat layout flex container now uses `overflow-clip` so ScrollArea updates no longer shift the sidebar; viewport scrolls are triggered manually within a `useEffect`.
  - Dependencies: `messages`, `streamTimeline`, and `streamText` from `useAgentStream`, with DOM traversal via `messagesEndRef.closest`.
  - Highlight: avoids previous `scrollIntoView` behavior that moved the overflow-hidden ancestor (sidebar disappeared at `top = -458px`) by animating the viewport directly (`viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" })`).