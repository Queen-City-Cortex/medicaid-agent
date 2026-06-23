---
children_hash: 08470191fb5f0154d561f7a21af59317220988e4aa6ec0c0976da386653b8e8d
compression_ratio: 0.31997084548104954
condensation_order: 0
covers: [section_predicates_test_suite.md]
covers_token_total: 1372
summary_level: d0
token_count: 439
type: summary
---
## Policy-Corpus Section Predicate Test Coverage

- **Section Predicates Test Suite** documents the internal unit coverage for `packages/policy-corpus/src/internal/section-predicates.js`, with **30 tests** spanning **21 exported pure predicates**.
- The suite raises the overall policy-corpus test count to **198 tests** and is centered on locking in exact helper behavior and edge cases.

### Coverage structure
The test file groups assertions into these areas:
- hit text and role predicates
- section shape predicates
- prior-authorization predicates
- title classification predicates
- process/administrative predicates
- year and premium helpers
- title-cluster extraction helpers

### Key behaviors preserved
Drill down in **Section Predicates Test Suite** for the exact rules, including:
- `isPriorAuthExceptionSection` short-circuits `true` for hardcoded section number `3.2.3`
- `isAdministrativeFormTitle` excludes `"Change Notice"` even though it contains `"notice"`
- `isAttachmentTitle` requires `"attachment "` with a separator, so `"Attachments"` is `false`
- `isGenericSectionTitle` only matches exact `"Information"` and `"Related Clinical Coverage Policies"`
- `isBoilerplateTitle` uses `normalizeTitleKey` to strip trailing colon/space
- `isTelehealthServiceTableSection` requires telehealth-eligible phrasing and no `sectionNumber`
- `includesCalendarYear` matches only `20xx` tokens, excluding `19xx`
- `extractTitleClusterTerms` keeps tokens of 4+ characters, removes `TITLE_CLUSTER_STOPWORDS`, lowercases, and dedupes

### Relationships
- Related reference: **`packages/policy_corpus/internal/document_selection_tests.md`**
- The suite is positioned as a companion to broader internal document-selection and predicate logic coverage.