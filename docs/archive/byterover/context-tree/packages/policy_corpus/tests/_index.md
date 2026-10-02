---
children_hash: 22ee99c2286a53db879c2cebdbcfd636ce19652663b3e619f65f5943730be8f0
compression_ratio: 0.34148094895758446
condensation_order: 0
covers: [section_predicates_test_suite.md]
covers_token_total: 1391
summary_level: d0
token_count: 475
type: summary
---
## Section Predicates Test Suite

This entry documents the canonical unit suite for `packages/policy-corpus/src/internal/section-predicates.js`, added at `packages/policy-corpus/tests/internal/section-predicates.test.ts`. It adds 30 tests covering 21 exported pure predicates and raises the overall policy-corpus suite total to 198 tests.

### Scope and organization
Coverage is structured by predicate family:
- hit text and role predicates
- section shape predicates
- prior-authorization predicates
- title classification predicates
- process/administrative predicates
- year and premium helpers
- title-cluster extraction helpers

See `section_predicates_test_suite.md` for the full behavior lock-in and exact assertions.

### Key locked behaviors
The suite preserves several exact edge cases and helper semantics:
- `isPriorAuthExceptionSection` returns `true` immediately for hardcoded section number `3.2.3`
- `isAdministrativeFormTitle` excludes `Change Notice` even though it contains `notice`
- `isAttachmentTitle` requires `attachment ` with a separator, so `Attachments` is `false`
- `isGenericSectionTitle` matches only exact titles `Information` and `Related Clinical Coverage Policies`
- `isBoilerplateTitle` normalizes titles by stripping trailing colon and space
- `isTelehealthServiceTableSection` requires a telehealth-eligible phrase and no `sectionNumber`
- `includesCalendarYear` matches only `20xx` tokens and excludes `19xx`
- `extractTitleClusterTerms` keeps tokens of length 4+, removes `TITLE_CLUSTER_STOPWORDS`, dedupes, and lowercases

### Dependencies and related context
- Uses `vitest`
- Depends on `AnswerFrameSection` and `CorpusRetrievalHit` types from `packages/policy-corpus/src/types.js`
- Related drill-down entries:
  - `packages/policy_corpus/internal/document_selection_tests.md`
  - `packages/policy_corpus/refactoring_audit/refactoring_audit_2026_07_05.md`