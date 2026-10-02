---
children_hash: 78fbe8706dced6bf7a6aa910b847e9817637e1633c80483f12e7bc9f2fd94972
compression_ratio: 0.9065040650406504
condensation_order: 0
covers: [document_selection_and_narrowing.md]
covers_token_total: 492
summary_level: d0
token_count: 446
type: summary
---
# d0 Structural Summary

## Document Selection and Narrowing

Structural overview of document-level selection, narrowing, and setting-preference behavior in policy corpus routing. See **Document Selection and Narrowing** for the full logic and file references.

### Core responsibilities
- Handles document coverage boosts
- Expands titles for matching
- Computes variant scoring
- Applies HCWD coverage scoring
- Narrows inferred coverage documents after scoring

### Key architectural change
- Added `selectSettingPreferredDocuments(queryLower, documents)` to prioritize documents matching the care setting named in the query.
- Setting preference is applied **before** `narrowInferredCoverageDocuments`.
- This protects congregate/in-home policy documents from being outranked by irrelevant distractors when the query explicitly names the setting.
- `variantReasoning` now falls back to the setting preference reason when no sibling variant frame exists.

### Processing flow
`query terms -> document scoring -> optional setting preference -> narrowing -> frame assembly`

### Dependencies and relationships
- Setting preference depends on `VARIANT_SETTING_TERMS`
- It also depends on title matching and existing narrowing behavior
- Existing narrowing keeps only the raw-score winner for non-sibling sets
- Related routing/assembly areas:
  - `packages/policy_corpus/coverage_routing.md`
  - `packages/policy_corpus/coverage_frame_assembly.md`

### Drill-down focus
- **Document Selection and Narrowing**: selector behavior, narrowing order, and setting preference rules
- Relevant source files:
  - `packages/policy-corpus/src/internal/document-selection.ts`
  - `packages/policy-corpus/src/frame/context/routing.ts`
  - `packages/policy-corpus/src/frame/pipelines/coverage.ts`