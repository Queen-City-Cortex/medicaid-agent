---
children_hash: 003d410aa866845c2ae3e2ad320642f62cae2645b904b9771a2b96aa90b0ed85
compression_ratio: 0.5354659248956884
condensation_order: 1
covers: [chat_sidebar_scroll_fix.md, context.md]
covers_token_total: 719
summary_level: d1
token_count: 385
type: summary
---
## Scroll Area Sidebar Stability

- **Topic Overview (`context.md`)**
  - Captures adjustments ensuring the ChatPage sidebar stays visible despite ScrollArea updates.
  - Key concepts: intentional ScrollArea viewport control, replacing overflow-hidden with overflow-clip on parent flex containers, and calling `viewport.scrollTo` manually inside a `useEffect`.

- **Chat Sidebar Scroll Fix (`chat_sidebar_scroll_fix.md`)**
  - **Task & Flow:** Describes the fix workflow where the message list or stream update triggers `TuneScrollArea` to locate the nearest `data-slot="scroll-area-viewport"` element and smoothly scroll its viewport to `scrollHeight`.
  - **Structural Change:** The outer chat layout flex container now uses `overflow-clip` instead of `overflow-hidden`, stopping updates from shifting sibling elements like the sidebar.
  - **Dependency Details:** The effect relies on `messages`, `streamTimeline`, and `streamText` from `useAgentStream`, with DOM traversal via `messagesEndRef.closest`.
  - **Highlight & Facts:** ScrollIntoView previously propagated up to the overflow-hidden root (sidebar’s `getBoundingClientRect().top = -458px`, causing disappearance). The fix directly animates the ScrollArea viewport (`viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" })`), keeping the sidebar visible during streaming updates.

This topic documents the specific architectural decision to clip overflow and target the ScrollArea viewport directly, ensuring manual viewport scroll actions do not hide the sidebar.