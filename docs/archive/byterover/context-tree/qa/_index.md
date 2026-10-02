---
children_hash: 3e6dfa5dbdea841d84ce5164b7f8bbe9231f1c424294a71ae6d2ddf68bf372d4
compression_ratio: 0.16241528034504005
condensation_order: 2
covers: [context.md, end-to-end-citation-fidelity-is-enforced-from-retrieval-to-evaluation.md, end-to-end-trust-is-enforced-as-a-chain-not-a-single-check.md, end-to-end-trust-is-enforced-by-linking-evidence-verifier-behavior-and-final-sco.md, end-to-end-trust-is-enforced-by-linking-retrieval-evidence-verifier-rewrite-and-.md, evaluation_pipeline/_index.md, hallucination_verifier/_index.md, launch_blockers/_index.md, playwright_e2e/_index.md, qa-trust-is-enforced-as-a-chain-not-a-single-score.md, schema-aware-validation-is-the-shared-safety-net-from-graph-writes-to-qa.md, trust-is-enforced-as-an-end-to-end-chain-not-a-single-check.md, trust-is-enforced-as-an-end-to-end-chain-not-a-single-score.md, trust-is-enforced-as-an-end-to-end-evidence-chain-not-a-single-score.md, trustworthiness-is-enforced-from-retrieval-through-final-answer-evaluation.md]
covers_token_total: 8115
summary_level: d2
token_count: 1318
type: summary
---
# QA Domain Structural Summary

The **qa** domain captures end-to-end testing and trust-verification patterns for the Medicaid navigator agent UI and policy-answer pipeline. It spans two tightly related areas: **Playwright E2E infrastructure** and **hallucination/citation verification**, with multiple synthesis entries showing that answer trust is enforced as a chain from retrieval through evaluation rather than by a single check.

## Core domain scope
- Owned by the **QA/Automation Team**.
- Focuses on:
  - Playwright configuration, helpers, and page objects for UI tests.
  - Final-answer verification, evidence gathering, and rewrite behavior.
  - Evaluation flows that score grounded answers and cross-reference coverage.
- Explicitly excludes unit/integration tests outside Playwright and backend implementation details.

## Major structural areas

### 1) Playwright E2E infrastructure
See **`playwright_e2e/_index.md`** and drill down into:
- `context.md`
- `medicaid_agent_playwright_e2e_infrastructure.md`
- `message_persistence_smoke_test/_index.md`

Key points:
- The E2E stack is split into **mocked** and **smoke** suites.
- `e2e/playwright.config.ts` defines:
  - **Mocked** project: fast path, **15s timeouts**, desktop Chrome settings.
  - **Smoke** project: real integration path, **120s timeouts** for slower agent/Neo4j interactions.
- Helpers in `e2e/helpers/` provide:
  - `MastraStreamBuilder` for Mastra-compliant SSE streams ending in `[DONE]`.
  - `mockMastraAPI(page, ...)` to intercept agent and memory endpoints before `/chat`.
  - `ChatPage` to centralize selectors and common chat/thread interactions.
- Tests rely on `data-testid` selectors and `npm run dev` from `../packages/web` on `http://localhost:3000`.
- Mocked suites simulate production-like streaming frames, including tool timeline markers and finish statistics; smoke suites exercise the live backend.

### 2) Hallucination verification pipeline
See **`hallucination_verifier/_index.md`** and drill down into:
- `hallucination_verifier_processor.md`
- `cli_verifier_flow_and_stdout_contract.md`

Key points:
- Verification is **final-answer only**:
  - runs only when `finishReason` is `stop`
  - requires no pending tool calls
  - requires non-empty text
- Evidence gathering is **tool-scoped** and sourced only from:
  - `getSection`
  - `getDocument`
  - `getAmendments`
  - `lookupPolicy`
  - `followReferences`
- The verifier performs a **two-step check**:
  1. relevance to the intended policy/question
  2. factual accuracy against retrieved sources
- Failure handling is **rewrite-based**, not retry-based:
  - unsupported answers are replaced via `correctedAnswer`
  - `writer.custom` emits `data-verification-rewrite`
- CLI verification has a strict stdout contract with stable markers:
  - `---EVIDENCE---`
  - `---VERIFIER---`
  - `---ANSWER---`
- The eval harness depends on exact telemetry field names and machine-parsed JSON structure.

### 3) Trust as an end-to-end chain
A cluster of synthesis entries reinforces a shared architectural pattern across qa, evaluation, and agent policy:
- **`end-to-end-citation-fidelity-is-enforced-from-retrieval-to-evaluation.md`**
- **`end-to-end-trust-is-enforced-as-a-chain-not-a-single-check.md`**
- **`end-to-end-trust-is-enforced-by-linking-evidence-verifier-behavior-and-final-sco.md`**
- **`end-to-end-trust-is-enforced-by-linking-retrieval-evidence-verifier-rewrite-and-.md`**
- **`qa-trust-is-enforced-as-a-chain-not-a-single-score.md`**
- **`trust-is-enforced-as-an-end-to-end-chain-not-a-single-check.md`**
- **`trust-is-enforced-as-an-end-to-end-chain-not-a-single-score.md`**
- **`trust-is-enforced-as-an-end-to-end-evidence-chain-not-a-single-score.md`**
- **`trustworthiness-is-enforced-from-retrieval-through-final-answer-evaluation.md`**

Shared pattern:
- Retrieve evidence first.
- Verify or rewrite unsupported claims.
- Score only grounded output.
- Treat unsupported claims, missing evidence, or judge failures as failures in the chain rather than isolated exceptions.

## Evaluation relationships
The qa domain is tightly coupled to the evaluation pipeline:
- Level 3 answer scoring fetches **Neo4j evidence** before `judge_answer`.
- Level 2 cross-reference evaluation validates:
  - `REFERENCES_DOCUMENT`
  - bidirectional `AMENDS`
  - section-level `REFERENCES`
- Judge failures are excluded or normalized so they do not skew aggregation.
- The evaluation pipeline also carries remediation threads around held-out dataset integrity, SSA ingestion rules, and citation fidelity.

## Important architectural decisions
- Final-answer verification only; no mid-stream verification.
- Rewrite unsupported answers immediately instead of retrying.
- Use source-scoped evidence builders only.
- Preserve stable CLI stdout markers and telemetry field names.
- Treat citation fidelity, cross-reference integrity, and answer scoring as one trust contract.

## Drill-down map
- **Playwright E2E** → `playwright_e2e/_index.md`
- **Hallucination verifier** → `hallucination_verifier/_index.md`
- **Trust/citation synthesis** → the `end-to-end-*`, `trust-*`, and `qa-trust-*` synthesis entries
- **Evaluation linkage** → `evaluation_pipeline/_index.md` and the referenced answer/cross-reference evaluation entries