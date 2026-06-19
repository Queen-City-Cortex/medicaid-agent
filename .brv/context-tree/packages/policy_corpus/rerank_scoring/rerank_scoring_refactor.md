---
title: Rerank Scoring Refactor
summary: rerankRetrievalHit was split into ordered HitScorer functions with derived query and hit features, preserving exact score behavior for pinned retrieval-ranking tests.
tags: []
related: [packages/policy-corpus/rerank_scoring/rerank_scoring.md]
keywords: []
createdAt: '2026-06-19T17:48:38.996Z'
updatedAt: '2026-06-19T17:48:38.996Z'
---
## Reason
Document the refactor of rerankRetrievalHit into ordered scorer functions while preserving floating-point behavior.

## Raw Concept
**Task:**
Refactor policy-corpus rerankRetrievalHit into composable scoring concerns without changing public signatures or pinned scores.

**Changes:**
- Split the monolithic 279-line score accumulator into named HitScorer functions
- Added deriveHitFeatures to compute shared per-hit values once
- Centralized scorer execution in an ordered HIT_SCORERS array
- Preserved the early title boost and late implementation/revision-header boost ordering

**Files:**
- packages/policy-corpus/src/internal/rerank.ts

**Flow:**
buildRerankQueryContext -> deriveHitFeatures -> apply HIT_SCORERS in order -> return adjusted hit

**Timestamp:** 2026-06-19T17:48:16.413Z

## Narrative
### Structure
The rerank module now separates query-level intent flags, derived hit features, and an ordered list of scoring concerns. Each scorer owns one heuristic, such as policy-number boosts, federal-authority routing, fee-schedule bucket scoring, waiver application handling, change-notice boosts, or title-quality penalties.

### Dependencies
The refactor depends on query-intent helpers, scoring constants, section predicates, change-marker utilities, and document selection helpers. It must continue to satisfy exact-score assertions in tests/retrieval-ranking.test.ts.

### Highlights
Public signatures of rerankRetrievalHit and buildRerankQueryContext remain unchanged. Exact floating-point order matters because grouped summation can change bit-level results such as 1.935 versus 1.9349999999999998.

### Rules
Scorers must fold deltas in the original statement order. The title boost for change notices must stay early, while implementation and revision-header boosts must stay late.

## Facts
- **rerank_refactor**: policy-corpus rerankRetrievalHit was decomposed from a 279-line score accumulator into about 20 named HitScorer functions driven by an ordered HIT_SCORERS array and a deriveHitFeatures helper. [project]
- **hit_scorer_signature**: HitScorer functions share the signature (score, hit, ctx, features) => number and must fold deltas in the original statement order. [project]
- **retrieval_ranking_tests**: Tests in tests/retrieval-ranking.test.ts pin exact pre-refactor scores with toBe(), so summing grouped deltas breaks float bit-equality. [project]
- **float_precision_mismatch**: An observed mismatch during refactoring was 1.935 versus 1.9349999999999998. [project]
- **public_api_stability**: Public signatures of rerankRetrievalHit and buildRerankQueryContext remain unchanged. [project]
- **change_notice_ordering**: The title boost for change notices must stay early, while implementation and revision-header boosts must stay late. [project]
- **query_context_efficiency**: buildRerankQueryContext evaluates query-level intent predicates once per query instead of recomputing them for every hit. [project]
- **rerank_heuristics**: rerankRetrievalHit applies per-hit boosts and penalties on top of the backend score for policy-number matches, federal-authority routing, operational role alignment, fee-schedule buckets, change-notice markers, HCWD/waiver special cases, and boilerplate penalties. [project]
- **rerank_file**: The file documented is packages/policy-corpus/src/internal/rerank.ts. [project]
- **retrieval_ranking_test_file**: The related test file is tests/retrieval-ranking.test.ts. [project]
