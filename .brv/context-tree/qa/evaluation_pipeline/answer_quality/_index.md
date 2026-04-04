---
children_hash: 665dc1f6b626e7e148c41f19ece82d52fab76dedcd4ee8fbb3e7b89f70d2e0ef
compression_ratio: 0.5388349514563107
condensation_order: 0
covers: [answer_evaluation_level_3.md]
covers_token_total: 618
summary_level: d0
token_count: 333
type: summary
---
## Level d0 Structural Summary

- **Answer Evaluation Level 3 (`answer_evaluation_level_3.md`)**
  - **Task & Flow**: Controlled by `packages/pipeline/src/pipeline/eval/levels/answer.py`, the workflow progresses from the user question through `_invoke_agent` (HTTP first, CLI fallback), `_fetch_evidence_texts` (Neo4j sections by ID), and `judge_answer`, producing entries with precision/recall/MRR/primary hit flags for downstream aggregates.
  - **Architecture & Dependencies**: `extract_answer` isolates the agent output block; `_invoke_agent` prefers an HTTP POST to `http://localhost:4111/api/agents/ncMedicaidAgent/generate` before running `npx tsx src/index.ts` from `AGENT_DIR`. Evidence retrieval concatenates `Section.title` and `content_text` via Neo4j lookups, and scoring relies on `judge_answer`.
  - **Error Handling Rules**: Agent errors set all numeric scores to zero while preserving the explanation string; judge errors emit `None` for factual_accuracy/completeness/overall/citation_quality and tag `error_type` as `judge` so aggregates ignore those entries.
  - **Highlights & Facts**: Zeroed agent scores keep failures traceable; judge errors avoid polluting metrics. Key facts include the HTTP-first agent invocation with CLI fallback, judge error handling conventions, and Neo4j-based evidence construction.