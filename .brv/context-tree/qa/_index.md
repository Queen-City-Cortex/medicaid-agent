---
children_hash: d76b4d6c9a42dea259e74753379f8a7f4cb4f1ecee00082d3c7dcfc35cb214a2
compression_ratio: 0.8464285714285714
condensation_order: 2
covers: [context.md, playwright_e2e/_index.md]
covers_token_total: 560
summary_level: d2
token_count: 474
type: summary
---
# QA Domain Structure (d2 summary)

## Context: `.brv/context-tree/qa/context.md`
- **Purpose**: Capture end-to-end Playwright testing patterns specifically for the Medicaid navigator agent UI.
- **Scope**:
  - Includes Playwright configs, Mastra streaming/memory helper utilities, chat/thread page objects, and guidance for running/extending e2e suites.
  - Excludes unit/integration work outside Playwright and backend service internals.
- **Ownership & Usage**: Maintained by QA/Automation; update whenever Playwright suites, helpers, or page abstractions evolve.

## Playwright e2e topic: `.brv/context-tree/qa/playwright_e2e/_index.md`
- **Coverage**:
  - `e2e/playwright.config.ts` centralizes configuration for two projects: mocked (`e2e/tests/mocked`) and smoke (`e2e/tests/smoke`).
  - Shared settings: reporters, retries, baseURL; mocked suite keeps short timeouts and desktop Chrome, smoke suite extends to 120s to hit live agent plus Neo4j; requires `npm run dev` from `packages/web` targeting `http://localhost:3000`.
- **Helpers (`e2e/helpers/`)**:
  - `stream-builder.ts` (`MastraStreamBuilder`): builds Mastra SSE frames (`data:` lines, timeline markers, final `data: [DONE]`) for streaming responses.
  - `mock-routes.ts` (`mockMastraAPI`): installs Playwright `page.route()` before visiting `/chat`, intercepting agent stream (`POST /api/agents/*/stream`), thread lifecycle (`GET/POST /api/memory/threads`), and thread messages (`GET /api/memory/threads/*/messages`).
  - `chat-page.ts`: page-object centralizing selectors/actions for navigation, message sending, awaiting assistant replies, assistant trace lookups, and thread sidebar operations to avoid duplication across suites.
- **Flow**: Playwright starts via config → helpers craft SSE/mocked endpoints → `ChatPage` drives interactions for both mocked and smoke scenarios, linking config, helpers, and page abstractions.