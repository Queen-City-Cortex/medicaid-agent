---
children_hash: 727c696a9a4e6e31c9ff4981057fd6307fb6124998d615818ca3c13518d0f1d5
compression_ratio: 0.4979702300405954
condensation_order: 1
covers: [chat_sidebar_scroll_fix.md, context.md]
covers_token_total: 739
summary_level: d1
token_count: 368
type: summary
---
# Scroll Area Sidebar Stability

Captures the ChatPage scroll behavior changes that keep the fixed sidebar visible while the conversation `ScrollArea` updates. See **Chat Sidebar Scroll Fix** for the concrete implementation details and root-cause analysis.

## Core behavior
- The ChatPage uses a flex `h-screen` layout with a fixed-width sidebar and a `ScrollArea` for message history.
- Scroll handling moved from `messagesEndRef.scrollIntoView()` to direct viewport control via the nearest `data-slot="scroll-area-viewport"` element.
- The effect runs on `messages`, `streamTimeline`, and `streamText` from `useAgentStream`, then calls `viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" })`.

## Architectural decision
- The outer layout container changed from `overflow-hidden` to `overflow-clip`.
- This prevents sibling displacement when the conversation area scrolls, preserving sidebar visibility during streaming updates.

## Root cause and fix
- The sidebar was being pushed off-screen because `scrollIntoView` climbed to the overflow-hidden layout root.
- A measurement showed the sidebar at `getBoundingClientRect().top = -458px`, confirming the displacement.
- The fix keeps clipping consistent at the layout level and confines scrolling to the `ScrollArea` viewport.

## Drill-down reference
- **Chat Sidebar Scroll Fix** — implementation, DOM targeting strategy, and the sidebar visibility bug fix in `packages/web/src/app/chat/page.tsx`.