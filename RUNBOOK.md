# NC Medicaid Navigator — Operations Runbook

## Prerequisites

- Docker running (Neo4j via `docker compose up -d neo4j` or `npm run dev:infra`)
- Node.js 22.12+ (root `engines.node` is `>=22.12.0`; commander 15's ESM build needs it)
- Python 3.11+ with venv at `packages/pipeline/.venv/`
- `VOYAGE_API_KEY` environment variable set (for embeddings and search)
- `OPENAI_API_KEY` environment variable set (for the agent, verifier, prompt-injection detector, and observational memory)
- `ANTHROPIC_API_KEY` only if you override `AGENT_MODEL` to a Claude model

Copy `.env.example` to `.env` at the repo root and fill in keys. The agent and web packages pick up `.env` via `packages/agent/src/load-env.ts`. Note: the Mastra agent CLI does NOT get `.env` values from `tsx` / `npm exec` automatically when invoked ad-hoc — use the real entrypoints or export vars manually.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | Yes (agent) | — | OpenAI API key — always required: the verifier (`gpt-5.4-mini`), prompt-injection detector (`gpt-5-mini`), and observational memory (`gpt-5.4-mini`) run on OpenAI even when the main agent model is Claude |
| `EVAL_OPENAI_API_KEY` | No | falls back to `OPENAI_API_KEY` | OpenAI key the **answer-level eval** runs the agent on, isolated from production. Set it to a separate OpenAI project/account so a research run can't drain the live agent's quota (which would surface to users as failing chats). |
| `VOYAGE_API_KEY` | Yes (search/embed) | — | Voyage AI API key for embeddings |
| `ANTHROPIC_API_KEY` | Only for Claude `AGENT_MODEL` | — | Anthropic API key; needed only when `AGENT_MODEL` is a `claude-*` model |
| `AGENT_MODEL` | No | `gpt-5.4` | Main agent model (`gpt-*`/`o3*`/`o4*` route to OpenAI, anything else to Anthropic) |
| `VERIFIER_MODEL` | No | `gpt-5.4-mini` | Hallucination-verifier model |
| `NEO4J_URI` | No | `bolt://localhost:7687` | Neo4j connection URI |
| `NEO4J_USER` | No | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | No | `medicaid-dev` | Neo4j password |
| `DATABASE_URL` | No | `file:./mastra.db` | LibSQL storage URL for Mastra |
| `PORT` | No | `4111` | Mastra server port |
| `SENTRY_DSN` | No | — | Server-side error tracking for both agent and web. Unset = Sentry disabled (no-op). **Also skipped when the resolved environment is `development`** (see below), so a DSN in local `.env` does not report dev errors. Set per service in Railway. |
| `NEXT_PUBLIC_SENTRY_DSN` | No | — | Browser error DSN for `packages/web`. Inlined at **build** time, so on Railway it must be a **build-time** variable on the web service. |
| `SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | No | `NODE_ENV` | Environment label on events (`production`, `staging`, …). |
| `SENTRY_TRACES_SAMPLE_RATE` / `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | No | `0` | Performance-trace sample rate. `0` = errors only; raise (e.g. `0.1`) to enable tracing without a code change. |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | No | — | Web **build-time** source-map upload. Absent = upload skipped, build still succeeds. |
| `SENTRY_RELEASE` | No | `RAILWAY_GIT_COMMIT_SHA` | Release tag on events; set from the commit SHA in both Dockerfiles. |

### Sentry error tracking

Sentry is wired into both services and is **fully disabled until `SENTRY_DSN` is set** — evals and CI run with no Sentry traffic. It is **also skipped whenever the resolved environment is `development`** (`SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, falling back to `NODE_ENV`), so a DSN left in a local `.env` will **not** send `next dev` / `mastra dev` errors into the shared project — only deploys (prod/staging) report. It captures errors only (`tracesSampleRate` defaults to `0`); it does **not** replace `@mastra/observability` (LLM/agent tracing).

To enable in production (Railway):

1. Create a Sentry org + a project per service (or one shared project) and a source-map **auth token**.
2. **agent** service — runtime variables: `SENTRY_DSN`, `SENTRY_ENVIRONMENT=production`.
3. **web** service — **build-time** variables: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (these drive browser-DSN inlining + source-map upload during `next build`); **runtime** variables: `SENTRY_DSN`, `SENTRY_ENVIRONMENT=production`.

`SENTRY_RELEASE` is derived automatically from Railway's `RAILWAY_GIT_COMMIT_SHA` at build time, so uploaded source maps and runtime events resolve against the same release.

### Model Selection

The agent defaults to **`gpt-5.4`** (OpenAI). Override `AGENT_MODEL` to experiment with other models — Claude models work for the main agent loop, but the verifier, injection detector, and observational memory remain OpenAI-wired, so `OPENAI_API_KEY` is required regardless:

```bash
# Default (gpt-5.4)
npx mastra dev --dir src

# Cheaper OpenAI model
AGENT_MODEL=gpt-5.4-mini npx mastra dev --dir src

# Claude (also requires ANTHROPIC_API_KEY)
AGENT_MODEL=claude-sonnet-4-6 npx mastra dev --dir src
```

## Running the Web UI

Start both services:

```bash
# Terminal 1: Mastra agent server
cd packages/agent
OPENAI_API_KEY=... VOYAGE_API_KEY=... npx mastra dev --dir src

# Terminal 2: Next.js frontend
cd packages/web
npm run dev
```

Open `http://localhost:3000` to use the chat interface.

## Daily: Check for Document Changes

```bash
cd packages/crawler && npx tsx src/index.ts check
```

Sends conditional requests (ETag/If-Modified-Since) for every document in the registry. No downloads unless content changed. ~10 minutes with rate limiting.

## Weekly: Full Discovery Crawl

```bash
cd packages/crawler && npx tsx src/index.ts crawl
```

Re-fetches all index pages, discovers new documents, downloads anything new or changed. Existing unchanged documents skipped via hash comparison. ~40 minutes for a full run.

To crawl a specific source only:
```bash
npx tsx src/index.ts crawl --source clinical_policy
npx tsx src/index.ts crawl --source dhhs_policy
npx tsx src/index.ts crawl --source bulletin --since-year 2024
```

## After Crawler Finds Changes: Re-run Pipeline

```bash
cd packages/pipeline
.venv/bin/python -m pipeline.cli run-all
```

This runs all stages in order:
1. **Parse** — Docling converts new/changed PDFs to JSON (hash-cached, skips unchanged)
2. **Load** — MERGE into Neo4j (idempotent, safe to re-run)
3. **Federal Regulations** — eCFR ingest (cached 90 days)
4. **Social Security Act** — USC ingest (cached, rarely changes)
5. **Cross-references** — extract and resolve
6. **Amendments** — detect change notice → manual relationships
7. **Embeddings** — Voyage AI (only embeds sections without embeddings)
8. **Concepts** — seed and link

Or run stages individually:
```bash
.venv/bin/python -m pipeline.cli schema
.venv/bin/python -m pipeline.cli parse
.venv/bin/python -m pipeline.cli load
.venv/bin/python -m pipeline.cli ingest-cfr
.venv/bin/python -m pipeline.cli ingest-ssa
.venv/bin/python -m pipeline.cli extract-refs
.venv/bin/python -m pipeline.cli detect-amendments
.venv/bin/python -m pipeline.cli seed-concepts
.venv/bin/python -m pipeline.cli link-concepts
.venv/bin/python -m pipeline.cli embed
```

## Quarterly: Refresh Federal Sources

```bash
.venv/bin/python -m pipeline.cli ingest-cfr --refresh
.venv/bin/python -m pipeline.cli ingest-ssa --refresh
```

Federal regulations change slowly. The `--refresh` flag forces re-fetch even if cached. Use when CMS finalizes major rules.

## After Any Pipeline or Code Change: Run Eval

```bash
.venv/bin/python -m pipeline.cli schema
.venv/bin/python -m pipeline.cli eval --level retrieval
.venv/bin/python -m pipeline.cli eval-runs --last 5
.venv/bin/python -m pipeline.cli eval-compare <old_run_id> <new_run_id>
```

A regression is flagged if any metric drops more than 5%. Investigate failures before merging.

## Judge Evidence: Unified vs Legacy

As of 2026-04-23, the answer-level judge sees a **unified** evidence bundle: the
golden-dataset sections (anchor) combined with the structured tool-sourced
evidence the agent actually read (the same bundle the in-agent hallucination
verifier uses). This removes a prior false-positive class where the agent
correctly cited graph data — typically amendment effective_dates and
`change_description` strings from `getAmendments` — that the judge couldn't see
because it only received curated section `content_text`.

- **Default:** `pipeline eval --level answer` runs with the unified bundle.
- **Legacy (for A/B comparison):** `pipeline eval --level answer --legacy-evidence`
  restores the pre-2026-04-23 behavior (golden sections only, no tool outputs).
  The run's `config.evidence_mode` field records which mode was used.
- **Compare across modes carefully.** Numbers produced under `unified` and
  `legacy` are not directly comparable — the judge has strictly more evidence
  under unified, so hallucination scores are expected to be higher. Always
  diff unified-vs-unified or legacy-vs-legacy.

Per-question JSON now carries:
- `agent_evidence`: raw tool-sourced evidence the agent emitted
  (`{source_count, total_bytes, sources: [{toolName, key, text}, …]}`).
- `judge_evidence_stats`: what landed in the judge prompt
  (`{sources_used, golden_blocks_used, bytes_in_prompt, budget_trimmed,
  evidence_mode}`). If `budget_trimmed=true`, some lower-priority tool blocks
  were dropped to fit the 80 KB cap; check this first when a hallucination
  score drops unexpectedly.

## Separating Eval Signal From Judge Noise

Single-run answer-eval deltas are noisy. A question that scored 3/3 last run and 2/3 now may just be judge variance. Run `eval-answer-stability` to separate **stable misses** (questions that fail across multiple runs — real gaps worth fixing) from **high variance** (questions whose scores swing widely — judge wobble, do not chase).

```bash
.venv/bin/python -m pipeline.cli eval-answer-stability --last 5
```

Useful options:
- `--last N` — how many recent full runs to aggregate (default 5)
- `--question q-044` — focus on one question's history
- `--stable-miss-threshold 3` — stricter definition of stable (default 2)
- `--include-targeted` — also count partial-dataset runs (default excludes them)

**When to run:** After any eval delta ≥ ±0.10 overall, before planning retrieval/agent work, and to validate that a proposed fix targets real gaps (not noise).

**How to read:**
- **Stable Misses** → prioritize fixing these. Mean score + miss count indicate severity.
- **High Variance** → do not chase in isolation; rerun or re-judge to confirm.
- **Agent error** entries (e.g., "Agent exited with code 1") → tool/infra failure, not answer quality — investigate in `packages/agent/` logs.

## Validate Dataset and Graph Integrity

```bash
.venv/bin/python -m pipeline.cli eval-validate   # Check golden dataset refs exist in graph
.venv/bin/python -m pipeline.cli stats            # Node/edge counts and embedding coverage
cd packages/agent && npm run test:integration     # Opt-in real-Neo4j agent tool tests
```

## Production Deployment

Production is deployed on Railway from GitHub `main`:

- Web service: `@nc-medicaid/web`
- Agent service: `@nc-medicaid/agent`
- Agent health check: `https://medicaid-agent-backend.up.railway.app/healthz`
- Web smoke target: `https://medicaid-agent.up.railway.app/chat`

The service configs live at:

- `packages/web/railway.json`
- `packages/agent/railway.json`

In Railway, set each service's config file path to the matching repo-root path (`/packages/web/railway.json` and `/packages/agent/railway.json`). Keep the agent watch paths broad enough to include both `/packages/agent/**` and `/packages/policy-corpus/**`; the agent Docker build imports the local policy-corpus workspace.

Check current deploy status:

```bash
railway status --json
railway deployment list --service '@nc-medicaid/agent' --json
railway deployment list --service '@nc-medicaid/web' --json
```

Inspect a failed deploy:

```bash
railway logs --service '@nc-medicaid/agent' --build --lines 200 <deployment-id>
railway logs --service '@nc-medicaid/agent' --deploy --lines 200 <deployment-id>
```

If a GitHub-triggered agent deploy stalls or fails before Docker build logs appear, retry from a clean `origin/main` worktree so the deployed image exactly matches the merged commit:

```bash
git fetch origin main
git worktree add --detach /tmp/medicaid-agent-deploy origin/main
cd /tmp/medicaid-agent-deploy
railway up --project 2a11b10b-43ea-4181-b975-da24adcc3322 --environment production --service '@nc-medicaid/agent' --ci --message "Retry agent deploy for $(git rev-parse --short HEAD)"
cd -
git worktree remove /tmp/medicaid-agent-deploy
```

Verify production after any deploy:

```bash
curl -i https://medicaid-agent-backend.up.railway.app/healthz
npm run smoke:prod
```

`npm run smoke:prod` uses `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` from the environment or local env files, asks a real production question, checks for a substantive answer with tool steps and sources, and writes a screenshot to `/tmp/nc-medicaid-prod-smoke.png` by default. Override with `SMOKE_BASE_URL`, `SMOKE_QUESTION`, `SMOKE_TIMEOUT_MS`, or `SMOKE_SCREENSHOT_PATH` when needed.

## Full Rebuild (Nuclear Option)

If the graph is corrupted or you need to rebuild from scratch. **`load --reset` drops every node and relationship in the graph that `NEO4J_URI` points at** — double-check it targets the intended instance before running. (For remote/production rebuilds use `npm run deploy-data`, which prints the target graph's contents and requires explicit confirmation.)

```bash
cd packages/pipeline
.venv/bin/python -m pipeline.cli load --reset     # Drops all nodes, reloads from parsed JSON
.venv/bin/python -m pipeline.cli ingest-cfr
.venv/bin/python -m pipeline.cli ingest-ssa
.venv/bin/python -m pipeline.cli extract-refs
.venv/bin/python -m pipeline.cli detect-amendments
.venv/bin/python -m pipeline.cli seed-concepts
.venv/bin/python -m pipeline.cli link-concepts
.venv/bin/python -m pipeline.cli embed            # Re-embeds all content sections
```

This takes ~30 minutes (most time is embedding via Voyage API). The parsed JSON in `data/parsed/` is preserved — only the Neo4j graph is rebuilt.

## Troubleshooting

**Neo4j not running:**
```bash
npm run dev:infra   # creates the data volume if missing, then docker compose up -d
```

**Neo4j Browser:** `http://localhost:7474` (neo4j/medicaid-dev)

**Crawl getting 429s:** The crawler backs off automatically. If persistent, increase `defaultDelayMs` in `packages/crawler/src/config.ts`.

**Docling parse failures:** Check `file` command on the PDF — some are HTML files with `.pdf` extension (server returned error page instead of document). These can be safely ignored.

**Embedding errors:** Usually oversized batches. The embed command handles chunking automatically. If errors persist, re-run — it only processes sections without embeddings.

## Source Sites

| Source | URL | Update Frequency |
|---|---|---|
| Clinical Policies | medicaid.ncdhhs.gov/providers/program-specific-clinical-coverage-policies | Monthly |
| Bulletins | medicaid.ncdhhs.gov/providers/medicaid-bulletin | Monthly |
| State Plan Amendments | medicaid.ncdhhs.gov/meetingsnotices/medicaid-state-plan-public-notices | As needed |
| Waivers | medicaid.ncdhhs.gov (various pages) | Infrequent |
| Provider Manuals | nctracks.nc.gov/content/public/providers/provider-manuals.html | Quarterly |
| DHHS Policies | policies.ncdhhs.gov/divisional-a-m/health-benefits-nc-medicaid/ | As needed |
| Federal Regulations | ecfr.gov (42 CFR, 45 CFR) | Quarterly |
| Social Security Act | uscode.house.gov (42 USC Ch. 7) | Rarely |
