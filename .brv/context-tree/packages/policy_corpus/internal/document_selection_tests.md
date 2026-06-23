---
title: Document Selection Tests
summary: Vitest suite covering document selection helpers, policy family grouping, HCWD narrowing, setting preference, variant scoring, and top-candidate selection.
tags: []
related: [packages/policy_corpus/internal/context.md, packages/policy_corpus/tests/section_predicates_test_suite.md]
keywords: []
createdAt: '2026-06-21T20:36:43.437Z'
updatedAt: '2026-06-21T20:36:43.437Z'
consolidated_at: '2026-06-23T00:54:27.544Z'
consolidated_from: [{date: '2026-06-23T00:54:27.544Z', path: packages/policy_corpus/internal/document_selection_tests.abstract.md, reason: 'The .md, .abstract.md, and .overview.md files all document the same document-selection test suite. The overview and abstract are derivative summaries of the main file, so this is redundant coverage that should be consolidated into the richer canonical markdown file.'}, {date: '2026-06-23T00:54:27.544Z', path: packages/policy_corpus/internal/document_selection_tests.overview.md, reason: 'The .md, .abstract.md, and .overview.md files all document the same document-selection test suite. The overview and abstract are derivative summaries of the main file, so this is redundant coverage that should be consolidated into the richer canonical markdown file.'}]
---
## Reason
Document test coverage and locked-in behaviors for internal/document-selection.ts

## Raw Concept
**Task:**
Document the test suite for internal document selection logic in packages/policy-corpus.

**Changes:**
- Added 31 Vitest tests for document-selection helpers
- Locked in document keying, coverage boosts, family grouping, HCWD narrowing, setting preferences, variant scoring, and top-candidate selection
- Expanded package test coverage from 153 to 239 total tests

**Files:**
- packages/policy-corpus/tests/internal/document-selection.test.ts
- packages/policy-corpus/src/internal/document-selection.ts
- packages/policy-corpus/src/types.ts
- packages/policy-corpus/src/internal/section-views.ts

**Flow:**
create fixtures -> exercise helper functions -> assert scoring and narrowing behavior -> verify candidate selection order

**Timestamp:** 2026-06-21

**Patterns:**
- `^clinical_policy::[^:]*::[^:]*$` - Document key format formed from document type, policy number, and title

## Narrative
### Structure
The test file is organized into fixture helpers followed by describe blocks for documentKeyForHit, computeDocumentCoverageBoosts, selectDocumentTitlesForExpansion, policyFamilyKey, looksLikeSiblingPolicySet, narrowInferredCoverageDocuments, scoreHcwdCoverageDocument, narrowHcwdCoverageDocuments, selectSettingPreferredDocuments, scoreVariantDocument, and pickTopDocumentCandidates.

### Dependencies
Tests rely on Vitest plus real types from src/types.ts and real helper implementations from src/internal/document-selection.ts.

### Highlights
The suite captures the intended ranking and narrowing behavior for policy-corpus document selection, including exact key formation, scoring formulas, and score-based deduplication.

### Rules
Use full document fixtures with sections:[] for selection tests. Keep scoring and narrowing expectations aligned with helper semantics. Preserve the 3-document cap unless an explicit limit is supplied.

## Facts
- **document_selection_test_suite**: A new Vitest suite was added for packages/policy-corpus tests/internal/document-selection.ts. [project]
- **document_selection_coverage**: The suite covers 11 of 12 exports from src/internal/document-selection.ts against real helpers. [project]
- **test_suite_size**: The suite contains 31 tests and increased the package test count from 153 to 239 during the session. [project]
- **document_key_for_hit_behavior**: documentKeyForHit returns type::policy::title, returns null only when all three identifying fields are empty, and partial keys like ::8C:: remain non-null. [project]
- **document_coverage_boost_formula**: computeDocumentCoverageBoosts uses matched-term count plus extra-hit count and caps the boost at 0.16. [project]
- **document_title_expansion_selection**: selectDocumentTitlesForExpansion sums hit.score plus coverageBoost per title, sorts descending, and returns the top 8 titles. [project]
- **policy_family_key_behavior**: policyFamilyKey uppercases policy numbers and strips a trailing suffix after a dash, with MA-2180 -> MA and 8c-1 -> 8C. [project]
- **sibling_policy_set_detection**: looksLikeSiblingPolicySet is true only when a policy family repeats. [project]
- **inferred_coverage_narrowing**: narrowInferredCoverageDocuments keeps the most common policy family when one repeats, otherwise it falls back to the first document. [project]
- **hcwd_coverage_scoring**: scoreHcwdCoverageDocument rewards the MA-2180 current document with score 3.0 and penalizes administrative-form titles such as Prior Authorization Form. [project]
- **hcwd_coverage_narrowing**: narrowHcwdCoverageDocuments returns only the top document unless the query mentions a year or chart, in which case it can keep up to two close documents within 0.75. [project]
- **setting_preference_selection**: selectSettingPreferredDocuments uses VARIANT_SETTING_TERMS and returns {documents, reason: null} when no setting or no matching title is found. [project]
- **variant_document_scoring**: scoreVariantDocument gives +2.5 for an exact policy-number match and -1.5 for change-notice or amendment documents. [project]
- **top_document_candidates**: pickTopDocumentCandidates sorts by score descending, deduplicates by document id, and caps results at FRAME_DOCUMENT_LIMIT = 3 unless an explicit limit is passed. [project]

## Merged Summary
Vitest suite documenting and locking in behavior for internal document-selection helpers in `packages/policy-corpus`. Covers 31 tests, expanding package coverage from 153 to 239 total tests, and exercises 11 of 12 exports from `src/internal/document-selection.ts`. Tests focus on keying, coverage boost scoring, title expansion selection, policy-family grouping, sibling-set detection, HCWD narrowing/scoring, setting-based preference, variant scoring, and top-candidate selection. Key document identity pattern is `^clinical_policy::[^:]*::[^:]*$`, representing type, policy number, and title. Several behaviors are explicitly bounded: coverage boost caps at 0.16, top title expansion returns 8 items, and top document candidates default to a 3-document cap unless overridden. Narrowing logic is context-sensitive: HCWD narrowing may keep up to two close documents when queries mention a year or chart, while inferred coverage narrowing prefers the most common policy family or falls back to the first document. Notable scoring rules include uppercase family normalization with suffix stripping, exact policy-number match bonuses, and penalties for amendment/change-notice documents or administrative-form titles. Structure of the test file follows fixture helpers first, then describe blocks for each helper function: `documentKeyForHit`, `computeDocumentCoverageBoosts`, `selectDocumentTitlesForExpansion`, `policyFamilyKey`, `looksLikeSiblingPolicySet`, `narrowInferredCoverageDocuments`, `scoreHcwdCoverageDocument`, `narrowHcwdCoverageDocuments`, `selectSettingPreferredDocuments`, `scoreVariantDocument`, and `pickTopDocumentCandidates`.