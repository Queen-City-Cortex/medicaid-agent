---
children_hash: b3ebe14a666f4d0e5933d4a4994a1dc78143a07a351554caf0b2c9c55d51c296
compression_ratio: 0.40771349862258954
condensation_order: 0
covers: [document_selection_tests.md]
covers_token_total: 1815
summary_level: d0
token_count: 740
type: summary
---
# d0 Structural Summary

## packages/policy-corpus: Document Selection Tests

`document_selection_tests.md` is the canonical test-suite entry for `packages/policy-corpus/src/internal/document-selection.ts`. It consolidates the former `.abstract.md` and `.overview.md` duplicates into one richer record.

### Scope and purpose
- Vitest coverage for internal document-selection helpers
- Locks in ranking, narrowing, deduplication, and preference behavior
- Uses real types from `src/types.ts` and real helper implementations from `src/internal/document-selection.ts`

### Coverage and impact
- 31 Vitest tests added
- Package test count increased from 153 to 239
- Covers 11 of 12 exports from `src/internal/document-selection.ts`

### Core behaviors documented
- `documentKeyForHit`: builds `type::policy::title`; returns `null` only when all identifiers are empty
- `computeDocumentCoverageBoosts`: combines matched-term count and extra-hit count; boost capped at `0.16`
- `selectDocumentTitlesForExpansion`: scores by `hit.score + coverageBoost`, sorts descending, returns top 8 titles
- `policyFamilyKey`: uppercases policy numbers and strips trailing dash suffixes, e.g. `MA-2180 -> MA`, `8c-1 -> 8C`
- `looksLikeSiblingPolicySet`: true only when a policy family repeats
- `narrowInferredCoverageDocuments`: keeps the most common repeating policy family, otherwise falls back to the first document
- `scoreHcwdCoverageDocument`: favors the MA-2180 current document and penalizes administrative-form titles
- `narrowHcwdCoverageDocuments`: usually returns the top document; may keep up to 2 close docs when queries mention a year or chart, using a `0.75` threshold
- `selectSettingPreferredDocuments`: uses `VARIANT_SETTING_TERMS`; returns `{ documents, reason: null }` when no setting or no matching title is found
- `scoreVariantDocument`: adds `+2.5` for exact policy-number matches and subtracts `-1.5` for change-notice/amendment docs
- `pickTopDocumentCandidates`: sorts by score descending, deduplicates by document id, and caps output at `FRAME_DOCUMENT_LIMIT = 3` unless overridden

### Structure of the test file
- Fixture helpers first
- Then describe blocks for:
  - `documentKeyForHit`
  - `computeDocumentCoverageBoosts`
  - `selectDocumentTitlesForExpansion`
  - `policyFamilyKey`
  - `looksLikeSiblingPolicySet`
  - `narrowInferredCoverageDocuments`
  - `scoreHcwdCoverageDocument`
  - `narrowHcwdCoverageDocuments`
  - `selectSettingPreferredDocuments`
  - `scoreVariantDocument`
  - `pickTopDocumentCandidates`

### Key constraints and patterns
- Document key pattern: `^clinical_policy::[^:]*::[^:]*$`
- Selection tests use full fixtures with `sections: []`
- Scoring and narrowing expectations are treated as contract-level behavior
- Preserve the 3-document cap unless an explicit limit is supplied

### Drill-down reference
- See `document_selection_tests.md` for the exact test coverage, fixture setup, and helper-by-helper assertions.