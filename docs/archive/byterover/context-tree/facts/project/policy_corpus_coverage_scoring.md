---
title: Policy Corpus Coverage Scoring
summary: Coverage scoring uses shared text helpers, exact anchor tests, and flag-gated bonuses and penalties for section ranking.
tags: []
related: [facts/project/context.md, facts/project/eval_harness_and_embedding_dimension_constraints.md]
keywords: []
createdAt: '2026-06-21T19:32:44.523Z'
updatedAt: '2026-06-21T19:32:44.523Z'
consolidated_at: '2026-06-23T02:10:42.294Z'
consolidated_from: [{date: '2026-06-23T02:10:42.294Z', path: facts/project/policy_corpus_coverage_scoring.overview.md, reason: These three files describe the same policy corpus coverage scoring topic; the .md entry is the richest source and the abstract/overview are redundant summaries that should be consolidated into it.}, {date: '2026-06-23T02:10:42.294Z', path: facts/project/policy_corpus_coverage_scoring.abstract.md, reason: These three files describe the same policy corpus coverage scoring topic; the .md entry is the richest source and the abstract/overview are redundant summaries that should be consolidated into it.}]
---
## Reason
Document the selection/scoring behavior for coverage sections and its test coverage

## Raw Concept
**Task:**
Document coverage-sections scoring tests and scoring formula behavior

**Changes:**
- Added unit test suite for selection/scoring.ts
- Locked in exact scores for empty, numbered, attachment, limitation, and focus-term cases
- Verified flag-gated telehealth, certification, and HCWD behaviors

**Files:**
- packages/policy-corpus/tests/frame/coverage-sections/scoring.test.ts
- packages/policy-corpus/src/frame/coverage-sections/selection/scoring.ts

**Flow:**
section list -> scoreCoverageSections -> primaryScore/supportScore ranking with flag-gated bonuses and penalties

**Timestamp:** 2026-06-21

## Narrative
### Structure
The test file is organized into structural invariants, exact-score anchors, and behavioral property tests. The scorer computes text from title plus content, applies weighted phrase matching, and then adds or subtracts bonuses and penalties based on section attributes and query flags.

### Dependencies
Depends on shared text helpers and term lists from internal/shared.js, plus CoverageQueryFlags from candidates.ts.

### Highlights
The suite is deliberately contamination-free: it uses real helpers without mocks and anchors critical outputs such as 0/0 for empty sections, 2.16/1.08 for a focus-term hit, +3 limitation support score, and +1.5 primary-only MA-2180 bonus.

### Rules
Imported directly from the scoring module (not the selection.ts barrel) to keep this a focused unit test of selection/scoring.ts. Runs against the REAL shared.ts helpers and term lists — no mocks — so the assertions lock in the actual formula.

### Examples
Example anchors include empty section => 0/0, Attachment A => -3 on both axes, not covered => limitation true with supportScore +3, and MA-2180 vs MA-9999 => primaryScore delta 1.5 with no supportScore delta.

## Facts
- **coverage_scoring_test_file**: The coverage-sections scoring tests live at packages/policy-corpus/tests/frame/coverage-sections/scoring.test.ts. [project]
- **coverage_scoring_module**: The scorer under test is scoreCoverageSections from packages/policy-corpus/src/frame/coverage-sections/selection/scoring.ts. [project]
- **coverage_scoring_import_path**: The tests import scoreCoverageSections directly from selection/scoring.js instead of the selection.ts barrel. [project]
- **coverage_scoring_test_style**: The unit tests run against the real shared.ts helpers and term lists with no mocks. [project]
- **normalize_search_text_behavior**: normalizeSearchText lowercases text. [project]
- **combine_text_behavior**: combineText joins truthy values and lowercases the result. [project]
- **score_term_matches_weights**: scoreTermMatches gives multi-word phrase hits PHRASE_MATCH_WEIGHT = 1.8 and LOW_SIGNAL terms are multiplied by 0.35. [project]
- **numbered_bonus**: numberedBonus adds +0.5 to both primaryScore and supportScore when sectionNumber is present. [project]
- **attachment_penalty**: attachment title penalty subtracts 3 from both scores. [project]
- **coverage_limitation_detection**: isCoverageLimitationText matches not covered, limitation, limitations, and exclusion. [project]
- **limitation_bonus**: limitationBonus is +3 and contributes to supportScore only. [project]
- **ma_2180_bonus**: When hcwdIncomePremiumQuery is set and the policy number is MA-2180, hcwdCurrentDocumentBonus adds +1.5 to primaryScore only. [project]
- **empty_section_anchor**: The tests assert an empty section scores 0 on both axes and produces an empty text field. [project]
- **focus_title_hit_anchor**: The tests assert a focus-term title hit yields primaryScore 2.16 and supportScore 1.08 for the physical therapy example. [project]
- **scorer_structure_properties**: The tests verify the scorer returns one result per input section in order and is deterministic for identical inputs. [project]
- **flag_gated_bonuses**: The tests verify that telehealth and certification bonuses only apply when their respective query flags are enabled. [project]
- **telehealth_avoid_penalty**: The tests verify telehealth avoid-term penalties apply only when telehealthQuery is set. [project]
- **ma_2180_primary_only_property**: The tests verify the MA-2180 bonus affects only primaryScore and not supportScore by comparing MA-2180 against MA-9999 under the same flags. [project]
- **coverage_scoring_formula**: scoreCoverageSection builds text from combineText(section.title, section.content) and computes focus, cluster, requirement, telehealth, and HCWD bonuses and penalties from the section text and flags. [project]

- Documents the coverage-section scoring behavior for policy corpus ranking, centered on scoreCoverageSections and its unit tests.
- The scorer uses shared text helpers to normalize and combine title/content text, then computes weighted phrase matches plus bonuses/penalties.
- Test coverage locks in exact score anchors for key cases: empty section, numbered sections, attachment titles, limitation text, and focus-term hits.
- Behavior is verified against real helpers and term lists with no mocks, making the suite a direct contract for the actual formula.
- Several behaviors are gated by query flags, including telehealth, certification, and HCWD-related scoring paths.
- The scoring flow is described as: section list -> scoreCoverageSections -> ranking by primaryScore and supportScore, with flag-dependent adjustments.
- Notable numeric decisions include 0/0 for empty sections, -3 attachment penalty, +0.5 numbered bonus, +3 limitation support bonus, +1.5 MA-2180 primary-only bonus, and weighted term scoring such as phrase matches and low-signal downweighting.

- Structure summary: starts with purpose/reason, then a raw concept block describing task, changes, files, flow, and timestamp; followed by narrative subsections for Structure, Dependencies, Highlights, Rules, and Examples; ends with a detailed Facts list.
- The test file is organized around structural invariants, exact-score anchors, and property/behavior tests.
- Dependencies mentioned include internal/shared.js text helpers, term lists, and CoverageQueryFlags from candidates.ts.

- Notable entities/patterns/decisions: packages/policy-corpus/tests/frame/coverage-sections/scoring.test.ts, packages/policy-corpus/src/frame/coverage-sections/selection/scoring.ts, normalizeSearchText, combineText, scoreTermMatches, PHRASE_MATCH_WEIGHT = 1.8, LOW_SIGNAL = 0.35, isCoverageLimitationText, hcwdIncomePremiumQuery, telehealthQuery, and certificationQuery.