---
children_hash: 4be3a472be53bf0f9c317ef3886976ef43417f5271e1db7bde5c5c50175af52f
compression_ratio: 0.3215434083601286
condensation_order: 1
covers: [checklist_rule_table_refactor.md, pr_63_refactor_completion_and_import_cycle_fix.md, quick_wins_and_latent_bugs_refactor_tranche.md, repo_wide_refactoring_audit.md, shared_test_fixture_layer.md, shared_test_fixtures_guard_against_api_drift.md]
covers_token_total: 5287
summary_level: d1
token_count: 1700
type: summary
---
# Refactoring Audit and Shared Test-Fixture Layer

This cluster documents a repo-wide refactoring audit and the follow-on tranches that converted repeated builder logic into data tables, removed dead code, hardened test fixtures, and fixed import-cycle and API-drift issues. The shared theme is structural simplification with behavior preserved through differential or suite-based verification.

## Core refactoring patterns

- **Rules-as-data / table-driven logic** is the main architectural direction.
  - See **Repo-wide Refactoring Audit** for the original audit framing.
  - See **Checklist Rule Table Refactor** for the answer-frame planner conversion from `buildXxxChecklist` chains to ordered `ChecklistRule<C>` tables consumed by `evaluateRules()`.
  - See **Quick Wins and Latent Bugs Refactor Tranche** for similar consolidation work across phrase matching, path normalization, and section predicates.

- **Canonical shared types and helpers** replace duplicated local copies.
  - `AnswerFrame` types are centralized through **policy-corpus**.
  - `includesAnyTerm` was merged into `includesPhrase`.
  - `REWRITE_PART_TYPE` and `OK_PART_TYPE` were exported from `message-parts.ts`.
  - `normalize_local_path` and registry access were centralized in pipeline code.

## Refactor tranche details

### Checklist Rule Table Refactor
Focuses on `packages/agent/src/processors/answer-frame-planning.ts`.
- Six `buildXxxChecklist` if-chains were replaced by ordered `ChecklistRule<C>` tables.
- `evaluateRules()` now drives checklist generation.
- Behavior remained identical under a differential harness.
- Rule ordering is load-bearing because `CHECKLIST_LIMIT = 6` truncates output.
- The checklist families include coverage, prior authorization, federal authority, amendment history, policy variants, and general cases.
- Verification used **26 frames x 27 questions = 702 combinations** with **0 mismatches**, and **215 tests** stayed green.

### Quick Wins and Latent Bugs Refactor Tranche
Covers pipeline and policy-corpus cleanup.
- Deleted dead `CorpusGraphWriter.mark_document_status` plus its vulture whitelist entry.
- Deleted dead web `buildSourceIndex`.
- Consolidated `includesAnyTerm` into `includesPhrase`.
- Unified `AnswerFrame` imports through policy-corpus.
- Moved crawler registry access and local path normalization into `packages/pipeline/src/pipeline/crawler_registry.py`.
- Hoisted waiver CFR encodings into documented predicates in `section-predicates.ts`.
- The waiver logic now distinguishes anchor, implementing, and rebalance ranges explicitly rather than inlining them.
- All suites were green: **pipeline 305, policy-corpus 239, agent 215, web 251**.

### Repo-wide Refactoring Audit
Provides the original cross-repo analysis and motivates the later tranches.
- Repeated rules-as-code builders were identified in policy-corpus and agent processors.
- Duplicate crawler discover flows and divergent local path normalization were identified.
- Write-boundary bypass risk, dead code, and missing fixture builders were flagged.
- Example targets include `buildCoverageDocumentCandidateProfiles`, `buildCoveragePrimaryProfiles`, `buildCoverageSupportingProfiles`, `buildCoverageQueryFlags`, `buildCoverageChecklist`, and `buildPriorAuthChecklist`.
- The audit’s central thesis: **rules-as-code should become rules-as-data**.

## Test-fixture architecture

### Shared Test-Fixture Layer
Defines a three-layer fixture strategy across pipeline, policy-corpus, and agent tests.
- Pipeline tests use shared in-memory fakes for Neo4j session and graph-writer seams.
- Policy-corpus tests centralize canonical domain-object fixtures.
- Agent tests use typed answer-frame fixtures and section helpers built on policy-corpus types.
- Specialized failure-injecting sessions remain local to corpus-writer tests.
- The shared helper set includes `RecordingSession`, `FakeResult`, `session_factory`, `RecordingGraphWriter`, `makeHit`, `makeSection`, `makeFrame`, `makeRoute`, `makeDocument`, and `sectionMaker`.
- Tests preserve bit-identical outputs and reported no expected-value changes.

### Shared Test Fixtures Guard Against API Drift
Hardens the fake layer against silent breakage.
- `RecordingGraphWriter.__getattr__` now validates method names against the real `CorpusGraphWriter`.
- `_first_argument(args, kwargs)` makes `received()` and len-return behavior kwargs-tolerant.
- `collector.test.ts` moved `makeHit` import above `vi.mocked` const.
- A stale Greptile P2 finding about `retrievalReady: null` was explicitly not fixed.
- The fake writer now fails loudly on typos or renamed methods instead of recording them silently.
- Only the fulltext backend is mocked in `collector.test.ts`; the rest of the orchestration uses real shared helpers.

## Import-cycle and resolver safety

### PR 63 Refactor Completion and Import-Cycle Fix
Covers the final audit closure and a structural web import fix.
- PR 63 merged as **f489bc5**.
- The refactoring audit across PRs 58–63 was completed.
- API documentation was added for `strEnv ||` semantics.
- `resolve_reference` now guards unknown ref types before Neo4j session creation, checking `_REF_TYPE_HANDLERS` first.
- Message-part guards were moved to `packages/web/src/lib/message-part-guards.ts`.
- `message-parts.ts` became a pure barrel, with dependent imports updated accordingly.
- A future rule was established: **never value-import from `message-parts` inside a module the barrel re-exports**; import from `message-part-guards` or the specific sibling module instead.
- The fix is described as both ESM-safe and CJS-safe.

## Key relationships and drill-down map

- **Repo-wide Refactoring Audit** → source of the cross-cutting refactor themes and target inventory.
- **Checklist Rule Table Refactor** → detailed example of table-driven rules replacing branch chains in agent answer-frame planning.
- **Quick Wins and Latent Bugs Refactor Tranche** → cleanup and normalization tranche spanning pipeline, policy-corpus, and shared predicates.
- **Shared Test-Fixture Layer** → canonical fixture architecture for pipeline, policy-corpus, and agent tests.
- **Shared Test Fixtures Guard Against API Drift** → hardening of the shared fake layer and collector test behavior.
- **PR 63 Refactor Completion and Import-Cycle Fix** → final audit closure, resolver guard, and web module-cycle resolution.

## Cross-cutting rules preserved in the refactors

- Rule ordering is load-bearing where truncation occurs (`CHECKLIST_LIMIT = 6`).
- Canonical types should come from shared packages, not local copies.
- Path normalization must use `CRAWLER_DATA_DIR`-relative POSIX joins.
- Shared test fakes should validate against real production APIs.
- Value imports must not re-enter a barrel that re-exports the importing module.