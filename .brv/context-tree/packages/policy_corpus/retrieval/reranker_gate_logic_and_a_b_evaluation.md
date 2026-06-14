---
title: Reranker Gate Logic and A/B Evaluation
tags: []
related: [packages/policy_corpus/frame/coverage_selection_and_graph_fixtures.md, packages/policy_corpus/evaluation/a_b_model_comparison_eval_harness.md, packages/pipeline/evaluation_harness_ab/embeddings_a_b_result_voyage_4_vs_voyage_law_2.md, packages/pipeline/evaluation_harness_ab/embeddings_a_b_result_voyage_law_2_vs_voyage_4_large.md, packages/pipeline/evaluation_harness_ab/a_b_model_comparison_eval_harness_corrections.md, packages/pipeline/eval_a_b_gate_corrections.md, packages/policy_corpus/evaluation_harness_ab/a_b_model_comparison_eval_harness.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-06-14T05:12:27.618Z'
updatedAt: '2026-06-14T05:12:27.618Z'
---
## Raw Concept
**Task:**
Document reranker gating behavior and the correct A/B evaluation path for policy-corpus retrieval.

**Changes:**
- Identified shouldAttemptRerank() gate conditions and enabling cases.
- Corrected scripts/eval-ab.sh so reranker A/B runs through answer eval instead of retrieval eval.
- Observed that retrieval-level reranker A/B is misleading because it always skips with reason=not_hard_query.
- Confirmed the held-out retrieval baseline is weak, making embeddings the higher-value optimization target.

**Files:**
- scripts/eval-ab.sh
- packages/policy-corpus/src/retrieval/rerank.ts

**Flow:**
query analysis -> shouldAttemptRerank() gate -> optional rerank attempt -> fail-open fallback to baseline hits; for evaluation: answer_arm() -> answer eval runs -> compare summaries

**Timestamp:** 2026-06-14T05:12:11.743Z

## Narrative
### Structure
The reranker lives in packages/policy-corpus/src/retrieval/rerank.ts and is guarded by shouldAttemptRerank(). The evaluation script in scripts/eval-ab.sh now routes reranker comparisons through answer-level runs via answer_arm(), while embeddings keep using retrieval-level comparisons.

### Dependencies
Reranker activation depends on query analysis, route lane, hit count, and whether the query is classified as a hard or ambiguous case. The evaluation logic depends on the held-out paraphrase dataset and the broader answer evaluation harness.

### Highlights
The reranker is intentionally selective: it only attempts reranking for certain hard or ambiguous queries and otherwise fail-opens to baseline hits. The documented A/B finding is that retrieval-level reranker tests are not meaningful, while the embeddings gate is the main lever because retrieval quality is weak.

### Rules
IMPORTANT: reranking is gated by shouldAttemptRerank(), which only fires for "hard"/"ambiguous" queries using the route analysis built in the FULL AGENT path. The standalone retrieval CLI carries no such analysis, so a retrieval-level A/B skips with reason=not_hard_query and shows a misleading 0.000 delta. We therefore measure the reranker through the answer eval, where it engages.

### Examples
Example gate reasons include explicit_document_types, deterministic_route, too_few_candidates, not_hard_query, hard_query:federal_authority, hard_query:hcwd_income_premium, and ambiguous_top_hits.

## Facts
- **rerank_gate_explicit_document_types**: shouldAttemptRerank() disables reranking when explicit document types are requested. [project]
- **rerank_gate_deterministic_route**: shouldAttemptRerank() disables reranking when the route lane is deterministic_evidence. [project]
- **rerank_gate_too_few_candidates**: shouldAttemptRerank() disables reranking when there are fewer than MIN_RERANK_CANDIDATES hits. [project]
- **rerank_gate_hard_query_types**: shouldAttemptRerank() enables reranking for hard queries with questionType federal_authority, amendment, or policy_variant. [project]
- **rerank_gate_hcwd_income_premium**: shouldAttemptRerank() enables reranking for HCWD income premium queries. [project]
- **rerank_gate_ambiguous_top_hits**: shouldAttemptRerank() enables reranking for ambiguous_top_hits when distinctDocuments.size >= 3 and scoreGap <= 0.2. [project]
- **retrieval_level_reranker_ab_invalid**: The standalone retrieval CLI cannot exercise reranker A/B reliably because it lacks route analysis, so it always skips with reason=not_hard_query in the reported run. [project]
- **retrieval_reranker_ab_result**: Retrieval eval with reranker on and off produced byte-identical precision, recall, MRR, and hit metrics on the 50 held-out questions. [project]
- **answer_level_reranker_eval_path**: The answer-level eval harness was updated so gate_reranker runs through answer_arm(), the same helper used by gate_verifier. [project]
- **reranker_dormant_for_many_queries**: The reranker is dormant for many agent-path queries because a HCWD query skipped with reason=deterministic_route. [project]
- **retrieval_baseline_quality**: The retrieval baseline is weak with recall@k 0.30, primary_hit_rate 48%, and precision 0.056. [project]
- **embeddings_gate_priority**: The embeddings gate is the actual bottleneck fix because it addresses the weak retrieval baseline. [project]
