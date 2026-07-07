---
children_hash: ae4bc901675838211d9dc442d43685b726dd2bf2ee97858997825776a19192d6
compression_ratio: 0.5631868131868132
condensation_order: 0
covers: [refactoring_audit_2026_07_05.md]
covers_token_total: 728
summary_level: d0
token_count: 410
type: summary
---
## Refactoring Audit 2026-07-05

Structural audit of **policy-corpus** refactoring risk points. Two clusters matter: **pinned float-score assertions** and **waiver-authority predicate drift**.

### Key scope
- **Files:** `packages/policy_corpus/src/internal/term-lists.ts`, `packages/policy_corpus/src/frame/federal-authority.ts`, `packages/policy_corpus/src/frame/rebalance/federal-authority.ts`, `packages/policy_corpus/tests/retrieval/collector.test.ts`
- **Flow:** audit context → identify pinning constraints → identify predicate drift → consolidate authority predicate

### Critical findings
- **Float score pinning is house-style code**: ordered float additions must not be regrouped.
- Exact-float assertions are broader than one test file:
  - `internal/document-selection.ts` / `document-selection.test.ts`
  - `frame/coverage-sections/selection/scoring.ts` / `scoring.test.ts`
  - `retrieval/collector.ts` / `collector.test.ts` (bit-equality assertions and `toBeCloseTo(..., 10)`)
- **Waiver-authority section rules are inconsistent** across:
  - `packages/policy_corpus/src/internal/term-lists.ts`
  - `packages/policy_corpus/src/frame/federal-authority.ts`
  - `packages/policy_corpus/src/frame/rebalance/federal-authority.ts`
- The disputed boundary includes whether **441.35x** qualifies.

### Recommended structure
- Keep all pinned float-fold sections unchanged.
- Consolidate waiver logic into a single predicate: **`isWaiverAuthoritySection()`** in `section-predicates.ts`.

### Drill-down entries
- **Refactoring Audit 2026-07-05** — detailed audit notes, examples, and facts on score pinning and waiver-authority drift.