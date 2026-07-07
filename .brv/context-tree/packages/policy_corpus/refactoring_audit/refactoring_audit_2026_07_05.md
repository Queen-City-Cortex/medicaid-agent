---
title: Refactoring Audit 2026-07-05
tags: []
related: [packages/policy_corpus/src/internal/term-lists.ts.md, packages/policy_corpus/src/frame/federal-authority.ts.md, packages/policy_corpus/src/frame/rebalance/federal-authority.ts.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-06T02:03:20.688Z'
updatedAt: '2026-07-06T02:03:20.688Z'
---
## Raw Concept
**Task:**
Refactoring audit for policy-corpus ranking and waiver-authority logic

**Changes:**
- Identified multiple exact-float score assertions that must remain ordered-fold house style
- Identified inconsistent waiver-authority section-number encodings across multiple files
- Recommended consolidating waiver-authority logic into a single predicate

**Files:**
- packages/policy-corpus/src/internal/term-lists.ts
- packages/policy-corpus/src/frame/federal-authority.ts
- packages/policy-corpus/src/frame/rebalance/federal-authority.ts
- packages/policy-corpus/tests/retrieval/collector.test.ts

**Flow:**
audit context -> identify pinning constraints -> identify predicate drift -> consolidate authority predicate

**Timestamp:** 2026-07-05

**Author:** refactoring audit context

## Narrative
### Structure
The audit separates two concerns: score-pinning invariants in retrieval tests and waiver-authority predicate drift in federal-authority logic.

### Dependencies
The waiver-authority fix depends on keeping ordered float additions unchanged in the identified scoring paths.

### Highlights
The audit explicitly warns that float regrouping is prohibited in the pinned score sections and that waiver-authority rules disagree on whether 441.35x qualifies.

### Rules
Treat all of these as ordered-fold house-style code: never regroup float additions there.

### Examples
Example consolidation target: create one isWaiverAuthoritySection() in section-predicates.ts.

## Facts
- **float_score_pinning_scope**: Exact-float score pinning is not limited to tests/retrieval-ranking.test.ts. [project]
- **document_selection_float_assertions**: internal/document-selection.ts has bit-equality score assertions at document-selection.test.ts:113 and document-selection.test.ts:212. [project]
- **coverage_scoring_float_assertions**: frame/coverage-sections/selection/scoring.ts has a bit-equality score assertion at scoring.test.ts:113-114. [project]
- **collector_float_assertions**: retrieval/collector.ts has bit-equality score assertions at collector.test.ts:114 and collector.test.ts:164, plus toBeCloseTo(..., 10). [project]
- **waiver_authority_section_rules**: Waiver-authority section-number knowledge is encoded in four inconsistent ways across term-lists.ts, federal-authority.ts, and rebalance/federal-authority.ts. [project]
- **waiver_authority_consolidation_target**: The consolidation target is to create one isWaiverAuthoritySection() in section-predicates.ts while keeping float folds in place. [project]
