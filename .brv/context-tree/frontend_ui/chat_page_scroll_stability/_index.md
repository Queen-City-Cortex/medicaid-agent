---
children_hash: e80d6a1d7f975b6596f543cc7b29ab87b6f83462db27eeda72591f45487084cf
compression_ratio: 0.4423963133640553
condensation_order: 1
covers: [chat_page_scroll_stability.md, context.md]
covers_token_total: 868
summary_level: d1
token_count: 384
type: summary
---
# Chat Page Scroll Stability Overview

- **Objective:** Ensure the NC Medicaid Navigator chat page ScrollArea scrolls independently without disturbing the fixed sidebar (see `chat_page_scroll_stability.md` for full details).
- **Key Flow:** Messages render into the ScrollArea → use `ScrollArea` viewport ref (`[data-slot="scroll-area-viewport"]`) → call `viewport.scrollTo` → run mastraClient thread lifecycle hooks → apply focus with `preventScroll: true` → maintain flex layout with `min-h-0` → keep `overflow-hidden` wrappers stable.
- **Structural Adjustments:** 
  - Replaced `scrollIntoView` with `scrollTo` on the viewport wrapper to limit scrolling to the message column.
  - Applied `preventScroll: true` on every focus event (initial render, new thread, thread selection, thread creation) so the overflow-hidden ancestor doesn’t shift.
  - Added `min-h-0` to the ScrollArea container allowing flex column children to shrink, and confirmed `overflow-clip` cannot safely replace `overflow-hidden` because it fails to create a formatting context.
- **Dependencies:** Relies on mastraClient thread lifecycle hooks, ThreadSidebar integrations, and Tailwind utilities (`min-h-0`, `overflow-hidden`) described in `context.md`.
- **Facts to Drill Down:** Refer to `chat_page_scroll_stability.md` for file-level changes (`packages/web/src/app/chat/page.tsx`), author attribution, and explicit behavior rules; the `context.md` entry links to the related sidebar stability topic `frontend_ui/scroll_area_sidebar_stability/context.md`.