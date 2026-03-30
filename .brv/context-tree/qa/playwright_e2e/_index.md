---
children_hash: 0428ad0d6511532bd66e5c0d7b44d642b6f2585477bef827654eedc588148161
compression_ratio: 0.3627342888643881
condensation_order: 1
covers: [context.md, medicaid_agent_playwright_e2e_infrastructure.md]
covers_token_total: 907
summary_level: d1
token_count: 329
type: summary
---
# Playwright e2e (domain: qa/playwright_e2e)
- **Coverage**: e2e/playwright.config.ts drives both mocked (e2e/tests/mocked) and smoke (e2e/tests/smoke) Playwright projects. Shared reporters/retries/baseURL sit in config, but mocked stays quick (15s timeouts, desktop Chrome), while smoke stretches to 120s to exercise the live agent + Neo4j stack. Webserver dependency: `npm run dev` from `../packages/web` targeting `http://localhost:3000`.

- **Helpers** (e2e/helpers/*):
  - `stream-builder.ts` (`MastraStreamBuilder`) composes Mastra-compliant SSE frames—`data:` prefixed, marks timeline tool events, and ends with `data: [DONE]`.
  - `mock-routes.ts` (`mockMastraAPI`) wires Playwright `page.route()` before visiting `/chat`, intercepting:
    - `POST /api/agents/*/stream` → custom SSE outputs,
    - `GET/POST /api/memory/threads` → thread lifecycle,
    - `GET /api/memory/threads/*/messages` → stored thread messages.
  - `chat-page.ts` exposes page-object selectors/actions for navigation, sending messages, waiting for assistant replies, assistant trace lookups, and thread sidebar interactions, preventing selector duplication across suites.

- **Flow**: config launches Playwright → helpers create SSE responses and mock API endpoints → ChatPage drives interactions within tests (both mocked and smoke).