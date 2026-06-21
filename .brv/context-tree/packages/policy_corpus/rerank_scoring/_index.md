---
children_hash: 409c694cadef478d9db602b37ae16f762c4bcfeeffb6c66816bdb5a2bb359b56
compression_ratio: 0.596875
condensation_order: 0
covers: [rerank_scoring_refactor.md]
covers_token_total: 960
summary_level: d0
token_count: 573
type: summary
---
# Structural Summary: Rerank Scoring Refactor

## Overview
The `rerank_scoring_refactor.md` entry documents a refactor of `packages/policy-corpus/src/internal/rerank.ts` that decomposed `rerankRetrievalHit` from a monolithic score accumulator into composable, ordered scoring functions while preserving public APIs and exact floating-point behavior.

## Core Design Changes
- `rerankRetrievalHit` was split into about 20 named `HitScorer` functions.
- A shared `deriveHitFeatures` helper now computes per-hit values once.
- Scoring execution is centralized in an ordered `HIT_SCORERS` array.
- The flow is now: `buildRerankQueryContext -> deriveHitFeatures -> apply HIT_SCORERS in order -> return adjusted hit`.

## Behavior and Constraints
- Public signatures of `rerankRetrievalHit` and `buildRerankQueryContext` remain unchanged.
- Exact score behavior must be preserved for pinned tests in `tests/retrieval-ranking.test.ts`.
- Floating-point order is critical: grouped summation can change bit-level results, e.g. `1.935` vs `1.9349999999999998`.
- Scorers must fold deltas in original statement order.
- The early title boost for change notices must stay early; implementation and revision-header boosts must stay late.

## Scoring Structure
The rerank module separates:
- query-level intent flags
- derived hit features
- ordered heuristic scorers

Notable heuristic areas include:
- policy-number boosts
- federal-authority routing
- fee-schedule bucket scoring
- waiver application handling
- change-notice boosts
- title-quality penalties
- operational role alignment
- HCWD / waiver special cases
- boilerplate penalties

## Dependencies and Test Coverage
The refactor depends on:
- query-intent helpers
- scoring constants
- section predicates
- change-marker utilities
- document selection helpers

It is validated by exact-score assertions in `tests/retrieval-ranking.test.ts`, which use `toBe()` and therefore require bit-exact preservation of prior results.

## Key Facts for Drill-Down
- `rerank_scoring_refactor.md`: main refactor summary and rationale.
- `packages/policy-corpus/src/internal/rerank.ts`: implementation file.
- `tests/retrieval-ranking.test.ts`: pinned ranking tests enforcing exact values.
- `HitScorer` signature: `(score, hit, ctx, features) => number`.