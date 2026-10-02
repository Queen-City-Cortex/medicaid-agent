---
title: A/B Model Comparison Eval Harness Corrections
tags: []
related: [packages/pipeline/evaluation_harness_ab/a_b_model_comparison_eval_harness.md, packages/pipeline/frame/federal_authority_pairing_and_rebalance.md, packages/pipeline/evaluation_harness_ab/embeddings_a_b_result_voyage_4_vs_voyage_law_2.md, packages/pipeline/evaluation_harness_ab/embeddings_a_b_result_voyage_law_2_vs_voyage_4_large.md, packages/pipeline/eval_a_b_gate_corrections.md, packages/policy_corpus/retrieval/reranker_gate_logic_and_a_b_evaluation.md, packages/policy_corpus/evaluation_harness_ab/a_b_model_comparison_eval_harness.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-06-14T05:20:51.965Z'
updatedAt: '2026-06-14T05:20:51.965Z'
---
## Raw Concept
**Task:**
Document the corrected A/B model-comparison eval harness in scripts/eval-ab.sh.

**Changes:**
- Rebuilt both embeddings arms as the same mixed corpus on the isolated AB container.
- Changed the candidate embedding dimension default from 2048 to 1024.
- Ensured embeddings_arm emits progress on stderr so command substitution captures only the run_id.

**Files:**
- scripts/eval-ab.sh

**Flow:**
dispatch gate -> build matched corpus or run answer arm -> summarize metrics -> compare arms

**Timestamp:** 2026-06-14T05:20:37.643Z

**Patterns:**
- `EVAL_REGRESSION_THRESHOLD, 0.05` - Regression threshold used to decide whether a swap is adopted

## Narrative
### Structure
The script defines shared helpers for locating the latest result file, summarizing metrics, printing banners, and running repeated answer-level arms. It then dispatches to three gates: embeddings, reranker, and verifier.

### Dependencies
Embeddings evaluation depends on an isolated Neo4j AB container and the pipeline CLI. Reranker and verifier gates depend on answer-level evaluations because the standalone retrieval CLI does not exercise those behaviors correctly.

### Highlights
The embeddings gate now compares matched mixed corpora instead of mixed corpus versus production graph, avoiding a confounded comparison. The verifier gate also runs a citation check against the newest answer run.

### Rules
All comparisons run against the held-out paraphrase split — the only honest baseline per the 2026-06-11 de-contamination review. A swap is adopted only if its gate shows no regression (metric drop > EVAL_REGRESSION_THRESHOLD, 0.05). Runs inside $(...) — ALL progress/report output must go to stderr so the only thing on stdout is the run_id echoed by latest_run_id.

### Examples
Example usage: scripts/eval-ab.sh embeddings; scripts/eval-ab.sh reranker; scripts/eval-ab.sh verifier.

## Facts
- **mixed_corpus_scope**: build-mixed-corpus is a controlled subset containing dhhs_policy, clinical_policy, state_plan_amendment, CFR, and SSA, not the full production graph. [project]
- **comparison_confounding**: Comparing voyage-4 mixed corpus versus voyage-law-2 production would confound embedding model quality with corpus content differences. [project]
- **embeddings_gate_method**: gate_embeddings was fixed to build both A/B arms as the same mixed corpus on the AB container using embeddings_arm() with --reset --skip-parse. [project]
- **embeddings_gate_difference**: The only intended difference in the embeddings gate is the embedding model. [project]
- **voyage_4_large_default_dims**: voyage-4-large returns 1024 dimensions by default. [project]
- **voyage_client_output_dimension**: voyage_client.embed sends no output_dimension, so the model emits its native default dimension. [project]
- **candidate_dims_default**: CANDIDATE_DIMS default was changed to 1024 to match voyage-law-2 and keep the A/B comparison same-dimension. [project]
- **matryoshka_2048_requirement**: To use a Matryoshka 2048 dimension, voyage_client.embed must first be taught to send output_dimension. [project]
- **embeddings_arm_output_stream**: embeddings_arm redirects output to stderr so that only run_id is captured in command substitution. [project]
- **ab_eval_dataset**: The script gates embeddings, reranker, and verifier comparisons against the held-out paraphrase split. [project]
- **adoption_threshold**: A swap is adopted only if its gate shows no regression, defined as metric drop greater than EVAL_REGRESSION_THRESHOLD of 0.05. [project]
