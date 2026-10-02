---
children_hash: 9dbfd1fe2fca6fd2f7ebfed7453acb44ae66c64b4b94b61724fd50ae22622cd5
compression_ratio: 0.5030120481927711
condensation_order: 1
covers: [answer_quality_evaluation.md]
covers_token_total: 1328
summary_level: d1
token_count: 668
type: summary
---
# Answer Quality Evaluation

## Overview
This knowledge set centers on the Level 3 answer-quality evaluation pipeline for `ncMedicaidAgent`, plus a related embeddings A/B result that informed retrieval-model choice. The core evaluation flow is documented in `evaluation/answer_quality/answer_quality_evaluation.md`; drill down there for scoring behavior, agent invocation, and evidence retrieval details.

## Core Evaluation Pipeline
- Answers are evaluated in `packages/pipeline/src/pipeline/eval/levels/answer.py`.
- The flow is:
  - golden entries
  - `_invoke_agent` via HTTP, with CLI fallback
  - fetch evidence texts from Neo4j section queries
  - `judge_answer`
  - build per-question metrics
- The evaluator extracts content after `---ANSWER---` markers and supports both API and CLI execution paths.

## Error Handling and Scoring Rules
- Judge failures emit `None` for score dimensions so they are excluded from aggregation.
- Agent failures return zero scores plus an explanation from the agent error.
- Agent invocation times out after 180 seconds and raises on non-zero exit before judging continues.
- `primary_hit` is set when the overall score is at least 2, if available.

## Evidence and Dependencies
- Evidence retrieval includes both primary and supporting Neo4j sections before scoring.
- The pipeline depends on:
  - `HTTPX` for API calls
  - `subprocess` for CLI fallback
  - Neo4j sessions for evidence lookup
  - the `judge_answer` scoring module
- OpenAI environment passthrough supports optional `OPENAI_API_KEY` and `AGENT_MODEL` overrides.

## Embeddings A/B Findings
- The related embeddings test compared `voyage-law-2` vs `voyage-4-large` on a legal corpus.
- It used 1024-dimensional embeddings, 50 held-out questions, and deterministic retrieval.
- Results:
  - `MRR`: `0.203 -> 0.232` (`+0.029`)
  - `precision@k`: `0.058 -> 0.056` (`-0.002`)
  - `primary_hit_rate`: `0.480 -> 0.460` (`-0.020`)
  - `recall@k`: `0.305 -> 0.305` (`0.000`)
- Verdict: `voyage-4-large` was a wash relative to `voyage-law-2`; no metric crossed the `0.05` threshold.
- `eval-compare` reported no regression.
- Cost was the same, so there was no reason to switch to `voyage-4-large`.

## Key Conclusions
- The main bottleneck appears structural, not embedding-model choice.
- A cheaper follow-up candidate remains: `voyage-4` for potential cost savings if it matches quality.

## Drill-Down References
- `evaluation/answer_quality/answer_quality_evaluation.md` — full evaluation pipeline, scoring rules, and embeddings result
- `evaluation/answer_quality/embeddings_a_b_result_voyage_law_2_vs_voyage_4_large.md` — specialized A/B retrieval experiment details