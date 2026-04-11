---
title: Message Persistence Smoke Test
tags: []
related: [qa/playwright_e2e/context.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-05T22:02:55.331Z'
updatedAt: '2026-04-05T22:02:55.331Z'
---
## Raw Concept
**Task:**
Document the Playwright smoke test that validates message persistence when savePerStep is true

**Changes:**
- Verified savePerStep true flushes the final answer text from SaveQueueManager into LibSQL on reload

**Files:**
- e2e/tests/smoke/message-persistence.spec.ts

**Flow:**
navigate chat page -> send "What is EPSDT?" -> wait for streaming completion (Rate helpful visible) -> note answer length -> capture research trace icons -> reload page -> select thread -> confirm reloaded answer length and topic mention -> verify research trace icons and Rate helpful button render from persisted memory

**Timestamp:** 2026-04-05

**Author:** QA Team

## Narrative
### Structure
Playwright smoke test exercises the ChatPage helper to send a focused question, waits for the streaming cycle to finish (Rate helpful button appears), then reloads and selects the same thread to confirm persistence of the formatted answer, research trace icons, and MessageActions.

### Dependencies
Requires ChatPage helper, the agent endpoint defined by MASTRA_URL, and the SaveQueueManager with savePerStep true so the final assistant message is flushed into LibSQL for later retrieval.

### Highlights
Ensures real streaming answers (length >100) and research-trace icons survive a reload, confirming observational memory includes both text and tool-call metadata; the fix prevented missing answer text on reload when savePerStep was false.

### Rules
Rule 1: Await the Rate helpful button before asserting message text length or traces.
Rule 2: After reload, the same research trace labels must be visible and the assistant answer must still contain "epsdt" and exceed 100 characters.
Rule 3: MessageActions must render again so the feedback buttons (Rate helpful) remain visible, proving persistence of the UI wiring.

## Facts
- **smoke_test_flow**: Smoke test sends a real question and waits for streaming completion before reloading and validating persistence [project]
- **save_queue_flush**: savePerStep must be true for SaveQueueManager to flush the final answer text to LibSQL [project]
- **answer_validation**: Reloaded answer text must exceed 100 characters and mention 'epsdt' [project]
- **research_trace_validation**: Research trace icons (Searching policies, Reading section, Looking up policy, Checking amendments, Finding concepts) must render during streaming and after reload [project]
- **feedback_buttons**: Feedback buttons are rendered via MessageActions when Rate helpful is visible [project]
