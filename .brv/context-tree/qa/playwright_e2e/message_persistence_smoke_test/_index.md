---
children_hash: aafa3262e092a636bc0fcd1dd34fb52c8109e50206477c420634530816f77464
compression_ratio: 0.5657216494845361
condensation_order: 0
covers: [context.md, message_persistence_smoke_test.md]
covers_token_total: 776
summary_level: d0
token_count: 439
type: summary
---
### Level d0 Structural Summary: qa/playwright_e2e/message_persistence_smoke_test

- **Scope & Purpose**: Documents a targeted Playwright smoke test (“message_persistence_smoke_test.md” and accompanying `context.md`) under `qa/playwright_e2e` that proves the `savePerStep` fix keeps long-form answer text, research-trace metadata, and UI feedback controls after a page reload.

- **Key Flow**: Test exercises the ChatPage helper to ask “What is EPSDT?”, waits for streaming completion (Rate helpful button), records answer length/research trace icons, reloads the page, reopens the thread, and verifies persisted answer content, research-trace icons, and MessageActions (feedback buttons) render from LibSQL via SaveQueueManager with `savePerStep=true`.

- **Architectural Decisions & Dependencies**:
  - Relies on `MASTRA_URL` agent endpoint and the ChatPage helper for reliable streaming.
  - SaveQueueManager must flush the final assistant message into LibSQL when `savePerStep` is true to ensure persistence.
  - Observational memory must capture both answer text (>100 characters, includes “epsdt”) and research-trace tool metadata before and after reload.

- **Validation Rules (from narrative)**:
  1. Delay assertions until the Rate helpful button appears.
  2. Post-reload answer must still reference “epsdt” and exceed 100 characters; research trace labels must remain visible.
  3. MessageActions must re-render so feedback buttons are available, confirming UI persistence.

- **Facts to Drill Down**: See `message_persistence_smoke_test.md` for explicit facts about the smoke test flow, saveQueue behavior, answer/research-trace validation, and MessageActions persistence; `context.md` situates the entry within the broader Playwright E2E topic.