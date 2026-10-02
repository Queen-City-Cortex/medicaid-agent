---
children_hash: deb4c43f425c441fe16278c68bd00eacfb641ab7041adfd847d66459ad4ef261
compression_ratio: 0.4240609689711486
condensation_order: 0
covers: [document_selection_tests.md]
covers_token_total: 1837
summary_level: d0
token_count: 779
type: summary
---
## packages/policy_corpus / document selection tests

A Vitest suite in `document_selection_tests.md` locks in the behavior of internal document-selection helpers in `packages/policy-corpus`. It covers 31 tests, expands package coverage from 153 to 239 total tests, and exercises 11 of 12 exports from `src/internal/document-selection.ts` using real helpers and types.

### What the suite covers
- Document identity and keying via `documentKeyForHit`
- Coverage boost computation via `computeDocumentCoverageBoosts`
- Expansion candidate ranking via `selectDocumentTitlesForExpansion`
- Policy-family normalization and sibling-set detection via `policyFamilyKey` and `looksLikeSiblingPolicySet`
- Inferred coverage narrowing via `narrowInferredCoverageDocuments`
- HCWD scoring and narrowing via `scoreHcwdCoverageDocument` and `narrowHcwdCoverageDocuments`
- Setting-based preference via `selectSettingPreferredDocuments`
- Variant scoring via `scoreVariantDocument`
- Final candidate ranking and deduplication via `pickTopDocumentCandidates`

### Key structural rules and behaviors
- Document keys follow `^clinical_policy::[^:]*::[^:]*$`
- `documentKeyForHit` returns `null` only when all identifying fields are empty; partial keys remain non-null
- Coverage boosts combine matched-term count and extra-hit count, capped at `0.16`
- `selectDocumentTitlesForExpansion` sums `hit.score + coverageBoost`, sorts descending, and returns the top 8 titles
- `policyFamilyKey` uppercases policy numbers and strips trailing dash suffixes, e.g. `MA-2180 -> MA`, `8c-1 -> 8C`
- `looksLikeSiblingPolicySet` is true only when a policy family repeats
- `narrowInferredCoverageDocuments` keeps the most common repeated family, otherwise falls back to the first document
- `scoreHcwdCoverageDocument` favors the `MA-2180` current document and penalizes administrative-form titles such as `Prior Authorization Form`
- `narrowHcwdCoverageDocuments` normally returns the top document, but may keep up to two close documents within `0.75` when the query mentions a year or chart
- `selectSettingPreferredDocuments` uses `VARIANT_SETTING_TERMS` and returns `{ documents, reason: null }` when no setting or no matching title is found
- `scoreVariantDocument` adds `+2.5` for an exact policy-number match and subtracts `-1.5` for change-notice or amendment documents
- `pickTopDocumentCandidates` sorts by score descending, deduplicates by document id, and caps results at `FRAME_DOCUMENT_LIMIT = 3` unless a limit is supplied

### File organization
The test file is structured as fixture helpers first, followed by describe blocks for each helper function. It relies on `src/types.ts`, `src/internal/document-selection.ts`, and `src/internal/section-views.ts`.

### Drill-down references
- `document_selection_tests.md` for the full suite narrative and locked-in expectations
- Related coverage and selection behavior is linked to `packages/policy_corpus/internal/context.md`, `packages/policy_corpus/tests/section_predicates_test_suite.md`, and `packages/policy_corpus/coverage_sections/coverage_candidate_profiles_table_refactor.md`