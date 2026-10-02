---
title: Shared Test-Fixture Layer
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-07T01:43:47.565Z'
updatedAt: '2026-07-07T01:43:47.565Z'
related: [architecture/refactoring_audit/repo_wide_refactoring_audit.md, architecture/refactoring_audit/quick_wins_and_latent_bugs_refactor_tranche.md, architecture/refactoring_audit/checklist_rule_table_refactor.md, architecture/refactoring_audit/shared_test_fixtures_guard_against_api_drift.md, architecture/refactoring_audit/pr_63_refactor_completion_and_import_cycle_fix.md, architecture/refactoring_audit/ci_artifact_only_pr_skip_rules.md]
---
## Raw Concept
**Task:**
Document the shared test-fixture refactor tranche across pipeline, policy-corpus, and agent tests

**Changes:**
- Added shared in-memory fakes for Neo4j session and graph-writer seams
- Centralized canonical policy-corpus domain-object fixtures
- Introduced typed agent answer-frame fixtures and section helpers
- Kept specialized failure-injecting sessions local to corpus-writer tests

**Files:**
- packages/pipeline/tests/fakes.py
- packages/policy-corpus/tests/helpers/objects.ts
- packages/agent/tests/helpers/answer-frame-fixtures.ts

**Flow:**
tests -> shared fixture factories/fakes -> monkeypatched session or domain-object fixtures -> unchanged assertions

**Timestamp:** 2026-07-06

**Author:** Tranche 2 (branch refactor/shared-test-fixtures, commit a793039, PR 59)

## Narrative
### Structure
The refactor split fixture responsibility into three layers: Neo4j session and graph-writer fakes in pipeline tests, canonical domain-object factories in policy-corpus tests, and typed agent frame fixtures built on the policy-corpus types. The policy-corpus factories provide one canonical default set, while tests with different defaults use thin wrappers at the call site. The agent helpers intentionally keep section titles and contents explicit because the processor keyword-matches on them.

### Dependencies
Production code still reaches Neo4j through get_session() and the graph_writer singleton, so tests monkeypatch those seams. The corpus-writer failure-injecting session remains local because it has a specialized protocol. The agent fixtures import canonical types from @nc-medicaid/policy-corpus.

### Highlights
RecordingSession tracks run() calls, queries, and commits; FakeResult supports single(); session_factory yields the provided session; RecordingGraphWriter records arbitrary method calls and returns the size of the first argument when possible. The policy-corpus helpers expose makeHit, makeSection, and makeFrame. The agent helpers expose makeRoute, makeSection, sectionMaker, makeDocument, and makeFrame, and the frame fixtures flow through message content as plain JSON.

### Rules
Each factory carries ONE canonical default set. Test files whose local defaults differ keep a thin wrapper at the call site that supplies only the differing fields on top of these bases.

### Examples
RecordingGraphWriter.received(method) returns the first argument of each recorded call. sectionMaker(docDefaults) returns a function that merges docDefaults with per-section overrides. The agent makeSection helper defaults id to sec-x, title to an empty string, and reason to test.

## Facts
- **refactor_tranche**: Tranche 2 is on branch refactor/shared-test-fixtures at commit a793039 for PR 59. [project]
- **shared_fakes_location**: Shared fakes were moved into packages/pipeline/tests/fakes.py for Neo4j session and graph-writer seams. [project]
- **policy_corpus_fixture_location**: packages/policy-corpus/tests/helpers/objects.ts defines canonical domain-object fixtures for hits, sections, and frames. [project]
- **agent_fixture_location**: packages/agent/tests/helpers/answer-frame-fixtures.ts defines canonical answer-frame fixtures and section makers for agent tests. [project]
- **behavioral_change**: The tranche reported zero expected-value changes and preserved pinned floats bit-identical. [project]
- **test_status**: Suites were reported as 305/239/215 green. [project]
