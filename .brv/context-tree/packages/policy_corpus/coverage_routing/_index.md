---
children_hash: 8bf84edd6fa4003edd5454c4cf483a0c076e947a9a1af8508b4d08f9216be0ed
compression_ratio: 0.9914893617021276
condensation_order: 0
covers: [coverage_routing.md]
covers_token_total: 470
summary_level: d0
token_count: 466
type: summary
---
## Structural Overview

This level summarizes the coverage routing behavior captured in **coverage_routing.md** and its direct relationship to document selection and frame assembly.

- **coverage_routing.md** documents the core routing flow for policy coverage questions:  
  `lookup documents -> infer documents from hits -> apply setting preference -> narrow -> return routing documents`
- The routing logic now applies **setting-scoped document preference before inferred narrowing**, using `selectSettingPreferredDocuments` ahead of `narrowInferredCoverageDocuments`.
- When a query explicitly names a care setting and titles match, the routing layer returns only **setting-matching documents**.
- If no sibling policy variant frame exists, the **setting preference reason** is carried forward into `variantReasoning`.

## Key Architectural Decisions

- **Ordering matters:** setting preference must run **before** narrowing.
- `narrowInferredCoverageDocuments` still functions as the final reducer, keeping only the raw-score winner for non-sibling sets.
- The fix prevents distractor variants such as **CAP/DA** from displacing the intended **congregate PCS** document in adult-care-home questions.

## Dependencies and Related Entries

- Depends on:
  - **collectPolicyDocumentsFromHits**
  - **narrowHcwdCoverageDocuments**
  - **narrowInferredCoverageDocuments**
  - **selectSettingPreferredDocuments**
- Related drill-down entries:
  - **packages/policy_corpus/document_selection.md** — document preference and selection behavior
  - **packages/policy_corpus/coverage_frame_assembly.md** — frame assembly context that consumes routing output

## Source Context

- Implemented across:
  - `packages/policy-corpus/src/frame/context/routing.ts`
  - `packages/policy-corpus/src/internal/document-selection.ts`
- Timestamped as of **2026-06-12T20:47:11.146Z**