---
children_hash: ab5c9f7a794e6d5e47f4e9441eae19b255e88498780aab23a6878f6e9ee00461
compression_ratio: 0.4069368131868132
condensation_order: 2
covers: [context.md, evaluation_pipeline/_index.md, hallucination_verifier/_index.md, launch_blockers/_index.md, playwright_e2e/_index.md]
covers_token_total: 2912
summary_level: d2
token_count: 1185
type: summary
---
# QA Domain Overview
- **Purpose & Scope**: QA domain documents Playwright-backed e2e strategies, Mastra stream/memory mocks, chat/thread page objects, and orchestrated test helpers for the Medicaid navigator UI (`qa/context.md`). Excludes non-Playwright unit/integration tests and backend service logic.

## Evaluation Pipeline (qa/evaluation_pipeline/_index.md)
- **Architecture**: Two-stage evaluation pipeline: Level 3 answer scoring (`answer_quality_*` files) feeds Level 2 cross-reference resolution (`cross_reference_resolution/_index.md`) to yield precision/recall/MRR/primary-hit metrics for the NC Medicaid golden dataset.
- **Key facts**:
  - Level 3 uses `packages/pipeline/src/pipeline/eval/levels/answer.py` hitting `ncMedicaidAgent` via HTTP or local `tsx` runner, sourcing evidence from Neo4j before `judge_answer`.
  - Judge errors now produce `None` scores and are excluded from aggregates; evidence enrichment concatenates section titles with content.
  - Level 2 (`cross_ref.py`) resolves entry `cross_references` via Neo4j `REFERENCES_DOCUMENT`, bidirectional `AMENDS`, and section-level `REFERENCES`, tracking resolved/missed counts; unresolved entries include q-004, q-009, q-020.
- **Relationship**: Cross-reference resolution runs after Level 3 scoring, sharing Neo4j helpers and evaluation code; aggregated metrics therefore combine answer quality with citation fidelity.

## Hallucination Verifier (qa/hallucination_verifier/_index.md)
- **Processor Flow**: The `HallucinationVerifier` intercepts the final assistant message (`processOutputStep`), builds a prioritized `sourceText` from evidence helpers (`getSection`, `getDocument`, `getAmendments`, `lookupPolicy`, `followReferences`, with `buildSourceText` handling truncation notices up to `maxSourceChars`), and calls `verifyAnswer`.
- **Behavioral rules**: Applies verification only on messages finishing normally; relevance issues, unsupported claims, or unsupported verification trigger immediate rewrites via `writer.custom`; failures return `VERIFICATION_UNAVAILABLE`.
- **Dependencies**: `generateObject`, `createOpenAI`, Zod schemas, Mastra processor/memory types, and `writer.custom`.

## Launch Blocker Fixes (qa/launch_blockers/_index.md)
- **Scope**: Mitigates blocker risks across proxy middleware, concept Cypher guards, hallucination verifier evidence handling, and search tests.
- **Decisions**:
  - `proxy.ts` exports a Next.js 16-compatible `proxy` that forwards both `NextFetchEvent` and `NextRequest` to `authkitProxy`.
  - `concepts.ts` whitelists `COVERS`, `DEFINES`, `RESTRICTS`, `GOVERNS`, `REFERENCES_CONCEPT`, adds null handling for section metadata, and enforces guarded Cypher execution.
  - Hallucination verifier helpers now impose character caps, maintain cited/uncited ordering with truncation notices, append disclaimers, and rewrite responses when evidence fails.
  - `search.test.ts` strengthens deduping, top-K limits, 500-character snippets, embedding failure behavior, numbered-concept filtering, and Voyage API error propagation.

## Playwright E2E (qa/playwright_e2e/_index.md)
- **Foundations (`context.md`)**:
  - Playwright config defines mocked and smoke suites with tailored timeouts/reporters, shared retries, and a web server running `npm run dev` from `../packages/web`.
  - Helpers include `MastraStreamBuilder` (SSE builders ending `[DONE]`), `mockMastraAPI` intercepting `/agents/*/stream`, `/memory/threads`, and `/memory/threads/*/messages`, and `ChatPage` page object covering chat navigation, messaging, assistant traces, and thread sidebar interactions.
  - Flow: config launches tests → builders synthesize stream frames → mock routes register intercepts → `ChatPage` executes UI flows.
  - Facts: Mocked suite uses 15s timeouts; smoke suite targets real agent/Neo4j with 120s timeouts.
- **Message Persistence Smoke Test (`message_persistence_smoke_test/_index.md`)**:
  - Purpose: Verify `savePerStep` persists assistant answers, research-trace metadata, and MessageActions across reloads using `ChatPage`.
  - Flow: Ask “What is EPSDT?”, wait for streaming and Rate helpful button, record persisted answer/metadata, reload, reopen thread, and assert LibSQL-stored content plus UI persistence.
  - Dependency/Architecture: Relies on `MASTRA_URL`, deterministic streaming helpers, and `SaveQueueManager` flushing final messages to LibSQL when `savePerStep=true`.
  - Rules: Delay assertions until Rate helpful is visible; post-reload answer must mention “epsdt”, exceed 100 characters, and show research-trace icons; MessageActions buttons must reappear.
  - For detailed assertions and persistence mechanics see `message_persistence_smoke_test.md`; for infrastructure context refer to `context.md`.