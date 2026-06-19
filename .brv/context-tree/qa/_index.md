---
children_hash: b67a8915fa340a8a7f1f12d5fca20aa81b7a2610b0e4077a4b088cc27a3da2e7
compression_ratio: 0.21368190356919223
condensation_order: 2
covers: [context.md, end-to-end-citation-fidelity-is-enforced-from-retrieval-to-evaluation.md, end-to-end-trust-is-enforced-as-a-chain-not-a-single-check.md, end-to-end-trust-is-enforced-by-linking-evidence-verifier-behavior-and-final-sco.md, end-to-end-trust-is-enforced-by-linking-retrieval-evidence-verifier-rewrite-and-.md, evaluation_pipeline/_index.md, hallucination_verifier/_index.md, launch_blockers/_index.md, playwright_e2e/_index.md, qa-trust-is-enforced-as-a-chain-not-a-single-score.md, trustworthiness-is-enforced-from-retrieval-through-final-answer-evaluation.md]
covers_token_total: 6388
summary_level: d2
token_count: 1365
type: summary
---
# QA Structural Overview

The QA domain captures end-to-end testing, hallucination verification, and evaluation trust guarantees for the Medicaid navigator agent UI and policy-answer pipeline. The dominant pattern across the child entries is that **trust is enforced as a chain**: retrieve evidence, verify or rewrite unsupported output, then score or validate only grounded results.

## Core QA scope and ownership
- `context.md` defines the domain as **end-to-end testing patterns and helpers for the Medicaid navigator agent UI**.
- Ownership sits with the **QA/Automation Team**.
- Scope includes:
  - Playwright configuration for mocked and smoke suites
  - Helpers that mock Mastra streaming and memory APIs
  - Page objects for chat and thread-sidebar interactions
  - Guidance for running and extending E2E tests
- Excludes:
  - Unit/integration tests outside Playwright
  - Backend implementation details

## Playwright E2E infrastructure
See `playwright_e2e/_index.md` for the overall harness structure.
- `e2e/playwright.config.ts` splits execution into:
  - **Mocked tests**: fast path, 15s timeouts, desktop Chrome settings
  - **Smoke tests**: real integration path, 120s timeouts, slower agent/Neo4j interactions
- Helper layer:
  - `stream-builder.ts` / `MastraStreamBuilder` for Mastra-compliant SSE ending in `[DONE]`
  - `mock-routes.ts` / `mockMastraAPI` to intercept API calls before visiting `/chat`
  - `chat-page.ts` / `ChatPage` to centralize selectors and chat/thread actions
- Key dependency pattern:
  - `mockMastraAPI(page, {...})` is applied before `page.goto("/chat")`
  - It controls agent streaming and memory endpoints
- Requires:
  - `npm run dev` from `../packages/web`
  - `http://localhost:3000`
  - Mastra client SSE parsing
  - `data-testid` selectors in the UI

## Hallucination verifier pipeline
See `hallucination_verifier/_index.md` for the verification contract.
- Verification is **final-answer only**:
  - runs only when `finishReason` is `stop`
  - requires no pending tool calls
  - requires non-empty text
- Evidence gathering is **tool-scoped** and built from:
  - `getSection`
  - `getDocument`
  - `getAmendments`
  - `lookupPolicy`
  - `followReferences`
- `HallucinationVerifier` performs a two-step check:
  1. relevance to the intended policy/question
  2. factual accuracy against retrieved sources
- Failure handling is **rewrite-based**, not retry-based:
  - unsupported output is rewritten immediately via `correctedAnswer`
  - `writer.custom` emits `data-verification-rewrite`
- CLI contract:
  - stable stdout markers `---EVIDENCE---`, `---VERIFIER---`, `---ANSWER---`
  - telemetry field names must remain stable because the eval harness parses them

## Evaluation pipeline and cross-reference validation
See `evaluation_pipeline/_index.md` for the scoring and reference-resolution stack.
- The pipeline has two tightly linked layers:
  - **Level 3 answer scoring**
  - **Level 2 cross-reference resolution**
- Level 3 answer evaluation:
  - implemented in `packages/pipeline/src/pipeline/eval/levels/answer.py`
  - flow: golden entry → agent invocation → Neo4j evidence fetch → `judge_answer` scoring → aggregation
  - agent invocation is **HTTP-first** with **CLI fallback**
  - judge errors become `None` for metric fields so they do not skew aggregation
  - agent errors yield zero scores with preserved explanations
- Level 2 cross-reference evaluation:
  - implemented in `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`
  - validates Neo4j relationships such as:
    - `REFERENCES_DOCUMENT`
    - bidirectional `AMENDS`
    - section-level `REFERENCES` fallback
  - tracks `resolved_count`, `missed_count`, precision, and recall
- Shared dependencies:
  - running mastra dev HTTP service on `localhost:4111`
  - Neo4j for evidence and relationship validation
- June 11–12, 2026 remediation thread:
  - held-out dataset de-contamination
  - SSA ingestion rules
  - citation fidelity enforcement
  - paraphrase rebaseline metrics
  - staged P0–P3 remediation roadmap
- Remaining failures `q-004`, `q-009`, `q-020` are tied to **reference extraction**, not the scorer itself

## Cross-cutting trust model
The synthesis entries reinforce the same architecture across QA, evaluation, and agent policy:
- Trust is **not a single check**
- Correctness requires:
  1. retrieval of evidence
  2. verifier rejection or rewrite of unsupported claims
  3. final scoring only against grounded outputs
- Citation fidelity is treated as an **end-to-end contract**
  - from retrieval
  - through hallucination verification
  - into evaluation and cross-reference scoring
- Neo4j-backed evidence and amendment links are central to the trust chain
- Unsupported claims are either rewritten, rejected, or excluded from scoring rather than being allowed through

## Drill-down map
- `context.md` — QA domain scope, ownership, and e2e testing purpose
- `playwright_e2e/_index.md` — Playwright harness, mocked vs smoke suites, helpers, and chat page abstractions
- `hallucination_verifier/_index.md` — final-answer verification contract, evidence builders, CLI stdout rules
- `evaluation_pipeline/_index.md` — answer scoring, cross-reference validation, remediation thread, and metric behavior
- Synthesis entries like `end-to-end-citation-fidelity-is-enforced-from-retrieval-to-evaluation.md` and related trust summaries — shared end-to-end trust pattern across QA, evaluation, and agent architecture