---
children_hash: d49a0514bb27783774f10def456ffbc9b3b0a9174168245ed20c24cad9d1c3e4
compression_ratio: 0.9110604332953249
condensation_order: 2
covers: [refactoring_audit/_index.md]
covers_token_total: 1754
summary_level: d2
token_count: 1598
type: summary
---
# Refactoring Audit and Test Infrastructure

This cluster covers the repo-wide refactoring program across `packages/agent`, `packages/pipeline`, `packages/policy-corpus`, and `packages/web`, plus CI rules that let artifact-only work proceed without weakening `push:main` protection. The dominant pattern is replacing duplicated imperative logic with declarative tables or canonical helpers, while proving behavior remains unchanged through differential tests and stricter fixture validation.

## Core themes

- **Rules-as-data / table-driven refactors**
  - `repo_wide_refactoring_audit.md` identifies repeated builder patterns and duplicated pipeline logic as major targets.
  - `checklist_rule_table_refactor.md` moves the answer-frame planner from chained `buildXxxChecklist` logic to ordered `ChecklistRule<C>` tables evaluated by `evaluateRules()`.
  - `quick_wins_and_latent_bugs_refactor_tranche.md` also reduces duplication by consolidating phrase matching and canonical type imports.

- **Shared canonical helpers and fixtures**
  - `shared_test_fixture_layer.md` introduces a three-layer fixture strategy spanning pipeline, policy-corpus, and agent.
  - `shared_test_fixtures_guard_against_api_drift.md` hardens those fixtures so they validate the real production API instead of silently accepting drift.

- **Import-cycle and module-boundary cleanup**
  - `pr_63_refactor_completion_and_import_cycle_fix.md` closes the audit and breaks a web import cycle by moving message-part guards into `message-part-guards.ts`.
  - It also establishes a future rule: avoid value-importing from the `message-parts` barrel inside modules that the barrel re-exports.

- **CI suppression for artifact-only PRs**
  - `ci_artifact_only_pr_skip_rules.md` adds `paths-ignore` behavior for `.brv/**` and `graphify-out/**` on `pull_request` workflows only.
  - `push:main` remains fully active so Railway deployment gates are preserved.

## Entry-level structure

### `repo_wide_refactoring_audit.md`
- Defines the audit scope: duplicate builders, latent bugs, dead code, write-boundary bypass risk, and missing fixtures.
- Highlights:
  - repetitive policy-corpus coverage profile builders,
  - agent checklist builders as table-refactor candidates,
  - duplicated crawler `discover()` implementations,
  - diverging `_normalize_local_path` logic in pipeline,
  - `CorpusGraphWriter` as the write-side boundary.

### `quick_wins_and_latent_bugs_refactor_tranche.md`
- First tranche removes dead code and centralizes behavior:
  - deletes `CorpusGraphWriter.mark_document_status` and web `buildSourceIndex`,
  - merges `includesAnyTerm` into `includesPhrase`,
  - exports `REWRITE_PART_TYPE` and `OK_PART_TYPE` from `message-parts.ts`,
  - hoists crawler path normalization into `pipeline/crawler_registry.py`,
  - documents waiver CFR section predicates in policy-corpus.
- Notes the phase-split waiver section logic used for anchoring, implementing, and rebalance behavior.

### `checklist_rule_table_refactor.md`
- The answer-frame planner now uses ordered rule tables and a generic evaluator.
- `CHECKLIST_LIMIT = 6` makes ordering load-bearing.
- A 702-combo differential harness proved byte-identical behavior before removing the temporary harness.
- Telehealth is represented by two mutually exclusive rows; pharmacy uses `terminal: true` to preserve early-return behavior.

### `shared_test_fixture_layer.md`
- Defines the fixture architecture:
  - pipeline: in-memory Neo4j session and graph-writer fakes,
  - policy-corpus: canonical domain-object factories,
  - agent: typed answer-frame fixtures built from policy-corpus types.
- Keeps specialized failure-injecting sessions local where protocols differ.
- Uses one canonical default per factory with thin local wrappers for alternate defaults.

### `shared_test_fixtures_guard_against_api_drift.md`
- Strengthens shared fakes:
  - `RecordingGraphWriter.__getattr__` validates against the real `CorpusGraphWriter`,
  - `_first_argument(args, kwargs)` supports kwargs-aware `received()` behavior,
  - collector tests mock only the fulltext backend.
- Main goal: fail loudly on renamed or misspelled writer methods instead of recording them silently.
- Mentions a stale Greptile finding (`retrievalReady: null`) that should not be fixed.

### `pr_63_refactor_completion_and_import_cycle_fix.md`
- Marks PR 63 as the audit completion point across PRs 58–63.
- Two codepaths changed:
  - Python resolver: `resolve_reference` now validates `_REF_TYPE_HANDLERS` before opening a Neo4j session,
  - Web module: message-part guards moved into `packages/web/src/lib/message-part-guards.ts`, making `message-parts.ts` a pure barrel.
- Explicit future rule: import from `message-part-guards` or a sibling module, not via the barrel when the barrel re-exports the importer.

### `ci_artifact_only_pr_skip_rules.md`
- Adds CI/review skipping for artifact-only PRs touching `.brv/**` or `graphify-out/**`.
- `paths-ignore` applies only to `pull_request`; `push:main` stays active.
- `greptile.json` also ignores those paths and disables the `skip-review` label.
- Important nuance: `paths-ignore` skips a workflow only when every changed file matches ignored paths, so mixed source+artifact PRs still run full CI.

## Cross-cutting patterns

- **Behavior preservation is enforced, not assumed**
  - Differential harnesses, green-suite checks, and API-validating fakes are the main safety mechanisms.
- **Canonicalization replaces local copies**
  - Shared AnswerFrame types, shared domain-object fixtures, and shared path normalization reduce drift.
- **Boundary ownership matters**
  - `CorpusGraphWriter` remains the write boundary.
  - `resolve_reference` now guards before Neo4j session creation.
  - `push:main` CI remains unsuppressed because deployment gating depends on it.

## Drill-down map

- Rules-table answer planning: `checklist_rule_table_refactor.md`
- Audit scope and recurring refactor targets: `repo_wide_refactoring_audit.md`
- Dead code and helper consolidation tranche: `quick_wins_and_latent_bugs_refactor_tranche.md`
- Shared test-fixture architecture: `shared_test_fixture_layer.md`
- API-drift-safe test fakes: `shared_test_fixtures_guard_against_api_drift.md`
- Import-cycle fix and PR 63 closure: `pr_63_refactor_completion_and_import_cycle_fix.md`
- Artifact-only PR CI suppression rules: `ci_artifact_only_pr_skip_rules.md`