---
children_hash: 5e56bb639cb335fbc1a6599ac4ea816916b1bbf5aab2b100e11f90639f85595d
compression_ratio: 0.510593220338983
condensation_order: 1
covers: [context.md, medicaid_agent_playwright_e2e_infrastructure.md, message_persistence_smoke_test/_index.md]
covers_token_total: 1416
summary_level: d1
token_count: 723
type: summary
---
### qa/playwright_e2e (level d1 structural summary)

#### Playwright e2e foundations (`context.md`)
- **Scope**: Captures the e2e/ Playwright infrastructure that powers both mocked (`tests/mocked`) and smoke (`tests/smoke`) suites, emphasizing shared config, timeout tuning, and reusable helpers.
- **Key components**:
  - `e2e/playwright.config.ts`: defines two projects with tailored timeouts/reporters, shared reporters/retries, baseURL, and a webServer that runs `npm run dev` from `../packages/web`.
  - Helpers under `e2e/helpers`:
    - `stream-builder.ts`: `MastraStreamBuilder` synthesizes Mastra-compliant SSE frames ending in `data: [DONE]` with tool timeline markers.
    - `mock-routes.ts`: `mockMastraAPI` intercepts `/api/agents/*/stream`, `/api/memory/threads`, and `/api/memory/threads/*/messages` to inject builder responses before navigating to `/chat`.
    - `chat-page.ts`: `ChatPage` page object centralizes selectors/actions (navigation, message sending, assistant trace checks, thread sidebar) so tests stay UI-focused without touching production services.
- **Flow**: Playwright config launches tests → builders craft SSE responses → mock routes register API intercepts → ChatPage drives interactions after `page.goto("/chat")`.
- **Facts**: Mocked project uses 15s timeouts; smoke project runs real agent/Neo4j with 120s timeouts; stream builder uses `data:` prefixed frames terminating with `[DONE]`; mock routes cover streaming, thread, and message endpoints.

#### Playwright message persistence smoke test (`message_persistence_smoke_test/_index.md` at d0 covers d1 context)
- **Purpose**: Validates `savePerStep` keeps long-form assistant answers, research-trace metadata, and MessageActions controls persistent across reloads.
- **Flow**: Use `ChatPage` helper to ask “What is EPSDT?”, wait for streaming completion (Rate helpful button), record answer/research-trace/feedback state, reload the page, reopen the thread, and assert LibSQL-persisted content and UI re-render.
- **Architectural decisions/dependencies**:
  - Depends on the `MASTRA_URL` endpoint plus ChatPage helpers for deterministic streaming.
  - `SaveQueueManager` must flush final assistant message into LibSQL when `savePerStep=true`.
  - Smoke test asserts observational memory saves answer text (>100 chars, mentions “epsdt”) and research-trace icons before/after reload.
- **Rules preserved from narrative**:
  1. Delay assertions until Rate helpful is visible.
  2. Post-reload answer must still mention “epsdt”, exceed 100 characters, and display research-trace badges.
  3. MessageActions feedback buttons (MessageActions) must reappear, confirming UI persistence.
- **Drill-down pointers**: For detailed verification steps, validation assertions, and persistence mechanics, see `message_persistence_smoke_test.md`; for overall Playwright infrastructure context, refer to `context.md`.