---
children_hash: 09c8732a04845c703049f2e778ad23e752a5257ff3521210ab74b2aad3d52fb6
compression_ratio: 0.6746411483253588
condensation_order: 0
covers: [reranker_gate_logic_and_a_b_evaluation.md]
covers_token_total: 1254
summary_level: d0
token_count: 846
type: summary
---
# Reranker Gate Logic and A/B Evaluation

This entry documents the reranker’s gating behavior in `packages/policy-corpus/src/retrieval/rerank.ts` and the correct evaluation path for comparing reranker behavior in policy-corpus retrieval.

## Core structure

- **Reranker activation is selective**: `shouldAttemptRerank()` only fires for hard or ambiguous queries and otherwise fail-opens to baseline hits.
- **Evaluation must happen at answer level**: `scripts/eval-ab.sh` was corrected so reranker A/B runs through `answer_arm()` and answer evaluation, not retrieval-level evaluation.
- **Retrieval-level reranker A/B is misleading**: the standalone retrieval CLI lacks route analysis, so reranker tests skip with `reason=not_hard_query` and can show a false 0.000 delta.

## Gate logic details

See **`reranker_gate_logic_and_a_b_evaluation.md`** for the complete gate behavior. Key gate conditions captured in the facts:

- Disabled for **explicit document types**
- Disabled for **deterministic_route** (`deterministic_evidence`)
- Disabled when there are **too few candidates** (`MIN_RERANK_CANDIDATES`)
- Enabled for hard queries with question types:
  - `federal_authority`
  - `amendment`
  - `policy_variant`
- Enabled for **HCWD income premium** queries
- Enabled for `ambiguous_top_hits` when:
  - `distinctDocuments.size >= 3`
  - `scoreGap <= 0.2`

Example gate reasons include:
`explicit_document_types`, `deterministic_route`, `too_few_candidates`, `not_hard_query`, `hard_query:federal_authority`, `hard_query:hcwd_income_premium`, and `ambiguous_top_hits`.

## Evaluation findings

- **Retrieval-level reranker A/B produced no meaningful difference**: precision, recall, MRR, and hit metrics were byte-identical across reranker on/off on the 50 held-out questions.
- **The reranker is dormant for many queries** because some agent-path queries skip via `deterministic_route`.
- **The retrieval baseline is weak** (`recall@k 0.30`, `primary_hit_rate 48%`, `precision 0.056`), so **embeddings are the higher-value optimization target**.
- The broader conclusion is that the reranker is not the main bottleneck; the embeddings gate is the more important lever because it addresses baseline retrieval quality.

## Relationships and drill-down pointers

- **`packages/policy-corpus/src/retrieval/rerank.ts`** — reranker implementation and gate conditions
- **`scripts/eval-ab.sh`** — evaluation routing fix for reranker comparisons
- Related evaluation context:
  - **`packages/policy-corpus/evaluation/a_b_model_comparison_eval_harness.md`**
  - **`packages/policy-corpus/evaluation_harness_ab/a_b_model_comparison_eval_harness.md`**
  - **`packages/pipeline/evaluation_harness_ab/embeddings_a_b_result_voyage_4_vs_voyage_law_2.md`**
  - **`packages/pipeline/evaluation_harness_ab/embeddings_a_b_result_voyage_law_2_vs_voyage_4_large.md`**
  - **`packages/pipeline/evaluation_harness_ab/a_b_model_comparison_eval_harness_corrections.md`**
  - **`packages/pipeline/eval_a_b_gate_corrections.md`**
  - **`packages/policy_corpus/frame/coverage_selection_and_graph_fixtures.md`**

## Bottom line

The reranker exists as a guarded, fail-open refinement step, but the meaningful evaluation path is answer-level, not retrieval-level. The documented result is that reranker A/B does not materially move retrieval metrics, while embeddings remain the primary optimization focus.