---
children_hash: f66d904772d324ae7427f0d722a4194b1cc618eb9b7e0c7dfec1c8c080b67f42
compression_ratio: 0.902693787795492
condensation_order: 2
covers: [refactoring_audit/_index.md]
covers_token_total: 1819
summary_level: d2
token_count: 1642
type: summary
---
# Refactoring Audit and Shared Test-Fixture Layer

This cluster tracks a repo-wide simplification effort: repeated branch logic was converted into table-driven rules, dead code was removed, shared helpers/types were centralized, test fixtures were hardened, and import-cycle/runtime-boundary issues were fixed without changing behavior.

## Main refactoring themes

- **Rules-as-data over rules-as-code**
  - Core thesis from **Repo-wide Refactoring Audit**: replace repeated builder chains with ordered rule tables.
  - Most visible in **Checklist Rule Table Refactor**, where `buildXxxChecklist` chains in `packages/agent/src/processors/answer-frame-planning.ts` were replaced by `ChecklistRule<C>` tables consumed by `evaluateRules()`.
  - Also reinforced in **Quick Wins and Latent Bugs Refactor Tranche**, which consolidated phrase matching, path normalization, and predicate logic.

- **Canonical shared types and helpers**
  - Shared `AnswerFrame` types are centralized through **policy-corpus** rather than locally duplicated.
  - `includesAnyTerm` was merged into `includesPhrase`.
  - `REWRITE_PART_TYPE` and `OK_PART_TYPE` were exported from `message-parts.ts`.
  - Pipeline registry access and local path normalization were centralized in `packages/pipeline/src/pipeline/crawler_registry.py`.

## Refactor tranches and outcomes

### Repo-wide Refactoring Audit
The audit identified the cross-cutting problems that later tranches resolved:
- repeated rules-as-code builders in policy-corpus and agent processors
- duplicate crawler discovery flows and divergent local path normalization
- write-boundary bypass risk
- dead code and missing fixture builders

Named targets included `buildCoverageDocumentCandidateProfiles`, `buildCoveragePrimaryProfiles`, `buildCoverageSupportingProfiles`, `buildCoverageQueryFlags`, `buildCoverageChecklist`, and `buildPriorAuthChecklist`.  
The central conclusion was: **rules-as-code should become rules-as-data**.

### Checklist Rule Table Refactor
Focuses on `packages/agent/src/processors/answer-frame-planning.ts`:
- six `buildXxxChecklist` if-chains were replaced with ordered `ChecklistRule<C>` tables
- `evaluateRules()` now drives checklist generation
- behavior stayed identical under a differential harness
- rule ordering is load-bearing because `CHECKLIST_LIMIT = 6` truncates output
- checklist families include coverage, prior authorization, federal authority, amendment history, policy variants, and general cases

Verification was strong: **26 frames × 27 questions = 702 combinations**, **0 mismatches**, and **215 tests** remained green.

### Quick Wins and Latent Bugs Refactor Tranche
This tranche spans pipeline, policy-corpus, and shared predicate cleanup:
- deleted dead `CorpusGraphWriter.mark_document_status` plus its vulture whitelist entry
- deleted dead web `buildSourceIndex`
- consolidated `includesAnyTerm` into `includesPhrase`
- unified `AnswerFrame` imports through policy-corpus
- moved crawler registry access and path normalization into `packages/pipeline/src/pipeline/crawler_registry.py`
- hoisted waiver CFR encodings into documented predicates in `section-predicates.ts`

Waiver logic now distinguishes **anchor**, **implementing**, and **rebalance** ranges explicitly instead of inlining them.  
All suites were green: **pipeline 305, policy-corpus 239, agent 215, web 251**.

## Test-fixture architecture

### Shared Test-Fixture Layer
Defines a three-layer fixture strategy across the repo:
- **pipeline tests** use shared in-memory fakes for Neo4j session and graph-writer seams
- **policy-corpus tests** centralize canonical domain-object fixtures
- **agent tests** use typed answer-frame fixtures and section helpers built on policy-corpus types

Specialized failure-injecting sessions remain local to corpus-writer tests.  
Shared helpers include `RecordingSession`, `FakeResult`, `session_factory`, `RecordingGraphWriter`, `makeHit`, `makeSection`, `makeFrame`, `makeRoute`, `makeDocument`, and `sectionMaker`.  
The key guarantee is preserved outputs with no expected-value changes.

### Shared Test Fixtures Guard Against API Drift
Hardens the fake layer so it fails loudly instead of silently drifting:
- `RecordingGraphWriter.__getattr__` now validates method names against the real `CorpusGraphWriter`
- `_first_argument(args, kwargs)` makes `received()` and len-return behavior kwargs-tolerant
- `collector.test.ts` moved the `makeHit` import above the `vi.mocked` const
- a stale Greptile P2 finding about `retrievalReady: null` was explicitly not fixed

Only the fulltext backend is mocked in `collector.test.ts`; the rest of orchestration uses real shared helpers.

## Import-cycle and resolver safety

### PR 63 Refactor Completion and Import-Cycle Fix
This entry closes the audit sequence and fixes a module-cycle issue:
- PR 63 merged as **f489bc5**
- the refactoring audit across PRs 58–63 was completed
- API documentation was added for `strEnv ||` semantics
- `resolve_reference` now guards unknown ref types before Neo4j session creation by checking `_REF_TYPE_HANDLERS` first
- message-part guards were moved to `packages/web/src/lib/message-part-guards.ts`
- `message-parts.ts` became a pure barrel, with dependent imports updated accordingly

A key future rule was established: **never value-import from `message-parts` inside a module the barrel re-exports; import from `message-part-guards` or the specific sibling module instead.**  
The fix is described as both **ESM-safe** and **CJS-safe**.

## Drill-down map

- **Repo-wide Refactoring Audit** → cross-repo audit framing and target inventory
- **Checklist Rule Table Refactor** → table-driven checklist generation in agent planning
- **Quick Wins and Latent Bugs Refactor Tranche** → cleanup and normalization across pipeline/policy-corpus/shared predicates
- **Shared Test-Fixture Layer** → canonical fixture architecture across pipeline, policy-corpus, and agent tests
- **Shared Test Fixtures Guard Against API Drift** → fake-layer hardening and collector test behavior
- **PR 63 Refactor Completion and Import-Cycle Fix** → final audit closure, resolver guard, and web import-cycle resolution

## Cross-cutting rules preserved

- Rule ordering is load-bearing where truncation occurs (`CHECKLIST_LIMIT = 6`)
- canonical types should come from shared packages, not local copies
- path normalization must use `CRAWLER_DATA_DIR`-relative POSIX joins
- shared test fakes should validate against real production APIs
- value imports must not re-enter a barrel that re-exports the importing module