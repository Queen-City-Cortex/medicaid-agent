# Topic: chat_page_scroll_stability

## Overview
Captures how the chat page ScrollArea keeps the viewport stable while streaming messages and switching threads, including layout overrides and focus handling.

## Key Concepts
- ScrollArea viewport-targeted scrolling to avoid overscrolling the overflow-hidden layout root
- preventScroll focus calls after input, new thread, and thread selection actions
- Flex column min-height overrides so ScrollArea children can shrink as needed

## Related Topics
- frontend_ui/scroll_area_sidebar_stability - Sidebar ScrollArea stability and scroll fixes
