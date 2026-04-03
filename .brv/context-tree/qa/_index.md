---
children_hash: 7d3be7812cf673355b85afdb61d8b58ead9420b8ea9502878e901c8a73241262
compression_ratio: 0.7698483496877788
condensation_order: 2
covers: [context.md, hallucination_verifier/_index.md, playwright_e2e/_index.md]
covers_token_total: 1121
summary_level: d2
token_count: 863
type: summary
---
# QA Domain Overview
Captures Playwright-focused end-to-end testing patterns for the Medicaid navigator agent UI, owned by the QA/Automation team. Includes Playwright suite configs, Mastra stream/memory helpers, page objects for chat/thread interactions, and guidance for running/extending e2e coverage. Excludes non-Playwright unit/integration tests and backend implementation.

## Playwright e2e (qa/playwright_e2e)
- **Configuration & Flow**: `e2e/playwright.config.ts` defines shared reporters/retries/baseURL, driving both the fast mocked suite (`e2e/tests/mocked`, 15 s timeouts, desktop Chrome) and the long-running smoke suite (`e2e/tests/smoke`, 120 s, exercises live agent + Neo4j). Both suites require the webserver (`npm run dev` from `../packages/web` to `http://localhost:3000`), with Playwright launching via the config and exercise flows orchestrated through helper layers.
- **Helpers Layer** (`e2e/helpers`):
  - `stream-builder.ts` (`MastraStreamBuilder`) emits Mastra-compliant SSE frames (prefixed `data:`, timeline tool markers, terminal `data: [DONE]`) to simulate streaming tool output.
  - `mock-routes.ts` (`mockMastraAPI`) routes Playwright `page.route()` before `/chat` visits, intercepting `POST /api/agents/*/stream` (custom SSE), `GET/POST /api/memory/threads`, and `GET /api/memory/threads/*/messages` to control agent/memory responses.
  - `chat-page.ts` provides selectors/actions for navigation, sending user messages, awaiting assistant replies, viewing assistant traces, and manipulating the thread sidebar, ensuring consistent interactions across suites.

## Hallucination Verifier Processor (qa/hallucination_verifier)
- **Purpose & Task**: Documents the `HallucinationVerifier` processor that intercepts final Medicaid navigator answers and runs a two-step verification—relevance to the original question, then factual accuracy against sourced policies—before optionally rewriting the assistant response.
- **Behavior & Flow**: `getConfig()` toggles the verifier with model/limit settings; `processOutputStep` triggers only on final assistant messages (`finishReason: stop`, no pending tools, non-empty text); extracts user question + cited tool sources; `buildSourceText` concatenates prioritized citations (cited first, uncited appended) and truncates at `maxSourceChars` with a notice; calls `verifyAnswer(question, text, sourceText)` using the extended schema; immediately applies `verification.correctedAnswer` via `writer.custom` when relevance issues, unsupported claims, or unsupported verification are detected.
- **Structure & Dependencies**: Defines verifier configuration, evidence-source interfaces, metadata formatters, SourceEntry builders for `getSection`, `getDocument`, `getAmendments`, `lookupPolicy`, and `followReferences`, plus the Zod schema extension and `HallucinationVerifier` implementation of `Processor.processOutputStep`. Depends on `generateObject` (ai), `createOpenAI` (@ai-sdk/openai), Zod validation, Mastra processors/memory types, and `writer.custom` to emit `data-verification-rewrite`.
- **Highlights & Rules**: Emphasizes the strict two-stage relevance + fact check, schema fields (`supported`, `relevant`, `unsupportedClaims`, `relevanceIssues`, `correctedAnswer`), char-limited prioritized source summaries, and policy of applying corrections immediately without retrying; verification only runs on final responses and halts further processing when unsupported or failing.