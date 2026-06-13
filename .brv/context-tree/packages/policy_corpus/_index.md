---
children_hash: 8cdbede826c9250332bc34f4436f71569585ef8f243c7a8f81f10921155c3137
compression_ratio: 0.4890691114245416
condensation_order: 1
covers: [coverage_frame_assembly/_index.md, coverage_routing/_index.md, document_selection/_index.md, frame/_index.md, golden_dataset_de_contamination_and_retrieval_constants.md]
covers_token_total: 2836
summary_level: d1
token_count: 1387
type: summary
---
# Policy Corpus Structural Overview

This layer covers the policy-corpus frame pipeline, with three tightly related areas: routing, document selection, and frame assembly. The main theme is that query intent and care-setting specificity now control how documents are selected, narrowed, paired, and assembled into the final coverage frame.

## Coverage routing and setting preference
- **`coverage_routing/_index.md`** describes the routing flow:
  `lookup documents -> infer documents from hits -> apply setting preference -> narrow -> return routing documents`
- Routing now applies **setting-scoped document preference before inferred narrowing** via `selectSettingPreferredDocuments`, ahead of `narrowInferredCoverageDocuments`.
- If a query explicitly names a care setting and titles match, only setting-matching documents are returned.
- When no sibling policy variant frame exists, the **setting preference reason** is carried into `variantReasoning`.
- Key dependency chain:
  - `collectPolicyDocumentsFromHits`
  - `narrowHcwdCoverageDocuments`
  - `narrowInferredCoverageDocuments`
  - `selectSettingPreferredDocuments`
- Source files: `packages/policy-corpus/src/frame/context/routing.ts`, `packages/policy-corpus/src/internal/document-selection.ts`

## Document selection and narrowing
- **`document_selection/_index.md`** focuses on document-level coverage boosts, title expansion, variant scoring, HCWD scoring, and narrowing.
- The key architectural change is `selectSettingPreferredDocuments(queryLower, documents)`, which prioritizes documents matching the setting named in the query.
- Setting preference runs **before** `narrowInferredCoverageDocuments`, preventing irrelevant distractors from outranking the intended policy document when the query includes a setting.
- `variantReasoning` falls back to the setting-preference reason when no sibling variant frame exists.
- Processing flow:
  `query terms -> document scoring -> optional setting preference -> narrowing -> frame assembly`
- Depends on `VARIANT_SETTING_TERMS`, title matching, and existing narrowing behavior.

## Coverage frame assembly
- **`coverage_frame_assembly/_index.md`** documents how the final coverage answer frame is assembled from routed documents and evidence candidates.
- The pipeline merges:
  - base hits
  - HCWD history hits
  - routed documents
  - section candidates
- These are organized into:
  - primary evidence
  - supporting evidence
  - avoid evidence
- Core rule: for sibling sets, the variant frame takes precedence; otherwise, `settingPreference.documents` become `preferredRoutingDocuments`.
- This ensures setting-specific routing remains authoritative even when non-sibling documents have higher raw scores.
- Key files: `packages/policy-corpus/src/frame/pipelines/coverage.ts`, `packages/policy-corpus/src/frame/context/routing.ts`, `packages/policy-corpus/src/internal/document-selection.ts`

## Frame pipeline context
- **`frame/_index.md`** covers the broader policy corpus frame pipeline, including coverage selection, graph fixtures, and federal authority handling.
- **Coverage Selection and Graph Fixtures**
  - Frame code is split across `packages/policy-corpus/src/frame/coverage/candidates.ts`, `coverage/selection.ts`, and `federal-authority.ts`
  - `SectionCandidate.score` was removed; selection is now positional rather than score-field driven
  - Coverage selection uses a 5-stage pipeline:
    1. score coverage sections
    2. collect/group by coverage flags
    3. build initial selection
    4. build anchors
    5. assemble final sections by merging primary, supporting, and avoid sections
  - Shared strict Neo4j fixtures centralize typed record builders, query matchers, corpus/session stubs, and handler execution checks
  - Fixtures fail loudly on missing fields, unused handlers, and unexpected extra queries unless `allowExtraQueries` is set
- **Federal Authority Pairing and Rebalance**
  - Retrieval explicitly pairs statute and regulation when query intent indicates an authority citation
  - Driven by `asksForAuthorityCitation` in `query-intent.ts` and `authorityCitationQuery`
  - Adds title boosting, statute/regulation pairing, and CFR authority-first candidate behavior
  - Evidence resolution steps:
    1. `buildFederalAuthoritySignals`
    2. `collectFederalAuthorityEvidence`
    3. `collectFederalImplementationEvidence`
    4. `buildFederalAuthorityCandidateSets`
  - Rebalance hints adjust primary/supporting/avoid sections for waiver authority, SPA, and EPSDT
  - Statute retention is preserved so one `federal_statute` section remains visible even when regulation hints dominate
  - Ordering matters: `WAIVER_AUTHORITY_HINT` must run before `WAIVER_HINT`
  - Example intent mappings:
    - 1915(c) HCBS waiver authority -> `42 CFR Part 441 Subpart G`
    - SPA timeliness/submission -> `42 CFR 430`
    - EPSDT -> `42 CFR 441 Subpart B`

## Cross-cutting patterns
- The pipeline is increasingly **intent-aware**: query intent determines which sections are surfaced, paired, or demoted.
- Authority questions favor official section headings over body mentions.
- Test infrastructure is intentionally strict and fails loudly on missing data, unexpected queries, and unused handlers.
- A noted rough edge: the federal collector scans `federal_regulation` and `federal_statute` together, which can mask per-docType test coverage gaps.

## Related drill-down entries
- `coverage_routing/_index.md`
- `document_selection/_index.md`
- `coverage_frame_assembly/_index.md`
- `frame/_index.md`