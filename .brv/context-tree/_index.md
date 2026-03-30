---
children_hash: 24820303551e2fd5b180cc2712c726077607ac7b40ff5a2ba638e76e78ab4d14
compression_ratio: 0.6856892010535558
condensation_order: 3
covers: [README.md, frontend_ui/_index.md, qa/_index.md]
covers_token_total: 1139
summary_level: d3
token_count: 781
type: summary
---
# Project Knowledge Structure (d3 overview)

## Domain: frontend_ui
- **Purpose**: Document frontend layout behavior for the NC Medicaid Navigator chat interface, focusing on ScrollArea and sidebar stability while keeping unrelated backend/design tokens out of scope (owner: Web Frontend Team).

### Topic: chat_page_scroll_stability
- **Objective**: Keep the ScrollArea column independently scrollable without disturbing the fixed sidebar.
- **Architecture**:
  - Render messages into ScrollArea, reference viewport via `[data-slot="scroll-area-viewport"]`, and call `viewport.scrollTo` instead of `scrollIntoView`.
  - Engage `mastraClient` thread lifecycle hooks, apply `preventScroll: true` on focus, add `min-h-0` to the flex container, and keep `overflow-hidden` for layout context.
- **Dependencies/Relations**:
  - Tightly coupled with `mastraClient` hooks, `ThreadSidebar`, and Tailwind utilities.
  - Detailed implementation captured in `chat_page_scroll_stability.md`.
  - Relates to sidebar stability work documented under `scroll_area_sidebar_stability/context.md`.

### Topic: scroll_area_sidebar_stability
- **Objective**: Ensure the chat sidebar remains visible despite ScrollArea viewport changes.
- **Flow & Fix**:
  - `TuneScrollArea` detects the viewport and scrolls to `scrollHeight` with smooth animation triggered from a `useEffect`.
  - Layout change uses `overflow-clip` on the chat flex container so viewport updates no longer shift the overflow-hidden ancestor (previously caused the sidebar to disappear at `top = -458px`).
- **Dependencies**:
  - Hooks into `useAgentStream` data (`messages`, `streamTimeline`, `streamText`) and DOM traversal from `messagesEndRef.closest`.
  - Prevents ancestor scroll by animating `viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" })`.

## Domain: qa
- **Purpose**: Capture end-to-end Playwright testing patterns for the Medicaid navigator agent UI, excluding non-Playwright/unit work.
- **Scope**: Includes Playwright configs, Mastra helpers, chat/thread page objects, and guidance for running or extending suites (owned by QA/Automation).

### Topic: playwright_e2e
- **Structure**:
  - `e2e/playwright.config.ts` defines two projects (mocked + smoke) sharing reporters, retries, baseURL; mocked suite uses short timeouts/desktop Chrome, smoke suite uses 120s to exercise live agent and Neo4j (requires `npm run dev` for `packages/web` at `http://localhost:3000`).
- **Helpers**:
  - `MastraStreamBuilder` (`stream-builder.ts`): crafts SSE-formatted channel data for streaming responses.
  - `mockMastraAPI` (`mock-routes.ts`): intercepts agent stream and memory/thread endpoints before visiting `/chat`.
  - `ChatPage` page object (`chat-page.ts`): centralizes selectors/actions (navigation, message send, awaiting replies, assistant trace lookups, and thread sidebar interactions) to keep suites DRY.
- **Flow**:
  - Playwright config drives suite selection → helpers supply SSE/mock behavior → `ChatPage` scripts simulate user interactions for both mocked and smoke scenarios, ensuring coverage of config, helper, and page abstractions.