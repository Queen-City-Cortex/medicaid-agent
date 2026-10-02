---
children_hash: f3ba9461b46fb63779dc41c53f90ecfc835ca595b9fca2e96a77b43743c71f93
compression_ratio: 0.3775
condensation_order: 1
covers: [context.md, medicaid_agent_playwright_e2e_infrastructure.md, message_persistence_smoke_test/_index.md]
covers_token_total: 1600
summary_level: d1
token_count: 604
type: summary
---
# QA / Playwright E2E

## Structural Overview
This topic covers the Playwright-based end-to-end testing infrastructure under `e2e/`, with a split between mocked and smoke test execution. The core layout combines a shared config, reusable helpers, and a chat page object so tests can drive the Medicaid navigator UI without duplicating selectors or directly touching production services.

## Shared Architecture
- **Playwright config**: `e2e/playwright.config.ts` defines two projects:
  - **Mocked** tests: fast path with **15s timeouts** and desktop Chrome device settings.
  - **Smoke** tests: real agent integration path with **120s timeouts** for slower agent + Neo4j interactions.
- **Helpers** under `e2e/helpers/` provide the test harness:
  - `stream-builder.ts` via **MastraStreamBuilder** for synthesizing Mastra-compliant SSE responses ending in `[DONE]`.
  - `mock-routes.ts` via **mockMastraAPI** to intercept API calls before visiting `/chat`.
  - `chat-page.ts` via **ChatPage** to encapsulate selectors and common chat actions.

## Key Relationships
- Tests start from `e2e/playwright.config.ts`, then use `MastraStreamBuilder` to craft streaming responses.
- `mockMastraAPI(page, { ... })` is applied before `page.goto("/chat")` to control:
  - `POST /api/agents/*/stream`
  - `GET/POST /api/memory/threads`
  - `GET /api/memory/threads/*/messages`
- `ChatPage` centralizes navigation, sending messages, waiting for assistant replies, assistant trace lookup, and thread sidebar interactions.

## Dependencies
- Requires `npm run dev` from `../packages/web` via Playwright’s `webServer`, serving at `http://localhost:3000`.
- Depends on the Mastra client SDK to parse SSE payloads.
- Relies on `data-testid` selectors exposed by the chat UI.

## Notable Patterns
- Mocked suites simulate production-like SSE frames, including tool timeline markers and finish statistics.
- Smoke suites exercise real agent behavior against the live backend.
- The infrastructure is designed to keep tests stable by isolating streaming, thread lifecycle, and message retrieval behind helpers.

## Drill-Down Entries
- `context.md` — topic overview, key concepts, and parent relation
- `medicaid_agent_playwright_e2e_infrastructure.md` — detailed architecture, flow, facts, and helper responsibilities
- `message_persistence_smoke_test/_index.md` — summary of the message persistence smoke test and its validation rules