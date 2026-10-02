---
children_hash: 634ffb4c06f87b9f63b6304b839d15a530e82fc90e97c31230d90d9df1fe11e0
compression_ratio: 0.7719298245614035
condensation_order: 1
covers: [chat_page_scroll_stability.md, context.md]
covers_token_total: 342
summary_level: d1
token_count: 264
type: summary
---
# frontend_ui

## Scroll Stability

### `chat_page_scroll_stability.md`
- Documents an incremental refinement of chat page scrolling behavior during message streaming and thread switching.
- Core decision: keep using `viewport.scrollTo` for viewport-targeted scrolling rather than `scrollIntoView`, so the sidebar remains visible and the layout root does not overscroll.
- Layout hardening added `min-h-0` on the main `ScrollArea` container to allow flex children to shrink correctly.
- Focus management was tightened with `preventScroll: true` after input, new thread, and thread selection actions to stop focus-driven jumps.
- Important layout constraint: `overflow-clip` is not a substitute for `overflow-hidden` because it does not create a formatting context.

### `context.md`
- High-level topic summary for chat page scroll stability.
- Covers viewport-stable scrolling, focus suppression, and flex sizing adjustments in the chat page `ScrollArea`.
- Related drill-down: `frontend_ui/scroll_area_sidebar_stability` for sidebar-specific scroll fixes.