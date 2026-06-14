---
children_hash: f49d9dbbf667eb8d0445df884cf2d36909b8f20b5239a530f149f343d248e0b7
compression_ratio: 0.6147880041365047
condensation_order: 2
covers: [answer_quality/_index.md, context.md, cross_reference_resolution/_index.md, pipeline_overview/_index.md]
covers_token_total: 1934
summary_level: d2
token_count: 1189
type: summary
---
# Evaluation

Central evaluation domain for the Medicaid Navigator, covering Level 2 cross-reference resolution and Level 3 answer-quality scoring. The shared pattern is a golden-entry-driven pipeline that invokes the agent, retrieves Neo4j evidence, judges outputs, and aggregates metrics to surface retrieval and citation gaps.

## Core evaluation topics

- **answer_quality/_index.md** — Level 3 answer-quality evaluation for `ncMedicaidAgent`, including scoring behavior, agent invocation, evidence retrieval, and an embeddings A/B comparison.
- **cross_reference_resolution/_index.md** — Level 2 graph relationship validation for cross-reference resolution, centered on document and section linkage in Neo4j.
- **pipeline_overview/_index.md** — umbrella view of the shared evaluation flow, module boundaries, dependencies, and failure modes across Levels 2 and 3.

## Shared pipeline structure

- Golden entries flow into agent execution, then Neo4j evidence lookup, then judgment/scoring, then per-entry metrics or cross-reference checks.
- The evaluation system is explicitly tied to Neo4j-backed relationships and document sections rather than standalone text matching.
- Both evaluation tracks are designed to measure measurable correctness, not narrative quality.

## Answer quality evaluation pattern

From **answer_quality/_index.md** and drill-down `answer_quality_evaluation.md`:

- Implemented in `packages/pipeline/src/pipeline/eval/levels/answer.py`.
- Execution flow:
  - golden entries
  - `_invoke_agent` over HTTP with CLI fallback
  - fetch primary and supporting evidence texts from Neo4j section queries
  - `judge_answer`
  - build per-question metrics
- Answer extraction relies on content after `---ANSWER---`.
- Failure handling:
  - judge failures yield `None` scores and are excluded from aggregation
  - agent failures yield zero scores plus an error explanation
  - agent invocation times out after 180 seconds and raises on non-zero CLI exit
- `primary_hit` is set when overall score is at least 2, if available.
- Dependencies include `HTTPX`, `subprocess`, Neo4j sessions, and `judge_answer`.
- Environment passthrough supports optional `OPENAI_API_KEY` and `AGENT_MODEL`.

### Retrieval-model finding

- The embedded A/B test compared `voyage-law-2` vs `voyage-4-large` on a legal corpus using 1024-dimensional embeddings, 50 held-out questions, and deterministic retrieval.
- Results showed a small MRR gain but no meaningful overall improvement:
  - `MRR`: `0.203 -> 0.232`
  - `precision@k`: `0.058 -> 0.056`
  - `primary_hit_rate`: `0.480 -> 0.460`
  - `recall@k`: `0.305 -> 0.305`
- Verdict: `voyage-4-large` was effectively a wash; no metric cleared the `0.05` threshold, `eval-compare` reported no regression, and cost was unchanged.
- Main conclusion: the bottleneck appears structural, not embedding-model selection. A cheaper follow-up candidate is `voyage-4` if quality holds.

## Cross-reference resolution pattern

From **cross_reference_resolution/_index.md** and drill-down `cross_reference_resolution_evaluation.md`:

- Implemented in `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`.
- Evaluates golden entries against Neo4j relationship coverage.
- Resolution order:
  - document-level `REFERENCES_DOCUMENT` and `AMENDS`
  - fallback to section-level `REFERENCES` via `HAS_SECTION`
- Metrics track resolved vs missed cross-refs, with precision/recall derived from `resolved_count / total_cross_refs`.
- Improvements increased success from `0/5` to `2/5`.
- Remaining failures: `q-004`, `q-009`, and `q-020`, attributed to missing reference extraction coverage.
- Missing document IDs are counted as missed without querying the graph.

## Shared module and dependency structure

From **pipeline_overview/_index.md**:

- The two primary modules are:
  - `packages/pipeline/src/pipeline/eval/levels/answer.py`
  - `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`
- Shared dependencies and graph assumptions:
  - answer scoring uses `HTTPX`, subprocess CLI fallback, Neo4j sessions, and `judge_answer`
  - cross-ref validation uses Neo4j edge types `REFERENCES_DOCUMENT`, `AMENDS`, `HAS_SECTION`, and `REFERENCES`
- Error-handling rule: agent invocations time out after 180 seconds and raise on non-zero CLI exits.
- Cross-ref rule: missing document IDs are treated as missed references.

## Drill-down map

- **answer_quality/_index.md** → `evaluation/answer_quality/answer_quality_evaluation.md`, `evaluation/answer_quality/embeddings_a_b_result_voyage_law_2_vs_voyage_4_large.md`
- **cross_reference_resolution/_index.md** → `evaluation/cross_reference_resolution/cross_reference_resolution_evaluation.md`
- **pipeline_overview/_index.md** → `evaluation/evaluation_pipeline_overview.md`