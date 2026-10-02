---
title: 'Embeddings A/B Result: voyage-law-2 vs voyage-4-large'
tags: []
related: [packages/pipeline/evaluation_harness_ab/a_b_model_comparison_eval_harness.md, packages/pipeline/evaluation_harness_ab/embeddings_a_b_result_voyage_4_vs_voyage_law_2.md, packages/pipeline/evaluation_harness_ab/a_b_model_comparison_eval_harness_corrections.md, packages/pipeline/eval_a_b_gate_corrections.md, packages/policy_corpus/retrieval/reranker_gate_logic_and_a_b_evaluation.md, packages/policy_corpus/evaluation_harness_ab/a_b_model_comparison_eval_harness.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-06-14T05:59:11.761Z'
updatedAt: '2026-06-14T05:59:11.761Z'
---
## Raw Concept
**Task:**
Record the A/B evaluation of voyage-law-2 versus voyage-4-large for legal retrieval.

**Changes:**
- Benchmarked voyage-law-2 against voyage-4-large on a legal corpus
- Observed a small MRR gain but flat or worse supporting metrics
- Concluded the larger model is not worth switching to at equal price

**Flow:**
embed documents -> deterministic retrieval -> compare held-out metrics -> assess verdict -> decide follow-up

**Timestamp:** 2026-06-14

**Patterns:**
- `mrr 0.203->0.232 (+0.029)` - Observed MRR change for voyage-law-2 to voyage-4-large comparison
- `precision@k 0.058->0.056` - Observed precision@k change
- `primary_hit_rate 0.480->0.460` - Observed primary hit rate change
- `recall@k 0.305->0.305` - Observed recall@k stability

## Narrative
### Structure
The evaluation compares two 1024-dim embedders on a matched mixed corpus with 50 held-out items and deterministic retrieval. The result is summarized as a wash for voyage-4-large because only MRR improves slightly while precision@k, primary_hit_rate, and recall@k do not show a meaningful gain.

### Dependencies
The strategic conclusion depends on the observed metric deltas and the equal $0.12/M price point. The follow-up recommendation is to test voyage-4 non-large at $0.06/M to see if a cheaper model can improve cost efficiency without worsening retrieval.

### Highlights
No metric crosses the 0.05 threshold, so eval-compare is no regression. The result suggests the bottleneck is structural—chunking, query routing, or retrieval design—rather than the embedding choice itself.

### Examples
Decision: keep voyage-law-2 for now, do not switch to voyage-4-large, and prioritize structural retrieval improvements before changing generalist embedders.

## Facts
- **embedding_dimensions**: voyage-law-2 and voyage-4-large are both 1024-dim embeddings. [project]
- **evaluation_setup**: The comparison used a matched mixed corpus with 50 held-out samples and deterministic retrieval. [project]
- **mrr**: MRR improved from 0.203 to 0.232, a gain of 0.029. [project]
- **precision_at_k**: precision@k changed from 0.058 to 0.056. [project]
- **primary_hit_rate**: primary_hit_rate changed from 0.480 to 0.460. [project]
- **recall_at_k**: recall@k stayed flat at 0.305. [project]
- **comparison_verdict**: voyage-4-large is a wash versus voyage-law-2 on this legal corpus. [project]
- **pricing**: Same price is $0.12/M, so there is no reason to switch based on this result. [project]
- **retrieval_bottleneck**: Retrieval remains weak at about 47% hit rate under both embedders, indicating a structural bottleneck. [project]
- **follow_up_test**: Follow-up evaluation should test voyage-4 non-large at $0.06/M as a potential cost win. [project]
