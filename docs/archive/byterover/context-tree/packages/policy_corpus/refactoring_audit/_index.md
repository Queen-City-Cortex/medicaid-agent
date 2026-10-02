---
children_hash: b71936c90f392dfe4a7d92d74020d7a28f0243299b175a842565a8574225721e
compression_ratio: 0.8156862745098039
condensation_order: 0
covers: [refactoring_audit_2026_07_05.md]
covers_token_total: 765
summary_level: d0
token_count: 624
type: summary
---
# Refactoring Audit Overview

## Scope
`refactoring_audit_2026_07_05.md` documents a refactoring audit for **policy-corpus ranking** and **waiver-authority logic**. It splits the work into two linked concerns:

1. **Exact-float score pinning / ordered-fold invariants**
2. **Waiver-authority section-number predicate drift**

## Key Findings

### 1) Score pinning is broader than one test file
The audit flags multiple places where exact-float score assertions must remain **ordered-fold house style** and must **not be regrouped**:
- `packages/policy_corpus/src/internal/term-lists.ts`
- `packages/policy_corpus/src/frame/federal-authority.ts`
- `packages/policy_corpus/src/frame/rebalance/federal-authority.ts`
- `packages/policy_corpus/tests/retrieval/collector.test.ts`

Related facts note that float-score pinning also appears in:
- `internal/document-selection.ts`
- `frame/coverage-sections/selection/scoring.ts`
- `retrieval/collector.ts`

The main dependency is that waiver-authority cleanup must not disturb these pinned float-addition paths.

### 2) Waiver-authority rules are inconsistent
The audit identifies **predicate drift** in how waiver-authority section numbers are encoded across:
- `term-lists.ts`
- `federal-authority.ts`
- `rebalance/federal-authority.ts`

A highlighted ambiguity is whether **441.35x** qualifies under waiver-authority rules.

## Recommended Architectural Direction
The audit recommends consolidating waiver-authority logic into a single predicate:
- create `isWaiverAuthoritySection()` in `section-predicates.ts`

This is the preferred normalization point while preserving the existing ordered-fold float logic.

## Structural Flow
`audit context -> identify pinning constraints -> identify predicate drift -> consolidate authority predicate`

## Drill-Down References
- `refactoring_audit_2026_07_05.md` — full audit context, rules, and facts
- `packages/policy_corpus/src/internal/term-lists.ts.md` — float pinning and waiver-authority encoding
- `packages/policy_corpus/src/frame/federal-authority.ts.md` — authority logic drift
- `packages/policy_corpus/src/frame/rebalance/federal-authority.ts.md` — rebalance-side authority logic
- `packages/policy_corpus/coverage_sections/coverage_candidate_profiles_table_refactor.md` — related refactoring area
- `packages/policy_corpus/tests/section_predicates_test_suite.md` — predicate test coverage
- `packages/policy_corpus/tests/retrieval/collector.test.ts` — pinned score assertions in collector tests