---
children_hash: 5e160717bf9e2457f1bad63704efd4e75a015b127ee9988aebfe1cd508ec1393
compression_ratio: 0.8128415300546448
condensation_order: 0
covers: [answer_evaluation_level_3.md]
covers_token_total: 732
summary_level: d0
token_count: 595
type: summary
---
## Level 3 Answer Evaluation

Level 3 answer evaluation centers on running the agent, retrieving supporting evidence, and scoring each golden entry with compatibility-focused result fields. The main implementation is in `packages/pipeline/src/pipeline/eval/levels/answer.py`; drill down into **Answer Evaluation Level 3** for the full flow and scoring rules.

### Core flow
- `question -> _invoke_agent -> _fetch_evidence_texts -> judge_answer -> results append`
- `_invoke_agent` prefers HTTP and falls back to the CLI if the agent API is unavailable.
- `_fetch_evidence_texts` pulls Neo4j Section nodes by section ID and concatenates title + `content_text` before judging.
- `evaluate_answers` collects agent answers/errors, evidence texts, and judge scores for each entry.

### Key behaviors
- **HTTP-first invocation**: Uses `http://localhost:4111/api/agents/ncMedicaidAgent/generate` first, then `npx tsx src/index.ts` in `AGENT_DIR` as fallback.
- **Traceable failures**: Agent failures produce zeroed numeric scores plus an explanation string.
- **Aggregate-safe judge errors**: Judge failures return `None` metrics so downstream aggregation skips them instead of treating them as real scores.
- **Compatibility fields**: Results include alias fields such as `precision`, `recall`, `mrr`, and `primary_hit`.

### Dependencies and relationships
- Depends on `httpx` for HTTP, `subprocess` for CLI fallback, `get_session` for Neo4j access, and `judge_answer` for scoring.
- Related evaluation context is connected to:
  - `qa/evaluation_pipeline/evaluation_pipeline.md`
  - `qa/evaluation_pipeline/answer_quality_and_cross_reference_evaluation.md`
  - `qa/evaluation_pipeline/cross_reference_resolution/cross_reference_evaluation_level_2.md`
  - `qa/hallucination_verifier/hallucination_verifier_processor.md`
  - `qa/playwright_e2e/medicaid_agent_playwright_e2e_infrastructure.md`

### Rules to preserve
- If `judge_answer` raises or returns an error of type `judge`, set `factual_accuracy`, `completeness`, `overall`, and `citation_quality` to `None`.
- If `agent_error` is present, set all numeric scores to `0` and preserve the explanation for logging.

### Key facts
- Agent invocation is HTTP-first with CLI fallback.
- Judge errors are represented as missing metrics, not zero scores.
- Evidence is assembled from Neo4j section titles plus content text before scoring.