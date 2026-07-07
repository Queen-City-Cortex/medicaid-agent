---
title: Checklist Rule Table Refactor
tags: []
related: [architecture/refactoring_audit/shared_test_fixture_layer.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-07T02:28:53.619Z'
updatedAt: '2026-07-07T02:28:53.619Z'
---
## Raw Concept
**Task:**
Document the checklist-rule-table refactor in answer-frame planning

**Changes:**
- Replaced six buildXxxChecklist if-chains with ordered ChecklistRule<C> tables
- Introduced generic evaluateRules() consumption
- Kept behavior identical under differential testing

**Files:**
- packages/agent/src/processors/answer-frame-planning.ts

**Flow:**
question -> build frame context -> evaluate ordered rules -> render checklist items -> truncate to CHECKLIST_LIMIT

**Timestamp:** 2026-07-06

**Author:** ByteRover context engineer

## Narrative
### Structure
The processor now centralizes answer-planning logic in ordered rule tables, with family-specific checklists for coverage, prior authorization, federal authority, amendment history, policy variants, and general cases.

### Dependencies
Behavior depends on rule ordering, section matching, and the 6-item checklist cap; verification used a differential harness over 26 frames and 27 questions.

### Highlights
The refactor increased file size from 685 to 841 lines in exchange for one-rule-per-row density. The key safety pattern is that a full combinatorial harness can prove byte-identical behavior before deleting the temporary test harness.

### Rules
Rule order is load-bearing because of CHECKLIST_LIMIT = 6 truncation.

### Examples
The telehealth branch now uses two mutually exclusive rows instead of an else-if chain; the pharmacy branch uses terminal: true to preserve early-return behavior.

## Facts
- **answer_frame_planning_refactor**: packages/agent/src/processors/answer-frame-planning.ts was refactored from six buildXxxChecklist if-chains into ordered ChecklistRule<C> tables consumed by generic evaluateRules(). [project]
- **context_object_strategy**: Per-family context objects are built once per question and carry predicates plus matching sections bucket results. [project]
- **phrase_buckets**: About 35 phrase buckets are named module constants. [project]
- **rule_table_behavior**: terminal: true models the pharmacy early-return, and the telehealth else-if became two mutually exclusive rows. [project]
- **checklist_limit**: Rule order is load-bearing because CHECKLIST_LIMIT = 6 truncates the checklist. [project]
- **verification_harness**: A 702-combo differential harness (26 frames x 27 questions) verified byte-identical plans with 0 mismatches. [project]
- **test_status**: 215 tests continue to pass unchanged. [project]
- **verification_pattern**: Differential-harness-then-delete is used as a verification pattern for behavior-preserving refactors without pinned outputs. [convention]
