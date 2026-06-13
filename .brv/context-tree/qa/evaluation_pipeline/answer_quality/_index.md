---
children_hash: 9f31e6a95b3e41b740ffa163dd91634ad8fa3109657a13c5b29d83c1e3d9d2a4
compression_ratio: 0.508130081300813
condensation_order: 0
covers: [answer_evaluation_level_3.md]
covers_token_total: 492
summary_level: d0
token_count: 250
type: summary
---
# Level 3 Answer Evaluation

Top-level answer-quality check in the evaluation pipeline. See `answer_evaluation_level_3.md` for details; related drill-downs are in `qa/evaluation_pipeline/context.md`, `qa/evaluation_pipeline/evaluation_pipeline.md`, and `qa/evaluation_pipeline/answer_quality_and_cross_reference_evaluation.md`.

- **Purpose:** assess final answer quality at the highest evaluation level.
- **Flow:** response generation → evaluation → level-3 assessment → feedback.
- **Implementation:** `packages/pipeline/src/pipeline/eval/levels/answer.py`.
- **Key rules:**
  - `judge_answer` error_type `judge` → set `factual_accuracy`, `completeness`, `overall`, `citation_quality` to `None`.
  - `agent_error` truthy → set all numeric scores to `0` and keep explanation for logging.
- **Behavior:** HTTP-first agent invocation with CLI fallback; errors are traceable via zeroed/None metrics and logged explanations.
- **Dependencies:** evaluation pipeline rules, citation fidelity expectations.