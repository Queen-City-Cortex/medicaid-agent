---
children_hash: a7f5821092eb5038257dadfaf0a8aef0c360c0680c113db2fe68521f187819a3
compression_ratio: 0.2556971803785245
condensation_order: 2
covers: [context.md, end-to-end-citation-fidelity-is-enforced-from-retrieval-to-evaluation.md, evaluation_pipeline/_index.md, hallucination_verifier/_index.md, launch_blockers/_index.md, playwright_e2e/_index.md, trustworthiness-is-enforced-from-retrieval-through-final-answer-evaluation.md]
covers_token_total: 5178
summary_level: d2
token_count: 1324
type: summary
---
# QA

The `qa` domain captures end-to-end testing and trust enforcement for the Medicaid navigator agent UI. It spans Playwright E2E infrastructure, hallucination verification, and evaluation pipelines that keep retrieval, citations, and final answers aligned with Neo4j-backed evidence.

## Core scope and ownership
- Owned by the **QA/Automation Team**
- Includes:
  - Playwright config, helpers, and page objects for mocked and smoke suites
  - Hallucination verification at processor and CLI/runtime boundaries
  - Answer-quality and cross-reference evaluation against golden data
- Excludes:
  - Unit/integration tests outside Playwright
  - Backend service implementation details outside verifier/evaluation contracts

## Structural pillars

### 1) End-to-end citation fidelity
Reference: `end-to-end-citation-fidelity-is-enforced-from-retrieval-to-evaluation.md`

- Citation fidelity is treated as an **end-to-end contract** across:
  - agent retrieval and amendment lookup
  - evaluation scoring against Neo4j section evidence
  - hallucination verification and answer rewriting
- Key relationship:
  - the agent enforces tool-first policy lookup and citation duties
  - evaluation fetches section text and cross-reference evidence
  - the verifier rejects or rewrites unsupported output

### 2) Evaluation pipeline
References: `evaluation_pipeline/_index.md`

- The pipeline has two coordinated layers:
  - **Level 3 answer evaluation**
  - **Level 2 cross-reference evaluation**
- Core flow:
  - question → agent invocation → evidence retrieval → judge scoring
  - entry → cross-reference iteration → document/section graph checks → metrics
- Important behaviors:
  - HTTP-first agent invocation with CLI fallback
  - Neo4j section text is the primary evidence source
  - judge errors are excluded from aggregation
  - cross-reference resolution supports `REFERENCES_DOCUMENT`, `AMENDS`, and section-level `REFERENCES` fallback
- Dataset context:
  - held-out paraphrase IDs `h-001..h-050`
  - schema IDs match `^(q|h)-\\d+$`
  - SSA ingestion uses explicit SSA↔USC mapping and must not infer membership from section numbering alone

### 3) Hallucination verification
References: `hallucination_verifier/_index.md`

- Split into two child concerns:
  - `hallucination_verifier_processor.md` — internal processor behavior
  - `cli_verifier_flow_and_stdout_contract.md` — external CLI/stdout contract
- Shared design:
  - verify only the **final assistant response**
  - assemble source text from `getSection`, `getDocument`, `getAmendments`, `lookupPolicy`, `followReferences`
  - prioritize cited sources, cap source text, and signal truncation
  - apply `correctedAnswer` immediately when unsupported or irrelevant
- CLI/runtime contract:
  - stdout markers: `---EVIDENCE---`, `---VERIFIER---`, `---ANSWER---`
  - exact snake_case JSON fields are required for eval harness parsing
  - confidence is clamped and banded into high/medium/low
  - verifier toggles and model defaults are controlled by environment settings

### 4) Launch blockers and remediation
References: `launch_blockers/_index.md`

- Tracks release-blocking fixes and staged remediation.
- Main themes:
  - middleware/proxy alignment with Next.js 16
  - concept relationship validation and null handling
  - verifier hardening for source formatting, truncation, and failure sentinels
  - search test expansion covering deduplication, topK, truncation, and embedding failures
- Remediation plan emphasis:
  - trustworthiness, citation fidelity, hallucination prevention, and evaluation honesty
  - staged P0–P3 work with P0 remediation completed and later phases completed on 2026-06-12
  - trust-layer UX upgrades such as verification badges, cited/consulted split, clipboard footnotes, Markdown export, and print CSS

### 5) Playwright E2E infrastructure
References: `playwright_e2e/_index.md`

- Covers Playwright-based end-to-end testing under `e2e/`
- Architecture centers on:
  - shared Playwright config
  - reusable Mastra streaming and API-mocking helpers
  - a `ChatPage` abstraction for chat interactions and sidebar flow
- Test split:
  - **Mocked suites**: fast, 15s timeouts, desktop Chrome settings
  - **Smoke suites**: real agent integration, 120s timeouts
- Key helper responsibilities:
  - `MastraStreamBuilder` creates Mastra-compliant SSE streams ending in `[DONE]`
  - `mockMastraAPI(page, ...)` intercepts agent and memory endpoints before navigating to `/chat`
  - `ChatPage` centralizes selectors, message sending, reply waiting, trace lookup, and thread sidebar interactions
- Dependencies:
  - `npm run dev` from `../packages/web`
  - Mastra client SSE parsing
  - `data-testid` selectors in the chat UI

## Cross-entry relationships
- `evaluation_pipeline/_index.md` and `end-to-end-citation-fidelity-is-enforced-from-retrieval-to-evaluation.md` both treat Neo4j evidence and cross-reference integrity as part of answer trust.
- `hallucination_verifier/_index.md` complements evaluation by rewriting unsupported final answers rather than only scoring them.
- `launch_blockers/_index.md` shows the trust/citation hardening work that supports the same quality goals.
- `playwright_e2e/_index.md` provides the UI-level harness used to validate chat behavior, streaming, and message persistence.