---
children_hash: c82c05bdd73ea1d49110067d39556336dbf18c402b36102746b3645fb4d23992
compression_ratio: 0.24078187472234563
condensation_order: 1
covers: [checklist_rule_table_refactor.md, ci_artifact_only_pr_skip_rules.md, pr_63_refactor_completion_and_import_cycle_fix.md, quick_wins_and_latent_bugs_refactor_tranche.md, repo_wide_refactoring_audit.md, shared_test_fixture_layer.md, shared_test_fixtures_guard_against_api_drift.md]
covers_token_total: 6753
summary_level: d1
token_count: 1626
type: summary
---
# Refactoring Audit and Test Infrastructure

This cluster captures the repo-wide refactoring program across `packages/agent`, `packages/pipeline`, `packages/policy-corpus`, and `packages/web`, plus CI changes that keep artifact-only work moving without weakening main-branch protection. The shared theme is replacing duplicated imperative logic with declarative tables or canonical helpers, while preserving behavior through differential or fixture-based verification.

## Major refactor themes

- **Rules-as-data / table-driven logic**
  - `repo_wide_refactoring_audit.md` identifies repeated builder patterns in policy-corpus and agent processors as a core refactor target.
  - `checklist_rule_table_refactor.md` shows the answer-frame planner moving from six `buildXxxChecklist` chains to ordered `ChecklistRule<C>` tables consumed by `evaluateRules()`.
  - `quick_wins_and_latent_bugs_refactor_tranche.md` also reduces duplication by consolidating phrase matching and canonical type imports.

- **Shared canonical helpers and fixtures**
  - `shared_test_fixture_layer.md` centralizes test fakes and domain-object fixtures across pipeline, policy-corpus, and agent.
  - `shared_test_fixtures_guard_against_api_drift.md` hardens those fixtures so they validate the real production API instead of silently accepting drift.

- **Import-cycle and module-boundary cleanup**
  - `pr_63_refactor_completion_and_import_cycle_fix.md` finishes the refactor audit and breaks a web import cycle by moving message-part guards into `message-part-guards.ts`.
  - It also establishes a future rule: avoid value-importing from the `message-parts` barrel inside modules that the barrel re-exports.

## Key structural findings by entry

### `repo_wide_refactoring_audit.md`
- Establishes the audit scope: duplicate builders, latent bugs, dead code, write-boundary bypass risk, and missing fixtures.
- Highlights:
  - policy-corpus coverage profile builders are highly repetitive,
  - agent checklist builders are table-refactor candidates,
  - crawler `discover()` implementations are duplicated,
  - `_normalize_local_path` logic diverges across pipeline,
  - `CorpusGraphWriter` is the single write-side boundary.

### `quick_wins_and_latent_bugs_refactor_tranche.md`
- First refactor tranche removes dead code and centralizes behavior:
  - deletes `CorpusGraphWriter.mark_document_status` and the web `buildSourceIndex`,
  - merges `includesAnyTerm` into `includesPhrase`,
  - exports `REWRITE_PART_TYPE` and `OK_PART_TYPE` from `message-parts.ts`,
  - hoists crawler path normalization into `pipeline/crawler_registry.py`,
  - documents waiver CFR section predicates in `policy-corpus`.
- Important rule: waiver section logic is intentionally split by phase, with different section ranges for anchoring, implementing, and rebalance behavior.

### `checklist_rule_table_refactor.md`
- The answer-frame planner now uses ordered rule tables and a generic evaluator.
- Structural consequences:
  - family-specific checklist logic is centralized,
  - rule ordering is load-bearing because `CHECKLIST_LIMIT = 6`,
  - behavior was proven byte-identical with a 702-combo differential harness before deleting the temporary harness.
- The telehealth branch is now represented as two mutually exclusive rows; pharmacy uses `terminal: true` to preserve early-return behavior.

### `shared_test_fixture_layer.md`
- Defines a three-layer fixture strategy:
  - pipeline: in-memory Neo4j session and graph-writer fakes,
  - policy-corpus: canonical domain-object factories,
  - agent: typed answer-frame fixtures built from policy-corpus types.
- Keeps specialized failure-injecting sessions local where protocols differ.
- Emphasizes one canonical default per factory, with thin local wrappers when tests need different defaults.

### `shared_test_fixtures_guard_against_api_drift.md`
- Tightens the shared fake layer:
  - `RecordingGraphWriter.__getattr__` validates against the real `CorpusGraphWriter`,
  - `_first_argument(args, kwargs)` supports kwargs-aware `received()` behavior,
  - collector tests mock only the fulltext backend.
- Main goal: fail loudly on renamed or typoed writer methods instead of recording them silently.
- Notes a stale Greptile finding (`retrievalReady: null`) that should not be fixed.

### `pr_63_refactor_completion_and_import_cycle_fix.md`
- Marks PR 63 as the completion point for the audit across PRs 58–63.
- Two main codepaths changed:
  - Python resolver: `resolve_reference` now validates `_REF_TYPE_HANDLERS` before opening a Neo4j session.
  - Web module: message-part guards moved into `packages/web/src/lib/message-part-guards.ts`, and `message-parts.ts` becomes a pure barrel.
- Future import rule is explicit: import from `message-part-guards` or a sibling module, not via the barrel when the barrel re-exports the importer.

### `ci_artifact_only_pr_skip_rules.md`
- Adds CI/review skipping for artifact-only PRs touching `.brv/**` or `graphify-out/**`.
- Applies `paths-ignore` only on `pull_request` workflows; `push:main` remains fully active so Railway deployment gates stay intact.
- `greptile.json` also ignores those paths and disables the `skip-review` label.
- Important semantic rule: `paths-ignore` skips a workflow only when every changed file matches the ignored paths, so mixed source+artifact PRs still run full CI.

## Cross-cutting patterns

- **Behavior preservation is enforced, not assumed**
  - Differential harnesses, green suite checks, and API-validating fakes are the main safety mechanisms.
- **Canonicalization replaces local copies**
  - Canonical AnswerFrame types, shared domain-object fixtures, and shared path normalization reduce drift.
- **Boundary ownership matters**
  - `CorpusGraphWriter` remains the write boundary.
  - `resolve_reference` now guards before Neo4j session creation.
  - `push:main` CI remains unsuppressed because deployment gating depends on it.

## Where to drill down

- Rules-table answer planning: `checklist_rule_table_refactor.md`
- Audit scope and recurring refactor targets: `repo_wide_refactoring_audit.md`
- Dead code and helper consolidation tranche: `quick_wins_and_latent_bugs_refactor_tranche.md`
- Shared test-fixture architecture: `shared_test_fixture_layer.md`
- API-drift-safe test fakes: `shared_test_fixtures_guard_against_api_drift.md`
- Import-cycle fix and PR 63 closure: `pr_63_refactor_completion_and_import_cycle_fix.md`
- Artifact-only PR CI suppression rules: `ci_artifact_only_pr_skip_rules.md`