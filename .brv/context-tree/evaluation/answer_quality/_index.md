---
children_hash: 99f8260af1f5fdbaf7503c88f1127e299cc61fa75bb2dfb75edcc5f10536fcdb
compression_ratio: 0.43944636678200694
condensation_order: 1
covers: [answer_quality_evaluation.md, context.md]
covers_token_total: 578
summary_level: d1
token_count: 254
type: summary
---
## answer_quality
- **Overview & Purpose**: Level 3 evaluation orchestrates ncMedicaidAgent answer generation, evidence retrieval, and scoring, positioning `packages/pipeline/src/pipeline/eval/levels/answer.py` as the core implementation (see `answer_quality_evaluation.md` and `context.md`).
- **Invocation Flow**: Agent answers are produced via HTTP first, falling back to CLI; support for `OPENAI_API_KEY` and `AGENT_MODEL` overrides travels through to both paths, and the runtime enforces a 180-second timeout with explicit failure handling before judge scoring.
- **Evidence Pipeline**: After answer generation, Neo4j section queries fetch both primary and supporting texts, feeding into `judge_answer`, which then builds per-question metrics for aggregation.
- **Error & Scoring Rules**: Judge failures emit `None` across score dimensions and are excluded from aggregates, while agent/process errors return zeros plus detailed explanations; a primary hit is flagged whenever an overall score ≥ 2 (if available).