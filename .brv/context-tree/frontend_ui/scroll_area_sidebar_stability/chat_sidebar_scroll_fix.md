---
title: Chat Sidebar Scroll Fix
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-03-29T22:31:16.662Z'
updatedAt: '2026-03-29T22:31:16.662Z'
---
## Raw Concept
**Task:**
Document the ChatPage sidebar scroll fix so manual viewport scrolling keeps the sidebar visible

**Changes:**
- Changed outer chat layout container overflow-hidden to overflow-clip
- Replaced messagesEndRef scrollIntoView with direct ScrollArea viewport.scrollTo targeting closest data-slot="scroll-area-viewport"

**Files:**
- packages/web/src/app/chat/page.tsx

**Flow:**
messages list or stream updates -> useEffect runs -> find ScrollArea viewport via closest data-slot="scroll-area-viewport" -> call viewport.scrollTo to reach scrollHeight smoothly

**Timestamp:** 2026-03-29

**Author:** Web Frontend Team

## Narrative
### Structure
ChatPage renders a flex h-screen layout with a fixed-width sidebar and ScrollArea for conversation history. The ScrollArea is wrapped in nested flex containers whose overflow controls determine whether sibling elements shift when new messages arrive.

### Dependencies
TuneScrollArea effect depends on messages, streamTimeline, and streamText states from useAgentStream; it queries the DOM via messagesEndRef.closest and requires the data-slot attribute on ScrollArea viewport to identify the correct scroll target.

### Highlights
Root cause was scrollIntoView walking up to the overflow:hidden layout root, while getBoundingClientRect().top of the sidebar read -458px, effectively hiding it. The fix now keeps the overflow clipping strategy consistent, uses viewport.scrollTo to animate to the bottom of the ScrollArea, and prevents sidebar displacement under streaming updates.

## Facts
- **sidebar_scroll_issue**: Sidebar disappeared because scrollIntoView walked up and scrolled the overflow:hidden layout root, pushing the sidebar off-screen [project]
- **overflow_clip_fix**: The fix switched the outer flex container overflow-hidden to overflow-clip so viewport scrolls do not shift the sidebar [project]
- **manual_scroll_viewport**: Messages effect now locates the nearest element with data-slot="scroll-area-viewport" and calls viewport.scrollTo instead of scrollIntoView [project]
- **sidebar_root_cause**: Root cause measurement was getBoundingClientRect().top equal to -458px for the sidebar [project]
- **viewport_scroll_behavior**: Scroll actions now target ScrollArea viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" }) to keep sidebar in view [project]
