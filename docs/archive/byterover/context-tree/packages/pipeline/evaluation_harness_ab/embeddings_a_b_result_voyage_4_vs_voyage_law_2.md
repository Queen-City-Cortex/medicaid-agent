---
title: 'Embeddings A/B Result: voyage-4 vs voyage-law-2'
tags: []
keywords: []
importance: 55
recency: 1
maturity: draft
updateCount: 1
createdAt: '2026-06-14T06:33:08.557Z'
updatedAt: '2026-06-14T06:34:13.342Z'
related: [packages/pipeline/evaluation_harness_ab/embeddings_a_b_result_voyage_law_2_vs_voyage_4_large.md, packages/pipeline/evaluation_harness_ab/a_b_model_comparison_eval_harness_corrections.md, packages/pipeline/eval_a_b_gate_corrections.md, packages/policy_corpus/retrieval/reranker_gate_logic_and_a_b_evaluation.md, packages/policy_corpus/evaluation_harness_ab/a_b_model_comparison_eval_harness.md]
---
## Raw Concept
**Task:**
Record the voyage-4 embedding model A/B benchmark against voyage-law-2

**Changes:**
- voyage-4 matched voyage-law-2 quality on precision@k and primary_hit_rate
- voyage-4 improved MRR slightly
- voyage-4 cut embedding cost by about 50%

**Flow:**
benchmark setup -> compare metrics -> assess cost/quality tradeoff -> recommend migration

**Timestamp:** 2026-06-14T06:34:01.342Z

## Narrative
### Structure
This result captures an embeddings A/B comparison for voyage-4 versus voyage-law-2 on a matched mixed corpus with 1024-dimensional vectors and 50 held-out items.

### Dependencies
Migration requires re-embedding the production corpus and updating the pipeline EMBEDDING_MODEL plus the agent VOYAGE_MODEL together.

### Highlights
voyage-4 holds quality at half the cost, with no regression past 0.05 and a small MRR gain; it even edges out voyage-4-large.

### Examples
Recommended adoption path: re-embed the corpus, then switch both embedding configuration values in lockstep.

## Facts
- **voyage_4_embedding_cost**: voyage-4 costs $0.06/M embeddings, half of voyage-law-2 at $0.12/M [project]
- **embedding_benchmark_setup**: The benchmark used a matched mixed corpus with 1024-dimensional embeddings and 50 held-out examples [project]
- **precision_at_k**: precision@k stayed 0.058 to 0.058 [project]
- **primary_hit_rate**: primary_hit_rate stayed 0.480 to 0.480 [project]
- **mrr**: mrr improved from 0.204 to 0.234 [project]
- **recall_at_k**: recall@k changed from 0.305 to 0.295 [project]
- **voyage_4_recommendation**: voyage-4 is recommended for adoption because it holds quality at half the cost and does not regress past 0.05 [project]
- **voyage_4_migration**: Adopting voyage-4 requires a migration that re-embeds the production corpus and updates EMBEDDING_MODEL and VOYAGE_MODEL together [project]
- **embedding_dimensions**: voyage-4 remains 1024-dimensional so index dimensions do not change [project]
