---
children_hash: e79e7ce1043dd5beb46fc6300f75ebdcd1eae10a417ac7113885cbb351e43df3
compression_ratio: 0.6723716381418093
condensation_order: 0
covers: [coverage_candidate_profiles_table_refactor.md]
covers_token_total: 818
summary_level: d0
token_count: 550
type: summary
---
# d0 Structural Summary

## Coverage Candidate Profiles Table Refactor
- **Entry:** `coverage_candidate_profiles_table_refactor.md`
- Refactors `packages/policy-corpus/src/frame/coverage-sections/candidates.ts` from many clone-heavy `buildXxxProfiles` functions into **two declarative, ordered rule tables**:
  - `COVERAGE_PRIMARY_PROFILE_RULES` (9 rules)
  - `COVERAGE_SUPPORTING_PROFILE_RULES` (11 rules)
- The module still exposes the core pipeline:
  - `buildCoverageQueryFlags`
  - `buildCoverageDocumentCandidateProfiles`
  - `collectCoverageDocumentHydratedCandidates`
- The processing flow is:
  - `query flags -> derived signals -> ordered rule tables -> profilesFor() -> collectProfiles() -> uniqueBy(section.id)`
- Behavior is preserved by keeping profile builders static with `makeSectionProfile` and `makeLimitationProfile`.

### Key structural decisions
- **Order is load-bearing**: downstream section selection is positional, and `collectProfiles()` dedupes with **first-wins** on `section.id`.
- `profilesFor()` iterates each rule table in order with `filter + flatMap` and returns copied profile arrays per call.
- Profile objects are module-level shared objects created once at import time; this is safe because consumers only read them.
- The refactor aligns with the pattern used in `rebalance/federal-authority.ts` via `FEDERAL_QUERY_HINTS`.

### Dependencies
- Shared term constants
- Query detectors
- `makeSectionProfile` / `makeLimitationProfile`
- `FrameContext` collection methods

### Coverage and rule intent
- Primary rules cover:
  - general criteria
  - yes/no coverage
  - pediatric
  - modification
  - telehealth
  - certification
  - HCWD
  - direct coverage detail
  - congregate PCS queries
- Supporting rules add:
  - not-covered
  - eligibility scope
  - additional yes/no coverage
  - pediatric
  - modification
  - telehealth
  - certification
  - HCWD
  - limitation
  - congregate PCS
  - EPSDT exception coverage

### Validation
- The refactor is reported to preserve behavior with **all 239 tests passing unchanged**.

### Drill-down
- See `coverage_candidate_profiles_table_refactor.md` for the full rule breakdown, implementation flow, and invariants.