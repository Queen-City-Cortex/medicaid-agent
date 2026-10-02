---
children_hash: 7ea20a9ca5c606d6f61b814a043b688d337b4a087ba080d82a33653bf5b5f9fe
compression_ratio: 0.8012684989429175
condensation_order: 0
covers: [coverage_frame_assembly.md]
covers_token_total: 473
summary_level: d0
token_count: 379
type: summary
---
# d0 Structural Summary

## Coverage frame assembly
- **Coverage Frame Assembly** documents how the final coverage answer frame is assembled from routed documents and evidence candidates.
- Core decision: **setting-preferred routing documents** are now authoritative when no sibling variant frame takes precedence.
- The pipeline uses `selectSettingPreferredDocuments` to scope `preferredRoutingDocuments`, and `variantReasoning` falls back to the setting preference reason when no variant frame exists.
- Key files: `packages/policy-corpus/src/frame/pipelines/coverage.ts`, `packages/policy-corpus/src/frame/context/routing.ts`, `packages/policy-corpus/src/internal/document-selection.ts`.

### Structure
- The coverage pipeline merges:
  - base hits
  - HCWD history hits
  - routed documents
  - section candidates
- These are organized into:
  - primary evidence
  - supporting evidence
  - avoid evidence

### Dependencies and relationships
- Depends on:
  - route selection
  - wildcard widening policy
  - sibling policy variant detection
  - document-scoped preference logic
- Related drill-down entries:
  - `coverage_routing.md`
  - `document_selection.md`

### Highlights
- Setting-specific routing is preserved even when non-sibling documents have higher raw scores.
- Authoritative candidates include scoped routing documents with a policy-number lookup reason.

### Rule
- For sibling sets, the variant frame takes precedence; otherwise, `settingPreference.documents` become `preferredRoutingDocuments`.