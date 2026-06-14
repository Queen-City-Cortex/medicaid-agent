---
children_hash: a95cc17cc6ee427edfc4ad51907cee1d62d616251ce11600117c1305d823f235
compression_ratio: 0.37757274662881474
condensation_order: 2
covers: [context.md, end-to-end-citation-fidelity-is-enforced-from-retrieval-to-evaluation.md, end-to-end-trust-is-enforced-by-linking-evidence-verifier-behavior-and-final-sco.md, end-to-end-trust-is-enforced-by-linking-retrieval-evidence-verifier-rewrite-and-.md, evaluation_pipeline/_index.md, hallucination_verifier/_index.md, launch_blockers/_index.md, playwright_e2e/_index.md, trustworthiness-is-enforced-from-retrieval-through-final-answer-evaluation.md]
covers_token_total: 5636
summary_level: d2
token_count: 2128
type: summary
---
# QA / Trustworthiness / Playwright E2E — Structural Overview

This level-2 cluster centers on two tightly linked concerns: **end-to-end testing infrastructure for the Medicaid navigator UI** and **trustworthiness/citation fidelity across retrieval, verification, and evaluation**. The main pattern is that answer quality is not checked in isolation; it is enforced through a chain of evidence, verification, scoring, and remediation.

## Core domains and responsibilities

- **`qa/context.md`**
  - Defines the QA domain as the home for Playwright-based end-to-end testing patterns and helpers for the Medicaid navigator agent UI.
  - Scope is limited to mocked/smoke suites, Mastra streaming/memory test helpers, page objects, and e2e guidance.
  - Excludes backend implementation details and non-Playwright unit/integration tests.
  - Ownership: **QA/Automation Team**.

- **`playwright_e2e/_index.md`**
  - Covers the Playwright E2E harness under `e2e/`, split into **mocked** and **smoke** execution paths.
  - Key architecture:
    - `e2e/playwright.config.ts` defines two projects:
      - **Mocked**: fast path, 15s timeouts, desktop Chrome device settings.
      - **Smoke**: real agent integration path, 120s timeouts for slower agent + Neo4j interactions.
    - Helpers under `e2e/helpers/`:
      - `stream-builder.ts` / **MastraStreamBuilder** for Mastra-compliant SSE responses ending in `[DONE]`.
      - `mock-routes.ts` / **mockMastraAPI** for intercepting API calls before `/chat`.
      - `chat-page.ts` / **ChatPage** for selectors and chat actions.
  - Important flow:
    - configure Playwright → build stream payloads → mock Mastra APIs → visit `/chat` → drive chat via `ChatPage`.
  - Dependencies:
    - `npm run dev` from `../packages/web`
    - Mastra client SDK for SSE parsing
    - `data-testid` selectors in the UI
  - Drill-down entry: `medicaid_agent_playwright_e2e_infrastructure.md` for helper behavior and test flow details.

## End-to-end citation fidelity and trustworthiness

Several synthesis entries reinforce the same architectural contract: **retrieval evidence, verifier behavior, and final scoring must stay aligned**.

- **`end-to-end-citation-fidelity-is-enforced-from-retrieval-to-evaluation.md`**
  - Trustworthiness depends on preserving section-level evidence and amendment links through retrieval, verification, and scoring.
  - Cross-domain responsibilities:
    - **agent_architecture**: tool-first policy lookup, citation duties, amendment checks, forced synthesis warnings.
    - **evaluation**: Level 3 answer scoring fetches primary/supporting Neo4j section texts; Level 2 cross-reference evaluation validates `DOCUMENT`, `AMENDS`, and `REFERENCES` relationships.
    - **qa**: `HallucinationVerifier` builds prioritized source text from `getSection`, `getDocument`, `getAmendments`, `lookupPolicy`, and `followReferences`, then verifies and rewrites unsupported answers.

- **`end-to-end-trust-is-enforced-by-linking-evidence-verifier-behavior-and-final-sco.md`**
  - Trust is modeled as a chain:
    - retrieval must surface the right evidence
    - verifier must reject or rewrite unsupported answers
    - evaluation must score only grounded outputs
  - Shared failure mode: breaking the evidence-to-answer chain.

- **`end-to-end-trust-is-enforced-by-linking-retrieval-evidence-verifier-rewrite-and-.md`**
  - Reiterates the same chain across **qa**, **evaluation**, and **agent_architecture**.
  - `qa` verifier applies `correctedAnswer` immediately when unsupported, without retries.
  - `evaluation` scores against Neo4j evidence and cross-reference structure.
  - `agent_architecture` enforces citation and anti-hallucination rules at the prompt/runtime layer.

- **`trustworthiness-is-enforced-from-retrieval-through-final-answer-evaluation.md`**
  - Summarizes the combined pipeline as cumulative rather than a single scoring step.
  - Evaluation checks answer quality and cross-reference resolution; QA adds final-pass hallucination verification and remediation focus.

## Evaluation pipeline structure

- **`evaluation_pipeline/_index.md`**
  - The evaluation system has two core layers:
    - **Level 3 Answer Evaluation**
      - Implemented in `packages/pipeline/src/pipeline/eval/levels/answer.py`
      - Flow: golden entry → agent invocation → Neo4j evidence fetch → `judge_answer` → aggregate metrics
      - HTTP-first with CLI fallback
      - Judge errors are normalized so they do not distort aggregates
    - **Level 2 Cross-Reference Evaluation**
      - Implemented in `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`
      - Validates `REFERENCES_DOCUMENT`, bidirectional `AMENDS`, and section-level `REFERENCES`
      - Tracks `resolved_count`, `missed_count`, precision/recall
  - Shared dependencies:
    - running mastra dev HTTP service on `localhost:4111`
    - fallback to `npx tsx src/index.ts`
    - Neo4j evidence retrieval
    - golden dataset metadata
  - Ongoing remediation thread:
    - held-out dataset de-contamination
    - SSA ingestion rules
    - citation fidelity / trustworthiness
    - paraphrase rebaseline metrics
    - staged P0–P3 roadmap
  - Remaining failures (`q-004`, `q-009`, `q-020`) are tied to reference extraction, not the scorer itself.

## Hallucination verifier and CLI contract

- **`hallucination_verifier/_index.md`**
  - The verifier is split between:
    - `hallucination_verifier_processor.md` — main processor behavior
    - `cli_verifier_flow_and_stdout_contract.md` — CLI serialization and harness contract
  - Architectural decisions:
    - verification is **final-answer only**
    - evidence gathering is **tool-scoped**
    - failure handling is **rewrite-based**, not retry-based
    - CLI output is machine-parsed and stdout markers must remain stable
  - Processor details:
    - uses `getSection`, `getDocument`, `getAmendments`, `lookupPolicy`, `followReferences`
    - builds prioritized source text with `buildSourceText`
    - schema includes `supported`, `relevant`, `unsupportedClaims`, `relevanceIssues`, `correctedAnswer`
    - if verification fails, it applies `correctedAnswer` immediately via `writer.custom`
  - CLI contract details:
    - stable markers: `---EVIDENCE---`, `---VERIFIER---`, `---ANSWER---`
    - telemetry field names must not change because the eval harness parses exact snake_case JSON fields

## Launch blockers and remediation context

- **`launch_blockers/_index.md`**
  - Captures remediation work across middleware, concept validation, hallucination verification, and search test coverage.
  - Key fixes:
    - `proxy.ts` aligned with Next.js 16 middleware conventions via `proxy` export
    - `authkitProxy` receives `NextFetchEvent` and `NextRequest`
    - `concepts.ts` now whitelists Cypher relationship types: `COVERS`, `DEFINES`, `RESTRICTS`, `GOVERNS`, `REFERENCES_CONCEPT`
    - hallucination verifier hardened with source truncation, failure sentinel handling, rewritten assistant text, and `VERIFICATION_UNAVAILABLE`
    - `search.test.ts` expanded to cover fulltext handlers, deduplication, topK, snippet truncation, embedding failures, concept filtering, and Voyage API error propagation
  - Broader remediation plan:
    - P0: answer integrity and security
    - P1: retrieval quality, corpus integrity, UX fixes
    - P2: product upgrade and CI/deploy/hygiene
    - P3: staged refactors
  - Important facts:
    - review was a 31-agent line-by-line effort over 433 file assignments
    - trustworthiness is the central product concern
    - documented default model: `gpt-5.4`
    - Node 22 is the aligned runtime
    - `OPENAI_API_KEY` is hard-required

## Structural relationships to follow for drill-down

- **Playwright test harness**
  - Start with `qa/context.md` for scope and ownership
  - Then drill into `playwright_e2e/_index.md`
  - Then into `medicaid_agent_playwright_e2e_infrastructure.md` and the message persistence smoke-test entry

- **Trust / citation / verification pipeline**
  - Start with `evaluation_pipeline/_index.md`
  - Then drill into answer-quality and cross-reference evaluation entries
  - Use `hallucination_verifier/_index.md` for verifier behavior and CLI contract
  - Use the synthesis entries for end-to-end trust patterns across retrieval, evaluation, and QA

- **Remediation and blockers**
  - Use `launch_blockers/_index.md` for the current blocked areas and staged fix roadmap
  - Follow the linked remediation documents for detailed rollout ordering and risk handling