---
title: Medicaid Agent Playwright e2e Infrastructure
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-03-29T22:31:47.481Z'
updatedAt: '2026-03-29T22:31:47.481Z'
---
## Raw Concept
**Task:**
Document the end-to-end Playwright infrastructure that exercises the Medicaid navigator chat UI with mocked and smoke suites.

**Changes:**
- Playwright config defines mocked and smoke projects with separate timeouts and reporter settings.
- helpers/stream-builder.ts synthesizes Mastra-compliant SSE frames that end in [DONE].
- helpers/mock-routes.ts wires page.route() intercepts for streaming, thread, and message endpoints.
- helpers/chat-page.ts centralizes data-testid selectors and common chat interactions.

**Files:**
- e2e/playwright.config.ts
- e2e/helpers/stream-builder.ts
- e2e/helpers/mock-routes.ts
- e2e/helpers/chat-page.ts

**Flow:**
Start Playwright via e2e/playwright.config.ts -> Use MastraStreamBuilder to craft SSE responses -> mockMastraAPI routes each Mastra endpoint before visiting chat -> ChatPage page object drives interactions.

**Timestamp:** 2026-03-29

## Narrative
### Structure
Playwright runs from the e2e/ root with tests in tests/mocked and tests/smoke. The configuration sets shared reporters, retries, and baseURL, while the mocked project stays fast with 15s timeouts and the smoke project allows 120s for real agent+Neo4j interactions. Helpers under e2e/helpers provide the stream builder, mock API routes, and chat page object so tests avoid touching production services directly.

### Dependencies
Tests rely on npm run dev in ../packages/web providing the frontend, the Mastra client SDK parsing SSE payloads, and Playwright using data-testid selectors exposed by the chat UI.

### Highlights
MastraStreamBuilder frames mimic production SSE events with tool timeline markers and finish statistics. mockMastraAPI intercepts POST /api/agents/*/stream to return builder-generated bodies, handles GET/POST /api/memory/threads for thread lifecycle, and returns stored messages from GET /api/memory/threads/*/messages. ChatPage exposes helpers for navigation, message sending, assistant trace lookup, and thread sidebar interactions, reducing selector duplication.

### Examples
Use mockMastraAPI(page, { streamResponse: customBuilder, threads: [...], threadMessages: [...] }) before page.goto("/chat") to control SSE outputs. ChatPage.sendMessage("Ask a question") pairs with waitForAssistantMessage() to assert assistant replies.

## Facts
- **mocked_project**: The mocked Playwright project under e2e/tests/mocked uses a 15s timeout and desktop Chrome device [project]
- **smoke_project**: The smoke Playwright project runs real agent integration tests under e2e/tests/smoke with a 120s timeout [project]
- **webserver**: Playwright's webServer launches npm run dev from ../packages/web targeting http://localhost:3000 [environment]
- **stream_builder**: MastraStreamBuilder emits SSE frames prefixed with data: and ended by data: [DONE] [project]
- **mock_routes**: mockMastraAPI intercepts /api/agents/*/stream, /api/memory/threads, and /api/memory/threads/*/messages before navigating to /chat [project]
