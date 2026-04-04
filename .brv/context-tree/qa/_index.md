---
children_hash: 77596256abbbfd98d4323ed5538d8d217d62707e28ea1b1fe553151323048b03
compression_ratio: 0.46150777822098127
condensation_order: 2
covers: [context.md, evaluation_pipeline/_index.md, hallucination_verifier/_index.md, launch_blockers/_index.md, playwright_e2e/_index.md]
covers_token_total: 2507
summary_level: d2
token_count: 1157
type: summary
---
# QA Domain Structural Summary

- **Purpose & Scope (`context.md`)**
  - Governs Playwright-driven end-to-end coverage for the Medicaid navigator agent UI, owned by the QA/Automation Team.
  - Includes Playwright configs, Mastra streaming/memory mocking helpers, chat/thread page objects, and guidance for running/extending smoke and mocked suites.
  - Excludes non-Playwright unit or integration tests and backend implementation details, ensuring focus stays on UI harness behavior.

- **Evaluation Pipeline (`evaluation_pipeline/_index.md`)**
  - Orchestrates Level 3 answer quality scoring (`answer_quality/_index.md`, `answer_quality_and_cross_reference_evaluation.md`) feeding into Level 2 cross-reference resolution (`cross_reference_resolution/_index.md`) to produce final QA metrics for the golden dataset.
  - Level 3 runs `packages/pipeline/src/pipeline/eval/levels/answer.py`, invoking ncMedicaidAgent via HTTP (or `npx tsx` fallback), enriching Neo4j evidence sections, and applying `judge_answer` with special handling that nulls numeric scores on judge errors and excludes them from aggregates.
  - Level 2 resolves `cross_references` via Neo4j MATCH queries across `REFERENCES_DOCUMENT`, bidirectional `AMENDS`, and section-level `REFERENCES` chains, tracking resolved/missed counts; highlights recoveries and remaining extraction gaps (`q-004`, `q-009`, `q-020`).
  - Shared dependencies include Mastra dev HTTP server on `localhost:4111`, Neo4j sessions, and the same eval module root, aligning metrics with citation fidelity.

- **Hallucination Verifier (`hallucination_verifier/_index.md`)**
  - Documents `HallucinationVerifier` processor that intercepts final assistant outputs, executing a two-step relevance-plus-factuality check before optionally rewriting the response.
  - Flow: `getConfig()` toggles model/limit, `processOutputStep` triggers only on terminal assistant messages with no pending tool calls, extracts question/source text, builds prioritized source summaries (`buildSourceText`), validates via `verifyAnswer`, and applies `writer.custom` when verification flags unsupported claims or relevance issues.
  - Structural components include evidence-source builders (`getSection`, `getDocument`, `getAmendments`, `lookupPolicy`, `followReferences`), Zod schema extensions capturing fields such as `supported`, `relevant`, `unsupportedClaims`, and the `HallucinationVerifier` implementation interfacing with Mastra processor hooks.
  - Dependencies span `generateObject`, OpenAI client, Zod, Mastra core processors/memory types, and `writer.custom` for emitting `data-verification-rewrite`. Corrections are applied immediately, with truncated source text honoring `maxSourceChars` and failure flagged as `VERIFICATION_UNAVAILABLE`.

- **Launch Blockers (`launch_blockers/_index.md`)**
  - Captures fixes addressing proxy middleware exports, Cypher guards, hallucination verifier enhancements, and search test robustness ahead of launch.
  - Proxy middleware (`proxy.ts`) now exposes `proxy` consistent with Next.js 16 expectations, passing both `NextFetchEvent` and `NextRequest` into `authkitProxy`.
  - Concept handling (`concepts.ts`) enforces relationship whitelists (`COVERS`, `DEFINES`, `RESTRICTS`, `GOVERNS`, `REFERENCES_CONCEPT`) and null-safe section metadata before executing Cypher.
  - Hallucination verifier helpers now cap character counts, enforce cited/uncited ordering with truncation notices, return `VERIFICATION_UNAVAILABLE` upon failure, append disclaimers, and rewrite assistant text when verification cannot succeed.
  - Search tests (`search.test.ts`) mock deduplication, top-K limits, 500-character snippet truncation, embedding failures, numbered concept filtering, and propagate Voyage API errors to harden coverage.

- **Playwright E2E (`playwright_e2e/_index.md`)**
  - Playwright config manages two suites: mocked (short timeouts, desktop Chrome) and smoke (120-second timeouts exercising live agent + Neo4j), both relying on `npm run dev` for `http://localhost:3000`.
  - Helpers under `e2e/helpers/`:
    - `stream-builder.ts` (`MastraStreamBuilder`) constructs Mastra SSE frames (`data:` lines, timeline tool markers, final `[DONE]`).
    - `mock-routes.ts` (`mockMastraAPI`) intercepts agent/memory streaming and thread endpoints via Playwright `page.route()`.
    - `chat-page.ts` centralizes selectors/actions for navigation, messaging, assistant tracing, and thread sidebar interactions to avoid duplication.
  - Execution flow: Playwright launches per config, helpers stub SSE responses and API calls, and chat page objects drive mock/smoke interactions.