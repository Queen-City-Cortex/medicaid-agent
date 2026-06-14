---
children_hash: f22e19a09a5d30c467b32fdabeb87e33775f42914ec9112d8a9656192d3aabff
compression_ratio: 0.2651970607882432
condensation_order: 2
covers: [context.md, end-to-end-citation-fidelity-is-enforced-from-retrieval-to-evaluation.md, end-to-end-trust-is-enforced-by-linking-evidence-verifier-behavior-and-final-sco.md, end-to-end-trust-is-enforced-by-linking-retrieval-evidence-verifier-rewrite-and-.md, evaluation_pipeline/_index.md, hallucination_verifier/_index.md, launch_blockers/_index.md, playwright_e2e/_index.md, qa-trust-is-enforced-as-a-chain-not-a-single-score.md, trustworthiness-is-enforced-from-retrieval-through-final-answer-evaluation.md]
covers_token_total: 5988
summary_level: d2
token_count: 1588
type: summary
---
# QA Domain Structural Summary

The **qa** domain captures the end-to-end Playwright testing stack for the Medicaid navigator agent UI, plus its role in the broader trust chain that spans retrieval, hallucination verification, and evaluation. The main theme across the child entries is that trustworthy answers are enforced structurally, not by a single check: evidence must be retrieved, verified/rewritten, and then scored against grounded outputs.

## Core QA/Test Infrastructure
- **`context.md`** defines the domain boundary:
  - Purpose: end-to-end testing patterns and helpers for the Medicaid navigator agent UI
  - Scope: Playwright mocked and smoke suites, Mastra streaming/memory test helpers, chat and thread-sidebar page objects, and guidance for extending e2e tests
  - Excludes backend implementation and non-Playwright tests
  - Owned by the **QA/Automation Team**

- **`playwright_e2e/_index.md`** describes the testing architecture:
  - `e2e/playwright.config.ts` splits execution into:
    - **Mocked** tests: fast path, ~15s timeouts, desktop Chrome
    - **Smoke** tests: live agent path, ~120s timeouts, real backend/Neo4j interactions
  - Shared helpers under `e2e/helpers/` include:
    - `stream-builder.ts` / `MastraStreamBuilder` for Mastra-compliant SSE responses ending in `[DONE]`
    - `mock-routes.ts` / `mockMastraAPI` for intercepting agent and memory endpoints before `/chat`
    - `chat-page.ts` / `ChatPage` for selectors, messaging, reply waits, traces, and thread sidebar actions
  - Depends on `npm run dev` from `../packages/web` and `http://localhost:3000`
  - Uses `data-testid` selectors and keeps streaming, thread lifecycle, and message retrieval behind helpers

## Hallucination Verification Pipeline
- **`hallucination_verifier/_index.md`** defines the verifier contract and its CLI integration:
  - Verification is **final-answer only**
  - Runs only when `finishReason === 'stop'`, no tool calls are pending, and text exists
  - Evidence gathering is **tool-scoped**
  - Failure handling is **rewrite-based**, not retry-based, via `correctedAnswer` and `writer.custom`
  - CLI output is machine-parsed and must keep stable stdout markers:
    - `---EVIDENCE---`
    - `---VERIFIER---`
    - `---ANSWER---`

- Important implementation facts from `hallucination_verifier_processor.md`:
  - Evidence builders are limited to:
    - `getSection`
    - `getDocument`
    - `getAmendments`
    - `lookupPolicy`
    - `followReferences`
  - `buildSourceText` prioritizes cited evidence before uncited material
  - `maxSourceChars` is derived from `VERIFIER_MAX_SOURCE_TOKENS` with a 30000 default, multiplied by 4
  - Verification schema tracks:
    - `supported`
    - `relevant`
    - `unsupportedClaims`
    - `relevanceIssues`
    - `correctedAnswer`

## Evaluation and Cross-Reference Fidelity
- **`evaluation_pipeline/_index.md`** shows the evaluation stack is split into two major layers:
  - **Level 3 answer scoring**
    - `evaluate_answers(entries)` in `packages/pipeline/src/pipeline/eval/levels/answer.py`
    - Flow: golden entry → agent invocation → Neo4j evidence fetch → `judge_answer` → aggregate metrics
    - HTTP-first, CLI fallback
    - Judge errors normalize score fields to `None` or `0` depending on failure type
  - **Level 2 cross-reference resolution**
    - `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`
    - Validates `REFERENCES_DOCUMENT`, bidirectional `AMENDS`, and section-level `REFERENCES`
    - Tracks resolved/missed counts plus derived precision/recall

- Shared evaluation dependencies:
  - Mastra dev HTTP service on `localhost:4111`
  - Fallback to `npx tsx src/index.ts`
  - Neo4j for evidence retrieval and relationship validation
  - Metadata includes difficulty, reasoning type, and primary hit

- Key evaluation risk:
  - Remaining golden dataset failures `q-004`, `q-009`, `q-020` are attributed to the **reference extraction pipeline**, not scorer logic

- The remediation thread in this entry also preserves major policy/rules:
  - Held-out dataset must remain de-contaminated
  - SSA ingestion cannot infer membership from numbering alone
  - Freestanding USC sections must never receive `SSA_TO_USC`
  - Trustworthiness and citation fidelity are enforced end-to-end through retrieval, citation checks, answer evaluation, and cross-reference evaluation

## Shared Trust / Citation Pattern Across QA
Several synthesis entries reinforce the same structural rule:

- **`end-to-end-citation-fidelity-is-enforced-from-retrieval-to-evaluation.md`**
  - Retrieval, verification, and scoring must preserve section-level evidence and amendment links
  - Links:
    - agent policy enforces tool-first lookup and citation duties
    - evaluation fetches Neo4j section evidence before scoring
    - qa verifier rewrites unsupported claims using retrieved sources

- **`end-to-end-trust-is-enforced-by-linking-evidence-verifier-behavior-and-final-sco.md`**
  - Trust depends on preserving evidence through retrieval, verifier behavior, and final scoring
  - Verification is final-answer only
  - Failure handling is rewrite-based

- **`end-to-end-trust-is-enforced-by-linking-retrieval-evidence-verifier-rewrite-and-.md`**
  - Same chain expressed as retrieval evidence → verifier rewrite → evaluation
  - Highlights that trust is cumulative, not a single guardrail

- **`qa-trust-is-enforced-as-a-chain-not-a-single-score.md`**
  - Concise statement of the domain-wide pattern:
    - retrieve correct evidence
    - verify or rewrite the answer
    - score only grounded outputs

- **`trustworthiness-is-enforced-from-retrieval-through-final-answer-evaluation.md`**
  - QA, evaluation, and launch blockers jointly harden the pipeline against unsupported claims
  - Emphasizes that correctness checks are cumulative

## Drill-Down Map
- **`context.md`** — domain scope and ownership for QA testing
- **`playwright_e2e/_index.md`** — Playwright architecture, helpers, and mocked vs smoke suite split
- **`hallucination_verifier/_index.md`** — verifier contract, evidence builders, stdout markers, rewrite behavior
- **`evaluation_pipeline/_index.md`** — answer scoring, cross-reference resolution, remediation, and dataset rules
- **Synthesis entries** — best entry point for understanding the trust chain that connects QA, evaluation, and retrieval fidelity