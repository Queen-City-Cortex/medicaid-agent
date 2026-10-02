---
children_hash: aef4bf55de291eade744d9c2f57e6841c37bc15160a3f27a55261489cec8e452
compression_ratio: 0.4693627450980392
condensation_order: 0
covers: [context.md, message_persistence_smoke_test.md]
covers_token_total: 816
summary_level: d0
token_count: 383
type: summary
---
## QA / Playwright E2E

### message_persistence_smoke_test
- **Purpose:** A Playwright smoke test that verifies chat message persistence when `savePerStep` is true, ensuring the final assistant answer, research trace metadata, and UI feedback controls survive a page reload.
- **Core flow:** `e2e/tests/smoke/message-persistence.spec.ts` drives the chat page by sending **“What is EPSDT?”**, waiting for streaming completion, recording answer length and research trace icons, reloading, reselecting the thread, and confirming the persisted answer plus UI state.
- **Key dependency:** The fix relies on `SaveQueueManager` flushing the final assistant message into **LibSQL** when `savePerStep: true`; the test also depends on `ChatPage` and the agent endpoint configured by `MASTRA_URL`.
- **Validation rules:**  
  - Wait for the **Rate helpful** button before checking message text length or traces.  
  - After reload, the answer must still mention **“epsdt”**, exceed **100 characters**, and show the same research trace labels.  
  - **MessageActions** must render again so feedback buttons remain visible.
- **What it guards against:** The regression where answer text was missing on reload when `savePerStep` was false, while also confirming observational memory preserves both assistant text and tool-call/research trace data.
- **Drill-down:** See `message_persistence_smoke_test.md` for the full test sequence, dependencies, and recorded facts; `context.md` captures the topic focus and parent relation to Playwright E2E.