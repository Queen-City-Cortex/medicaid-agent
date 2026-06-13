---
children_hash: 482c9ce45d25f13cac0755d7296811564be656e6057df87c410a786634717cc5
compression_ratio: 0.3655984303466318
condensation_order: 1
covers: [cli_verifier_flow_and_stdout_contract.md, hallucination_verifier_processor.md]
covers_token_total: 3058
summary_level: d1
token_count: 1118
type: summary
---
## QA / Hallucination Verification

Structural overview of the verifier pipeline, processor behavior, and CLI/stdout contract. The two child entries split cleanly between runtime processing logic and the externally visible verification output format.

### 1) Hallucination Verifier Processor
Reference: `hallucination_verifier_processor.md`

- Implements `HallucinationVerifier` as a processor-level post-check for NC Medicaid policy answers.
- Core behavior shifted from simple factuality checking to a **two-step verification**:
  1. **Relevance** to the user question / intended policy
  2. **Factual accuracy** against retrieved evidence
- Verification now takes the **first user question** plus answer text plus source text:
  - `verifyAnswer(question, text, sourceText)`
- Evidence assembly is tool-driven and limited to these sources:
  - `getSection`
  - `getDocument`
  - `getAmendments`
  - `lookupPolicy`
  - `followReferences`
- Source assembly rules:
  - cited sources are prioritized before uncited sources
  - source text is capped by `maxSourceChars`
  - truncation is explicitly signaled when excess sources are omitted
- Failure handling:
  - if verification is unsupported, irrelevant, or has major relevance issues, the processor applies `correctedAnswer` immediately
  - correction uses `writer.custom` with `data-verification-rewrite`
  - avoids retry loops / over-correction
- Guardrails:
  - only runs on the final assistant response
  - requires `finishReason === stop`
  - requires no pending tool calls
  - requires text to be present
- Depends on:
  - `generateObject` from `ai`
  - `createOpenAI` from `@ai-sdk/openai`
  - Zod schema validation
  - Mastra core processor/memory types
  - `writer.custom` event emission

### 2) CLI Verifier Flow and Stdout Contract
Reference: `cli_verifier_flow_and_stdout_contract.md`

- Documents the **shared verification flow** used by both CLI runner and processor:
  - `runVerificationForAnswer()` is the common execution path
- Establishes a **stable stdout contract** for eval / harness consumption:
  - `---EVIDENCE---`
  - `---VERIFIER---`
  - `---ANSWER---`
- Critical contract rule:
  - the Python eval harness parses the `---VERIFIER---` JSON block
  - exact **snake_case** field names must not change
- Verification schema includes:
  - `supported`
  - `relevant`
  - `citationsComplete`
  - `unsupportedClaims`
  - `missingCitationClaims`
  - `relevanceIssues`
  - `correctedAnswer`
- Confidence scoring / thresholds:
  - weighted deductions for unsupported claims, missing citations, and relevance issues
  - confidence is clamped to `[0, 1]`
  - severity bands: `high >= 0.85`, `medium >= 0.60`, otherwise `low`
  - `pureMarkerFallback` caps confidence at `0.55`
- Output rendering behavior:
  - corrected answers remove missing-citation markers from sentence flow
  - footer suggests citations
  - if evidence is insufficient, CLI falls back to a standard inability message
- CLI/runtime configuration:
  - `VERIFIER_ENABLED !== 'false'`
  - `VERIFIER_MODEL` defaults to `gpt-5.4-mini`
  - `VERIFIER_MAX_SOURCE_TOKENS` defaults to `30000`
  - `maxSourceChars = maxTokens * 4`
  - `AGENT_MODEL` defaults to `gpt-5.4`
  - OpenAI is used for `gpt-*`, `o3*`, `o4*`; Anthropic otherwise
- Agent/server behavior captured here:
  - `agent id`: `nc-medicaid-navigator`
  - `server host`: `0.0.0.0`
  - `port`: `parseInt(process.env.PORT || '4111')`
  - `healthz` checks Neo4j via `RETURN 1`
  - CLI uses `:memory:` observability DB; non-CLI uses `mastra.duckdb`
- Supported evidence/tool contract mirrors the processor entry:
  - `getSection`, `getDocument`, `getAmendments`, `lookupPolicy`, `followReferences`, `resolveAnswerFrame`

### Cross-entry relationships

- The CLI entry (`cli_verifier_flow_and_stdout_contract.md`) defines the **observable contract** and execution expectations.
- The processor entry (`hallucination_verifier_processor.md`) defines the **internal implementation** that produces those outputs.
- Both entries share the same core assumptions:
  - final-answer-only verification
  - evidence-first source assembly
  - relevance + factuality schema
  - immediate corrected-answer replacement when verification fails

### Drill-down map

- `hallucination_verifier_processor.md` → processor internals, source builders, schema, rewrite behavior
- `cli_verifier_flow_and_stdout_contract.md` → stdout markers, confidence scoring, CLI/server/runtime settings, eval harness contract