---
title: Coverage Candidate Profiles Table Refactor
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-07T02:12:48.746Z'
updatedAt: '2026-07-07T02:12:48.746Z'
related: [packages/policy_corpus/refactoring_audit/refactoring_audit_2026_07_05.md, packages/policy_corpus/internal/document_selection_tests.md]
---
## Raw Concept
**Task:**
Document the coverage candidate profile refactor in the policy corpus frame module

**Changes:**
- Replaced clone-heavy buildXxxProfiles functions with declarative rule tables
- Introduced ordered primary and supporting profile rule lists
- Encoded the order-sensitive selection invariant directly in the table comment
- Kept profile builders static with makeSectionProfile and makeLimitationProfile

**Files:**
- packages/policy-corpus/src/frame/coverage-sections/candidates.ts

**Flow:**
query flags -> derived signals -> ordered rule tables -> profilesFor() -> collectProfiles() -> uniqueBy(section.id)

**Timestamp:** 2026-07-07

**Author:** ByteRover context engineer

## Narrative
### Structure
The file exposes buildCoverageQueryFlags, buildCoverageDocumentCandidateProfiles, and collectCoverageDocumentHydratedCandidates. Internally it derives signals from query text, then applies two ordered rule tables to produce primary and supporting candidate profiles before collecting hydrated section candidates.

### Dependencies
Depends on shared term constants, query detectors, makeSectionProfile/makeLimitationProfile helpers, and the context collection methods on FrameContext.

### Highlights
The critical invariant is that rule order is load-bearing: downstream section selection is positional and uniqueBy first-wins on section.id. The refactor preserves behavior while making the profile logic declarative and easier to extend.

### Examples
Primary rules cover general criteria, yes/no coverage, pediatric, modification, telehealth, certification, HCWD, direct coverage detail, and congregate PCS queries. Supporting rules add not-covered, eligibility scope, additional yes/no coverage, pediatric, modification, telehealth, certification, HCWD, limitation, congregate PCS, and EPSDT exception coverage.

## Facts
- **coverage_profile_refactor**: packages/policy-corpus/src/frame/coverage-sections/candidates.ts was refactored from 20 buildXxxProfiles template-clone functions to two ordered declarative tables. [project]
- **coverage_profile_rule_counts**: The module defines COVERAGE_PRIMARY_PROFILE_RULES with 9 rules and COVERAGE_SUPPORTING_PROFILE_RULES with 11 rules. [project]
- **profilesFor_behavior**: profilesFor() walks each table in order using filter + flatMap and copies profile arrays per call. [project]
- **coverage_profile_ordering_invariant**: TABLE ORDER IS LOAD-BEARING because downstream selection is positional and collectProfiles() dedupes first-wins on section id. [project]
- **coverage_profile_object_lifecycle**: Profile objects are module-level shared objects built once at import time and are safe because consumers only read them. [project]
- **coverage_profile_pattern_parity**: The pattern matches FEDERAL_QUERY_HINTS in rebalance/federal-authority.ts. [project]
- **coverage_profile_test_status**: All 239 tests pass unchanged after the refactor. [project]
