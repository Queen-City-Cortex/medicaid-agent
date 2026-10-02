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

## Evaluation and ingestion

The [answer-eval runner](../../packages/pipeline/src/pipeline/eval/levels/answer.py) defaults its subprocess observability path to `:memory:` and kills the process group on timeout. Prefer `EVAL_OPENAI_API_KEY` to isolate evaluation quota. Verification is enabled by default; use `VERIFIER_ENABLED=false` only for an intentional raw-answer debugging run.

Use the [chunked retrieval eval](../../packages/pipeline/src/pipeline/eval/levels/retrieval.py) for full mixed-corpus runs. Before changing routing based on one answer miss, inspect repeated full runs with the stability command, from `packages/pipeline`:

```bash
uv run python -m pipeline.cli eval-answer-stability --last 5 --full-only
```

The [parser](../../packages/pipeline/src/pipeline/parse/converter.py) caches using source hashes and `PARSE_CACHE_VERSION`; changed parser logic needs a cache-version bump or `parse --force` when regenerating existing artifacts. Per-file PDF work defaults to a 600-second timeout controlled by `PIPELINE_PARSE_TIMEOUT_SECONDS`. Load corpus families sequentially against one Neo4j instance to avoid schema races.

See [project gotchas](gotchas.md) for source identity, path normalization, policy-family routing, and past evaluation failures. Keep durable benchmark snapshots according to the [eval-results guide](../../packages/pipeline/data/eval-results/README.md).

## Starting fresh

Start new work from updated `main`. The [repository audit](repository-audit-2026-10-02.md) records retired branches, preserved drafts, remaining PRs, and recovery instructions.
