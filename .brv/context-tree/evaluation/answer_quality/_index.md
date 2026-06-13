---
children_hash: b45e5a586ef5a55234f5ae9bc9e09096010d2ffa4c34332f15cb9a3be3c584d3
compression_ratio: 0.6726190476190477
condensation_order: 1
covers: [answer_quality_evaluation.md]
covers_token_total: 672
summary_level: d1
token_count: 452
type: summary
---
# Answer Quality Evaluation

Structural summary of the Level 3 answer-quality evaluation pipeline for ncMedicaidAgent. See `answer_quality_evaluation.md` for the full evaluation logic and scoring behavior.

## Core pipeline
- The evaluation flow is `golden entries -> _invoke_agent (HTTP -> CLI) -> fetch evidence texts (primary + supporting) -> judge_answer -> build metrics per question`.
- Implementation lives in `packages/pipeline/src/pipeline/eval/levels/answer.py`.
- The module handles extracting answer content after `---ANSWER---`, invoking the agent, retrieving Neo4j section text, and scoring via `judge_answer`.

## Invocation and fallback behavior
- Agent execution supports both HTTP API and CLI fallback paths.
- HTTP invocation includes passthrough for optional `OPENAI_API_KEY` and `AGENT_MODEL` overrides.
- The agent call times out after 180 seconds and raises on non-zero exit code before scoring continues.
- Dependencies include `HTTPX` for API calls and `subprocess` for CLI execution.

## Evidence retrieval and scoring
- Evidence is fetched from Neo4j section queries for both primary and supporting sections before judge scoring.
- Scoring is delegated to the `judge_answer` module.
- The evaluation is designed to preserve evidence context for each question before metrics are built.

## Error-handling rules
- Judge errors emit `None` scores for all dimensions and are excluded from aggregate metrics.
- Agent errors emit zero scores for all scoring metrics and include an explanation containing the agent error message.
- `primary_hit` is set to true whenever the overall score is at least 2, when that score is available.

## Related topic
- `answer_quality` focuses on the evaluation routine as a whole: agent invocation, evidence fetching, scoring, and aggregate preparation.