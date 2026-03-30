---
title: Chat Page Scroll Stability
tags: []
related: [frontend_ui/scroll_area_sidebar_stability/context.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-03-29T22:42:29.517Z'
updatedAt: '2026-03-29T22:42:29.517Z'
---
## Raw Concept
**Task:**
Stabilize the NC Medicaid Navigator chat page ScrollArea so the message viewport scrolls independently without nudging the sidebar.

**Changes:**
- Replaced scrollIntoView with viewport.scrollTo operating on the ScrollArea viewport wrapper.
- Added preventScroll: true to every focus call (initial render, new thread, thread selection, thread creation) so the overflow-hidden ancestor stays still.
- Assigned min-h-0 to the main ScrollArea container so flex column children can shrink below the default min-height:auto constraint and stay flush with the viewport.
- Avoided overflow-clip because it fails to create a formatting context, unlike overflow-hidden, which keeps ScrollArea sizing consistent.

**Files:**
- packages/web/src/app/chat/page.tsx

**Flow:**
Messages -> end ref -> locate [data-slot="scroll-area-viewport"] -> scrollTo -> maintain focus -> keep flex layout min-height low -> ensure overflow-hidden wrapper stationary

**Timestamp:** 2026-03-29

**Author:** Frontend UI Team

## Narrative
### Structure
The chat page pairs a shrink-0 sidebar with a ScrollArea-equipped message column inside a flex layout. Streaming and completed messages render inside the ScrollArea, so we now scroll by finding the viewport slot and calling scrollTo to avoid affecting the overflow-hidden layout root.

### Dependencies
Fixes rely on mastraClient thread lifecycle hooks and the existing ThreadSidebar interactions so that focus() is exercised after every load/creation cycle, and they depend on Tailwind utilities (min-h-0, overflow-hidden) that shape the layout.

### Highlights
Viewport scrolling stays within the ScrollArea so the sidebar never slips; focus({ preventScroll: true }) keeps input interactions from jumping the entire column; and overriding the default min-height allows the ScrollArea to collapse with its siblings while overflow-clip is rejected because it breaks formatting contexts.

## Facts
- **scroll_behavior**: Scrolling now targets the ScrollArea viewport via scrollTo on [data-slot="scroll-area-viewport"] rather than walking up with scrollIntoView. [project]
- **focus_behavior**: Every focus call passes preventScroll: true so the overflow-hidden layout root does not shift when the input or new threads gain focus. [convention]
- **layout_constraint**: The main ScrollArea wrapper adds min-h-0 which lets the flex column children shrink past the default min-height: auto constraint. [project]
- **overflow_behavior**: overflow-clip cannot replace overflow-hidden on ScrollArea because it does not create a formatting context, so it breaks the viewport sizing. [project]
