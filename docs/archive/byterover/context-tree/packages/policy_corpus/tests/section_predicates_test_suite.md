---
title: Section Predicates Test Suite
summary: Full unit suite for section-predicates.ts covering 21 exported predicates, their exact matching rules, exclusions, and helper semantics across 30 tests.
tags: []
related: [packages/policy_corpus/internal/document_selection_tests.md, packages/policy_corpus/refactoring_audit/refactoring_audit_2026_07_05.md]
keywords: []
createdAt: '2026-06-21T20:11:32.876Z'
updatedAt: '2026-06-21T20:11:32.876Z'
consolidated_at: '2026-06-23T00:54:27.546Z'
consolidated_from: [{date: '2026-06-23T00:54:27.546Z', path: packages/policy_corpus/tests/section_predicates_test_suite.abstract.md, reason: 'These three files all describe the same section-predicates test suite, with the abstract and overview duplicating the canonical test documentation. They should be consolidated to avoid redundant parallel descriptions of the same suite.'}, {date: '2026-06-23T00:54:27.546Z', path: packages/policy_corpus/tests/section_predicates_test_suite.overview.md, reason: 'These three files all describe the same section-predicates test suite, with the abstract and overview duplicating the canonical test documentation. They should be consolidated to avoid redundant parallel descriptions of the same suite.'}]
---
## Reason
Document the full unit suite and the behaviors it locks in for section predicate helpers

## Raw Concept
**Task:**
Document the new internal test coverage for section predicate helpers in the policy-corpus package.

**Changes:**
- Added a full unit suite for packages/policy-corpus/src/internal/section-predicates.js
- Locked in edge-case behaviors for title classification and section detection
- Raised the policy-corpus suite total to 198 tests

**Files:**
- packages/policy-corpus/tests/internal/section-predicates.test.ts

**Flow:**
fixture setup -> predicate invocation -> behavior assertions -> suite coverage increase

**Timestamp:** 2026-06-21T20:10:51.437Z

**Author:** policy-corpus test suite

## Narrative
### Structure
The test file organizes coverage into hit text and role predicates, section shape predicates, prior-authorization predicates, title classification predicates, process/administrative predicates, year and premium helpers, and title-cluster extraction helpers.

### Dependencies
Uses vitest plus AnswerFrameSection and CorpusRetrievalHit types from packages/policy-corpus/src/types.js.

### Highlights
The suite preserves exact edge cases such as hardcoded section 3.2.3, the explicit Change Notice exclusion, attachment separator handling, exact generic title matching, and year-token detection limited to 20xx values.

### Rules
Preserve these exact behaviors: isPriorAuthExceptionSection short-circuits true on hardcoded sectionNumber '3.2.3'; isAdministrativeFormTitle returns false for 'change notice' even though it contains 'notice'; isAttachmentTitle needs 'attachment ' WITH separator so 'Attachments' is false; isGenericSectionTitle only matches exact 'information'/'related clinical coverage policies'; isBoilerplateTitle uses normalizeTitleKey (strips trailing colon/space); isTelehealthServiceTableSection requires telehealth-eligible phrase AND no sectionNumber; includesCalendarYear is /\b20\d{2}\b/ (19xx excluded); extractTitleClusterTerms keeps tokens>=4 chars minus TITLE_CLUSTER_STOPWORDS, deduped+lowercased.

## Facts
- **test_count**: The file packages/policy-corpus/tests/internal/section-predicates.test.ts adds a full unit suite with 30 tests. [project]
- **predicate_count**: The suite covers 21 exported pure predicates in packages/policy-corpus/src/internal/section-predicates.js. [project]
- **suite_total_tests**: The policy-corpus suite now has 198 tests. [project]
- **prior_auth_exception_section**: isPriorAuthExceptionSection short-circuits true on hardcoded sectionNumber 3.2.3. [project]
- **administrative_form_title_exclusion**: isAdministrativeFormTitle returns false for Change Notice even though it contains notice. [project]
- **attachment_title_rule**: isAttachmentTitle requires the prefix attachment with a separator, so Attachments is false. [project]
- **generic_section_title_rule**: isGenericSectionTitle only matches the exact titles Information and Related Clinical Coverage Policies. [project]
- **boilerplate_title_normalization**: isBoilerplateTitle uses normalizeTitleKey to strip trailing colon and space. [project]
- **telehealth_service_table_rule**: isTelehealthServiceTableSection requires telehealth-eligible phrasing and no sectionNumber. [project]
- **calendar_year_rule**: includesCalendarYear matches only 20xx year tokens and excludes 19xx values. [project]
- **title_cluster_terms_rule**: extractTitleClusterTerms keeps tokens with at least four characters, removes TITLE_CLUSTER_STOPWORDS, dedupes, and lowercases. [project]

## Merged Summary
This suite adds 30 tests covering 21 section-predicate helpers in policy-corpus, locking in exact edge-case rules for title classification, section detection, year matching, and title-cluster extraction. Coverage is organized by predicate category: hit text and role predicates, section-shape predicates, prior-authorization predicates, title-classification predicates, process/administrative predicates, year and premium helpers, and title-cluster extraction helpers. The file also preserves exact behavior for hardcoded section `3.2.3`, Change Notice exclusion, attachment separator handling, exact generic-title matching, and `20xx`-only year detection, plus helper semantics for boilerplate normalization, telehealth table detection, and title-cluster term extraction.