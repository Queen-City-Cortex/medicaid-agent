---
children_hash: 2fe617d9663dc97ef0eb57ea26a2df83a54f5415a757a9b72f733e827d800481
compression_ratio: 0.6624040920716112
condensation_order: 0
covers: [coverage_candidate_profiles_table_refactor.md]
covers_token_total: 782
summary_level: d0
token_count: 518
type: summary
---
# Level 0 Structural Summary

## Coverage Candidate Profiles Table Refactor
- **Drill down:** `coverage_candidate_profiles_table_refactor.md`
- Refactors `packages/policy-corpus/src/frame/coverage-sections/candidates.ts` from **clone-heavy `buildXxxProfiles` functions** into **two declarative, ordered rule tables**.
- Core pipeline is now:
  - `query flags` → `derived signals` → `ordered rule tables` → `profilesFor()` → `collectProfiles()` → `uniqueBy(section.id)`
- The module still exposes:
  - `buildCoverageQueryFlags`
  - `buildCoverageDocumentCandidateProfiles`
  - `collectCoverageDocumentHydratedCandidates`
- Preserves static profile builders via `makeSectionProfile` and `makeLimitationProfile`.

### Key architectural decisions
- **Rule order is load-bearing**: downstream section selection is positional, and `collectProfiles()` uses **first-wins deduplication** on `section.id`.
- Profile objects are **module-level shared objects** created once at import time and treated as read-only.
- `profilesFor()` iterates each table in order with `filter + flatMap` and copies profile arrays per call.

### Rule table structure
- **Primary profile rules:** 9 rules
- **Supporting profile rules:** 11 rules
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

### Dependencies and pattern alignment
- Depends on:
  - shared term constants
  - query detectors
  - `makeSectionProfile` / `makeLimitationProfile`
  - `FrameContext` collection methods
- Pattern parity noted with `FEDERAL_QUERY_HINTS` in `rebalance/federal-authority.ts`.

### Outcome
- Behavior is preserved while making the logic **declarative and easier to extend**.
- Refactor completed with **all 239 tests passing unchanged**.