---
children_hash: 1884e1a1bd696293fd5df5607a5cfb8f96bf4e186abbf0c00c4f1a3d6f23b597
compression_ratio: 0.890634820867379
condensation_order: 2
covers: [refactoring_audit/_index.md]
covers_token_total: 1591
summary_level: d2
token_count: 1417
type: summary
---
## Refactoring Audit and Test Infrastructure

This cluster documents a repo-wide refactoring program focused on replacing duplicated imperative logic with shared canonical structures, while preserving behavior through differential testing and green suites. The main themes are table-driven rule evaluation, helper consolidation, fixture hardening, and CI/review optimizations for artifact-only changes.

### Core refactor patterns
- **Rules-as-data / table-driven refactors**:  
  - `checklist_rule_table_refactor.md` replaces six `buildXxxChecklist` chains in `packages/agent/src/processors/answer-frame-planning.ts` with ordered `ChecklistRule<C>` tables consumed by `evaluateRules()`.
  - `repo_wide_refactoring_audit.md` broadens this pattern across policy-corpus builders and agent checklist builders.
- **Shared canonical helpers and types**:  
  - `quick_wins_and_latent_bugs_refactor_tranche.md` consolidates matching helpers, exports part-type constants, and centralizes path normalization.
  - `shared_test_fixture_layer.md` and `shared_test_fixtures_guard_against_api_drift.md` establish canonical fixture layers and validate them against real APIs.

### Behavior-preserving verification
- The checklist refactor used a **differential harness** over 26 frames and 27 questions, with **0 mismatches** before the temporary harness was removed.
- The shared fixture tranche reports **zero expected-value changes** and preserved pinned floats bit-identical.
- A consistent workflow appears across the cluster: **refactor, compare outputs, then delete temporary scaffolding**.

### Import-cycle and API-safety fixes
- `pr_63_refactor_completion_and_import_cycle_fix.md` closes PR 63 and completes the refactoring audit across PRs 58–63.
- It also:
  - documents `strEnv ||` semantics,
  - guards `resolve_reference` against unknown ref types before Neo4j session creation,
  - moves message-part guards into `packages/web/src/lib/message-part-guards.ts`,
  - converts `message-parts.ts` into a pure barrel,
  - defines a future web import rule: **never value-import from `message-parts` inside a module the barrel re-exports; import from `message-part-guards` or the sibling module instead**.

### Dead code and helper consolidation
- `quick_wins_and_latent_bugs_refactor_tranche.md` removes:
  - `CorpusGraphWriter.mark_document_status` and its whitelist entry,
  - dead `web buildSourceIndex`,
  - duplicated `includesAnyTerm` in favor of `includesPhrase`.
- It also centralizes:
  - `normalize_local_path` and registry access in `packages/pipeline/src/pipeline/crawler_registry.py`,
  - waiver CFR section predicates in `packages/policy-corpus/src/internal/section-predicates.ts`.

### CI and review-bot suppression for artifact-only PRs
- `ci_artifact_only_pr_skip_rules.md` documents CI optimizations for artifact-only pull requests:
  - `ci.yml` and `claude-code-review.yml` add `pull_request paths-ignore` for `.brv/**` and `graphify-out/**`,
  - `greptile.json` adds matching `ignorePatterns`,
  - the `skip-review` label suppresses Greptile,
  - `push:main` intentionally keeps no `paths-ignore` because Railway deploy gates depend on commit-specific CI.
- Key rule: `paths-ignore` only skips when **every changed file** matches ignored paths, so mixed source+artifact PRs still run full CI.

### Shared test-fixture architecture
- `shared_test_fixture_layer.md` splits fixture responsibility into three layers:
  - **pipeline**: in-memory Neo4j session and graph-writer fakes,
  - **policy-corpus**: canonical domain-object factories,
  - **agent**: typed answer-frame fixtures and section helpers.
- Important design choices:
  - production code still reaches Neo4j via `get_session()` and the graph-writer singleton,
  - corpus-writer failure-injecting sessions remain local because they have a specialized protocol,
  - agent fixtures import canonical types from `@nc-medicaid/policy-corpus`.

### Fixture drift protection and API validation
- `shared_test_fixtures_guard_against_api_drift.md` hardens `RecordingGraphWriter` so method names are validated against the real `CorpusGraphWriter`.
- It introduces `_first_argument(args, kwargs)` so recorded-call behavior works with kwargs and sized-return semantics.
- The test strategy intentionally mocks only the fulltext backend while using real shared helpers and injected stage-1 backends.

### Cross-cutting architecture signals
- The audit entries converge on the same priorities:
  - **canonical types over local copies**,
  - **shared helpers over duplicated call-site logic**,
  - **path normalization and write boundaries as central invariants**,
  - **fixtures that fail loudly on API drift**.
- Main drill-down points:
  - `architecture/refactoring_audit/checklist_rule_table_refactor.md`
  - `architecture/refactoring_audit/shared_test_fixture_layer.md`
  - `architecture/refactoring_audit/shared_test_fixtures_guard_against_api_drift.md`
  - `architecture/refactoring_audit/ci_artifact_only_pr_skip_rules.md`
  - `architecture/refactoring_audit/pr_63_refactor_completion_and_import_cycle_fix.md`
  - `architecture/refactoring_audit/quick_wins_and_latent_bugs_refactor_tranche.md`
  - `architecture/refactoring_audit/repo_wide_refactoring_audit.md`

### Stable outcomes and constraints
- Refactors consistently preserved behavior, kept suites green, and turned hidden coupling into explicit rules.
- Load-bearing constraints include:
  - `CHECKLIST_LIMIT = 6` for answer-frame planning,
  - Railway deployment dependence on `push:main` CI,
  - explicit waiver section encodings,
  - import-path restrictions to prevent barrel cycles,
  - test-fake validation against the live writer API.