---
children_hash: 25c36ecc6221c23d707592be4e396c7eb8aac2c935587dc818ba97c0ae93b1fd
compression_ratio: 0.6042638241172552
condensation_order: 1
covers: [cli_verifier_flow_and_stdout_contract.md, hallucination_verifier_processor.md]
covers_token_total: 1501
summary_level: d1
token_count: 907
type: summary
---
# Hallucination Verification Pipeline

This cluster documents the hallucination verifier’s CLI contract and the processor that enforces answer quality in NC Medicaid policy workflows. The two entries are tightly linked: the processor produces the verification behavior, and the CLI contract defines how its output is consumed by downstream tooling.

## Core structure

- **`hallucination_verifier_processor.md`**  
  The main implementation doc for `HallucinationVerifier`, which performs a two-step check:
  1. relevance against the intended policy/question
  2. factual accuracy against retrieved sources

- **`cli_verifier_flow_and_stdout_contract.md`**  
  The execution/serialization contract for CLI verification output, including stable stdout markers and telemetry field requirements used by external harnesses.

## Key architectural decisions

- Verification is **final-answer only**: the processor runs only when `finishReason` is `stop`, there are no pending tool calls, and text is present.
- Evidence gathering is **tool-scoped**: only specific source builders contribute to verification context.
- Failure handling is **rewrite-based**, not retry-based: if verification fails, the processor applies `correctedAnswer` directly through `writer.custom`.
- CLI output is **machine-parsed and stable**: stdout markers and telemetry field names must not change because the Python eval harness depends on them.

## `hallucination_verifier_processor.md` details

- Defines the verifier configuration, evidence-source interfaces, metadata formatters, and `buildSourceText` helper.
- Uses dedicated SourceEntry builders for:
  - `getSection`
  - `getDocument`
  - `getAmendments`
  - `lookupPolicy`
  - `followReferences`
- `buildSourceText` prioritizes cited evidence before uncited material and enforces `maxSourceChars`.
- The verification schema includes:
  - `supported`
  - `relevant`
  - `unsupportedClaims`
  - `relevanceIssues`
  - `correctedAnswer`
- Dependencies include:
  - `generateObject` from `ai`
  - `createOpenAI` from `@ai-sdk/openai`
  - Zod
  - Mastra core processor/memory types
  - `writer.custom` for `data-verification-rewrite` events

### Important facts
- Evidence extraction only considers the five supported tool outputs.
- `maxSourceChars` is computed as `VERIFIER_MAX_SOURCE_TOKENS` defaulting to 30000, multiplied by 4.
- The processor extracts the first user question, gathers source text, verifies the answer, and updates the assistant message if needed.
- When verification fails, the processor applies `correctedAnswer` immediately without retries.

## `cli_verifier_flow_and_stdout_contract.md` details

- Documents the CLI verifier execution chain:
  - input → verifier execution → stdout contract → result handling
- Defines stable stdout markers:
  - `---EVIDENCE---`
  - `---VERIFIER---`
  - `---ANSWER---`
- Captures verifier telemetry and confidence-scoring behavior.
- Records environment/model behavior for the CLI, agent server, route, and healthcheck settings.
- Explicit rule: do not rename telemetry fields because the eval harness parses the `---VERIFIER---` JSON block and expects exact snake_case names.

## Relationships and drill-down paths

- **Processor behavior and schema** → `hallucination_verifier_processor.md`
- **CLI stdout contract and harness compatibility** → `cli_verifier_flow_and_stdout_contract.md`
- **Evaluation and launch-blocker alignment** is referenced by both entries through related links to:
  - `qa/evaluation_pipeline/context.md`
  - `qa/launch_blockers/launch_blocker_fixes.md`
  - `qa/playwright_e2e/...` and answer-quality evaluation docs