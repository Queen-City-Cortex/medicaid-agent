---
children_hash: 716b3173080a86e753d2c43cee4d86721779d9b2a059c77ddc5b80f81d2cc84d
compression_ratio: 0.5423529411764706
condensation_order: 0
covers: [pipeline_cli_package_split.md]
covers_token_total: 850
summary_level: d0
token_count: 461
type: summary
---
# Pipeline CLI Package Split

The pipeline CLI was refactored from a single monolithic `cli.py` into a `pipeline.cli` package, while preserving compatibility and command registration behavior. See **Pipeline CLI Package Split** for the full refactor details and validation results.

## Structural change
- `packages/pipeline/src/pipeline/cli.py` was split into a package with:
  - `pipeline/cli/_shared.py` for shared `click` group setup and the Rich console
  - `pipeline/cli/__init__.py` as the package entry point
  - `pipeline/cli/__main__.py` to preserve `python -m pipeline.cli`
  - command modules: `build.py`, `references.py`, `federal.py`, `graph.py`, `eval.py`, `audit.py`
- The package entry point imports command modules for registration side effects, keeping the command suite intact.

## Compatibility and behavior
- Back-compat exports were preserved so direct imports still work.
- The split avoids partially initialized package import issues by moving helper targets to their defining modules.
- Tests were updated to monkeypatch module-local helpers, especially under:
  - `pipeline.cli.build`
  - `pipeline.cli.eval`
  - `pipeline.cli.audit`

## Preserved command behavior
- Mixed-corpus build orchestration remains intact.
- Eval command defaults and answer-stability behavior were preserved.
- Fee-schedule backlog behavior was preserved.
- The command suite still registers **25 commands**.

## Validation
- Reported validation status: clean build, `ruff` clean, **301 passed**, **2 skipped**.
- Refer to **Pipeline CLI Package Split** and its tests for coverage of:
  - build mixed-corpus
  - eval mixed-corpus
  - eval defaults
  - eval answer stability
  - eval runs
  - fee-schedule backlog command behavior

## Drill-down entry
- **Pipeline CLI Package Split** — primary refactor summary, file list, flow, and facts