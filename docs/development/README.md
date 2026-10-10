# Development guide

Use this guide to choose setup and verification commands. Commands run from the repository root unless a different directory is stated. The [root package](../../package.json) declares the Node/npm versions and workspace scripts; E2E is a separate package.

## Setup

```bash
npm ci
python3 -m venv .local-recovery/uv-tools
.local-recovery/uv-tools/bin/python -m pip install uv==0.8.22
export PATH="$PWD/.local-recovery/uv-tools/bin:$PATH"
npm run setup -w @nc-medicaid/pipeline
```

The pipeline setup creates its `.venv` from the committed `uv.lock` with `uv sync --frozen --extra dev`. CI separately runs `uv lock --check` to reject stale locks and caches uv downloads by the lockfile hash. CI and the corpus-job image use uv 0.8.22 and the same frozen dependency set; intentional upgrades must update the lockfile before setup. Run `uv` commands from `packages/pipeline`, where its `pyproject.toml` lives. Environment variables and service setup are documented in [RUNBOOK.md](../../RUNBOOK.md). Real retrieval also needs working Voyage credentials and Neo4j.

## Verification by change

| Changed area | Checks |
| --- | --- |
| Agent, especially tool schemas or API shapes | `npm test -w @nc-medicaid/agent` and `npm run build -w @nc-medicaid/agent` |
| Shared policy corpus | `npm test -w @nc-medicaid/policy-corpus` and `npm run build -w @nc-medicaid/policy-corpus`; check agent consumers when contracts change |
| Crawler | `npm test -w @nc-medicaid/crawler` and `npm run build -w @nc-medicaid/crawler` |
| Web | `npm test -w @nc-medicaid/web` and `npm run build -w @nc-medicaid/web`; relevant E2E for changed user flows |
| Python pipeline | From `packages/pipeline`: `uv run --extra dev python -m pytest tests/`; from the repo root: `npm run lint -w @nc-medicaid/pipeline` (Ruff and Vulture) |
| Repository documentation | Check local links, referenced commands/source, archive preservation, and `git diff --check` |

The [CI workflow](../../.github/workflows/ci.yml) adds test typechecks, corpus operational-script tests, real-Neo4j integration, mocked E2E, and production Docker builds. Provision Python dependencies before invoking root lint/test. Passing Vitest alone does not establish that schema types compile or that production bundling succeeds.

See the [Jev experiment guide](jev.md) for opt-in classifier integration, blinded reference review, cache identity and the shared $25 validation ledger.

## Evaluation and ingestion

The [answer-eval runner](../../packages/pipeline/src/pipeline/eval/levels/answer.py) defaults its subprocess observability path to `:memory:` and kills the process group on timeout. Prefer `EVAL_OPENAI_API_KEY` to isolate evaluation quota. Verification is enabled by default; use `VERIFIER_ENABLED=false` only for an intentional raw-answer debugging run.

Use the [chunked retrieval eval](../../packages/pipeline/src/pipeline/eval/levels/retrieval.py) for full mixed-corpus runs. Before changing routing based on one answer miss, inspect repeated full runs with the stability command, from `packages/pipeline`:

```bash
uv run python -m pipeline.cli eval-answer-stability --last 5 --full-only
```

The [parser](../../packages/pipeline/src/pipeline/parse/converter.py) caches using source hashes and `PARSE_CACHE_VERSION`; changed parser logic needs a cache-version bump, a targeted representation marker, or `parse --force` when regenerating existing artifacts. Fee-schedule XLSX compaction uses its own representation marker so other formats retain their caches. Per-file PDF work defaults to a 600-second timeout controlled by `PIPELINE_PARSE_TIMEOUT_SECONDS`. A PDF in a required family gets five seconds a page when that is longer, up to four hours. Load corpus families sequentially against one Neo4j instance to avoid schema races.

See [project gotchas](gotchas.md) for source identity, path normalization, policy-family routing, and past evaluation failures. Keep durable benchmark snapshots according to the [eval-results guide](../../packages/pipeline/data/eval-results/README.md).

## Starting fresh

Start new work from updated `main`. The [repository audit](repository-audit-2026-10-02.md) records retired branches, preserved drafts, remaining PRs, and recovery instructions.

## Dependency maintenance

Dependabot watches the root npm workspaces, the separate E2E npm package, the pipeline uv project, Actions and all three Node images. Review compatible updates in small groups; the dedicated SDK and test-runner groups do not imply that their releases are mutually compatible. Document-format/OCR/model dependencies require the parser qualification gates and are excluded from routine Python updates.

Keep Node 22 types aligned with the application runtime. Update coupled React/React DOM/types or Vitest/coverage packages together in their own migration. The root owns tsx because repository crawl/recovery/eval scripts invoke that runner directly.

Before merging dependency changes, require the production audit and exact-head CI builds, test typechecks, unit/integration tests, mocked browser checks and Docker builds. Run coverage for test-library changes. Pipeline CI enables its existing Neo4j integration tests against the disposable service; local runs need `RUN_NEO4J_INTEGRATION=1` and a dedicated test graph for those fixtures.

Coordinated migrations remain tracked separately: [TypeScript/ESLint](https://github.com/Queen-City-Cortex/medicaid-agent/issues/144), [Mastra/AI SDK/libSQL](https://github.com/Queen-City-Cortex/medicaid-agent/issues/145), [Zod](https://github.com/Queen-City-Cortex/medicaid-agent/issues/147), [SQLite](https://github.com/Queen-City-Cortex/medicaid-agent/issues/148), [Vitest/jsdom](https://github.com/Queen-City-Cortex/medicaid-agent/issues/162), and [parser qualification](https://github.com/Queen-City-Cortex/medicaid-agent/issues/161). Remaining compatible updates belong in [maintenance](https://github.com/Queen-City-Cortex/medicaid-agent/issues/149). Tool/image majors and React 19.3 are outside the selected maintenance cycle.
