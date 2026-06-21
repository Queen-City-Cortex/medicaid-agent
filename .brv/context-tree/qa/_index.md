---
children_hash: 427bfe4b224ae6dbd41d93df6b18bc73aee8ee8916fd2ce41d6d82e550403245
compression_ratio: 0.18247210804462713
condensation_order: 2
covers: [context.md, end-to-end-citation-fidelity-is-enforced-from-retrieval-to-evaluation.md, end-to-end-trust-is-enforced-as-a-chain-not-a-single-check.md, end-to-end-trust-is-enforced-by-linking-evidence-verifier-behavior-and-final-sco.md, end-to-end-trust-is-enforced-by-linking-retrieval-evidence-verifier-rewrite-and-.md, evaluation_pipeline/_index.md, hallucination_verifier/_index.md, launch_blockers/_index.md, playwright_e2e/_index.md, qa-trust-is-enforced-as-a-chain-not-a-single-score.md, trust-is-enforced-as-an-end-to-end-chain-not-a-single-score.md, trustworthiness-is-enforced-from-retrieval-through-final-answer-evaluation.md]
covers_token_total: 6812
summary_level: d2
token_count: 1243
type: summary
---
# QA and Trust Pipeline Overview

The `qa` domain captures end-to-end Playwright test infrastructure for the Medicaid navigator agent UI, while the surrounding synthesis entries show that QA, evaluation, and hallucination verification are organized as one trust chain: retrieve evidence, verify or rewrite unsupported output, then score only grounded answers. Drill down into `playwright_e2e/_index.md` for UI test structure, `hallucination_verifier/_index.md` for final-answer verification behavior, and `evaluation_pipeline/_index.md` for scoring and cross-reference checks.

## Core `qa` scope
- Covers Playwright configuration for **mocked** and **smoke** suites.
- Includes helpers for **Mastra streaming** and **memory API** mocking.
- Uses page objects for **chat interactions** and **thread sidebar** workflows.
- Excludes unit/integration tests outside Playwright and backend implementation details.
- Owned by the **QA/Automation Team**.

## Playwright E2E structure
See `playwright_e2e/_index.md` for the main architecture.
- `e2e/playwright.config.ts` defines two projects:
  - **Mocked**: fast suite with **15s timeouts** and desktop Chrome settings.
  - **Smoke**: real integration suite with **120s timeouts** for slower agent + Neo4j behavior.
- Shared helpers under `e2e/helpers/`:
  - `stream-builder.ts` / **MastraStreamBuilder** for Mastra-compliant SSE ending in `[DONE]`.
  - `mock-routes.ts` / **mockMastraAPI** to intercept:
    - `POST /api/agents/*/stream`
    - `GET/POST /api/memory/threads`
    - `GET /api/memory/threads/*/messages`
  - `chat-page.ts` / **ChatPage** for selectors, message sending, assistant reply waits, trace lookup, and thread sidebar actions.
- Depends on `npm run dev` from `../packages/web`, served at `http://localhost:3000`, and on `data-testid` selectors in the chat UI.

## Trust and citation fidelity as a pipeline
The synthesis entries consistently agree on the same architectural pattern:
- **Retrieval** must surface the right evidence.
- **Verification** must reject or rewrite unsupported claims.
- **Evaluation** must score only grounded output.

Key shared relationships:
- `agent_architecture` enforces tool-first policy lookup, section IDs, amendment checks, and citation duties.
- `evaluation` measures answer quality and cross-reference resolution using **Neo4j** evidence and relationship validation.
- `qa`’s **HallucinationVerifier** builds prioritized source text from:
  - `getSection`
  - `getDocument`
  - `getAmendments`
  - `lookupPolicy`
  - `followReferences`
  then applies `correctedAnswer` via `writer.custom` when verification fails.

## Hallucination verification architecture
See `hallucination_verifier/_index.md`.
- Verification is **final-answer only**:
  - runs only when `finishReason` is `stop`
  - requires no pending tool calls
  - requires text to be present
- Failure handling is **rewrite-based**, not retry-based.
- CLI output is machine-parsed and stable:
  - `---EVIDENCE---`
  - `---VERIFIER---`
  - `---ANSWER---`
- Telemetry field names must remain unchanged because the eval harness parses the `---VERIFIER---` JSON block.
- The verifier schema includes:
  - `supported`
  - `relevant`
  - `unsupportedClaims`
  - `relevanceIssues`
  - `correctedAnswer`

## Evaluation pipeline structure
See `evaluation_pipeline/_index.md`.
- Two tightly connected layers:
  - **Level 3 answer scoring**
  - **Level 2 cross-reference resolution**
- Level 3 flow:
  - golden entry → agent invocation → Neo4j evidence fetch → `judge_answer` scoring → aggregation
  - agent invocation is **HTTP-first** with **CLI fallback**
  - judge failures become `None` so they do not skew aggregates
  - agent failures yield `0` scores with preserved explanations
- Level 2 flow:
  - validates `REFERENCES_DOCUMENT`, bidirectional `AMENDS`, and section-level `REFERENCES`
  - tracks `resolved_count`, `missed_count`, and derived precision/recall
- Shared dependencies:
  - running **mastra dev HTTP service** on `localhost:4111`
  - **Neo4j** evidence retrieval
  - metadata such as difficulty, reasoning type, and primary hit

## Cross-cutting remediation themes
The clustered synthesis entries show a consistent maintenance strategy:
- Trust is enforced as a **chain**, not a single score or single check.
- Evidence fidelity must survive from retrieval through final scoring.
- Unsupported claims are either **rewritten** or **excluded** rather than allowed to pass.
- Hallucination, citation, and cross-reference work are linked to the same correctness contract.

## Drill-down map
- `context.md` — domain scope, ownership, and usage
- `playwright_e2e/_index.md` — Playwright E2E architecture and helper responsibilities
- `hallucination_verifier/_index.md` — verifier processor and CLI contract
- `evaluation_pipeline/_index.md` — answer scoring and cross-reference resolution
- `launch_blockers/_index.md` — remediation work tied to trust, middleware, concept validation, and search coverage