---
title: Eval A/B Gate Corrections
tags: []
related: [packages/pipeline/context.md, packages/pipeline/evaluation_harness_ab/embeddings_a_b_result_voyage_4_vs_voyage_law_2.md, packages/pipeline/evaluation_harness_ab/embeddings_a_b_result_voyage_law_2_vs_voyage_4_large.md, packages/pipeline/evaluation_harness_ab/a_b_model_comparison_eval_harness_corrections.md, packages/policy_corpus/retrieval/reranker_gate_logic_and_a_b_evaluation.md, packages/policy_corpus/evaluation_harness_ab/a_b_model_comparison_eval_harness.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-06-14T05:19:41.985Z'
updatedAt: '2026-06-14T05:19:41.985Z'
---
## Raw Concept
**Task:**
Document the A/B evaluation gate corrections in scripts/eval-ab.sh for embeddings, reranker, and verifier comparisons.

**Changes:**
- Made the embeddings gate build both arms from the same controlled mixed corpus instead of comparing against the production graph.
- Changed the candidate embedding dimension default from 2048 to 1024 to match voyage-law-2 and voyage-4-large's native default.
- Kept embeddings_arm progress output on stderr so only the latest run id reaches stdout.
- Clarified that reranker evaluation must be measured through answer eval, not retrieval eval, because route analysis is only present in the full agent path.

**Files:**
- scripts/eval-ab.sh

**Flow:**
build matched corpus -> run retrieval or answer eval -> summarize metric -> compare arms -> gate adoption

**Timestamp:** 2026-06-14

**Patterns:**
- `^s*CANDIDATE_DIMS="${CANDIDATE_DIMS:-1024}"s*$` (flags: m) - Default embedding dimension is 1024

## Narrative
### Structure
The script defines shared helpers for latest_run_id, summarize_metric, answer_arm, and embeddings_arm, then dispatches to gate_embeddings, gate_reranker, or gate_verifier based on the first CLI argument.

### Dependencies
It depends on the pipeline CLI, Docker Compose for the isolated AB Neo4j container, and the held-out paraphrase dataset for honest evaluation.

### Highlights
The embeddings gate is explicitly apples-to-apples by rebuilding both arms on the same mixed corpus. The verifier gate is stochastic and uses repeated answer runs, while the reranker gate is also measured via answer eval because retrieval-only eval would be misleading.

### Rules
A swap is adopted only if its gate shows no regression (metric drop > EVAL_REGRESSION_THRESHOLD, 0.05).
To try a Matryoshka 2048 dim you must first teach voyage_client.embed() to send output_dimension.

### Examples
Usage examples: scripts/eval-ab.sh embeddings, scripts/eval-ab.sh reranker, and scripts/eval-ab.sh verifier.

## Facts
- **eval_ab_gates**: scripts/eval-ab.sh gates embeddings, reranker, and verifier comparisons for the mid-2026 model-cost research [project]
- **embeddings_gate_corpus**: The embeddings gate compares voyage-law-2 against a candidate embedder on a controlled mixed corpus rather than the full production graph [project]
- **mixed_corpus_sources**: The mixed corpus sources are dhhs_policy, clinical_policy, state_plan_amendment, CFR, and SSA [project]
- **voyage_4_large_default_dims**: voyage-4-large returns 1024 dimensions by default [project]
- **candidate_dims_default**: CANDIDATE_DIMS defaults to 1024 to match voyage-law-2 and avoid width mismatch [project]
- **embeddings_arm_output_behavior**: embeddings_arm builds the mixed corpus and runs retrieval eval inside command substitution so stdout only contains the latest run id [project]
- **reranker_measurement_method**: reranker evaluation is measured through answer eval because the standalone retrieval CLI does not carry route analysis and may skip with reason=not_hard_query [project]
- **verifier_gate_models**: verifier gate compares gpt-5.4-mini against gpt-5.4-nano across three runs each by default [project]
- **swap_adoption_threshold**: A swap is adopted only if its gate shows no regression beyond EVAL_REGRESSION_THRESHOLD of 0.05 [project]
