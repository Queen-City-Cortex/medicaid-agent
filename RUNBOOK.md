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
| `AGENT_MODEL` | No | `gpt-5.6-terra` | Main agent model (`gpt-*`/`o3*`/`o4*` route to OpenAI, anything else to Anthropic) |
| `VERIFIER_MODEL` | No | `gpt-5.4-mini` | Hallucination-verifier model |
| `TRACE_STORE` | No | `off` in production and CLI runs, else `duckdb` | Where Mastra persists traces/metrics for Studio. `duckdb` writes a local DuckDB file (`MASTRA_OBSERVABILITY_PATH`, default `mastra.duckdb`); `off` skips the store and exporter entirely. Off in production because the file is ephemeral, nothing reads it without Studio, and DuckDB's buffer pool grew the agent to ~10 GB idle on Railway. |
| `OBSERVATIONAL_MEMORY_ENABLED` | No | `true` | Kill switch for the cross-conversation memory features (observational + working memory), which store a per-user profile server-side (disclosed in /privacy). `false` disables both; thread history is unaffected. |
| `NEO4J_URI` | No | `bolt://localhost:7687` | Neo4j connection URI |
| `NEO4J_IDLE_CLOSE_MS` | No | `300000` (5 min) | Close the Neo4j driver after this long with no session in flight; the next use reconnects. Keeps an idle agent free of bolt keep-alive/ACK packets so Railway's Serverless sleep can trigger. `0` disables. |
| `NEO4J_USER` | No | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | No | `medicaid-dev` | Neo4j password |
| `NEO4J_QUERY_TIMEOUT_MS` | No | `30000` | Server-side transaction timeout applied to every corpus query via `withSession` — bounds how long one slow query can hold a chat request |
| `VOYAGE_TIMEOUT_MS` | No | `15000` | Per-request timeout on Voyage embedding calls (the agent retries once on 429/5xx/timeout) |
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

The agent defaults to **`gpt-5.6-terra`** (OpenAI) — adopted 2026-07-09 after an A/B gate (`scripts/eval-ab.sh agent`) showed it matched or beat the prior `gpt-5.4` default on every judge dimension at the same price. Override `AGENT_MODEL` to experiment with other models — Claude models work for the main agent loop, but the verifier, injection detector, and observational memory remain OpenAI-wired, so `OPENAI_API_KEY` is required regardless:

```bash
# Default (gpt-5.6-terra)
npx mastra dev --dir src

# Cheaper OpenAI model
AGENT_MODEL=gpt-5.4-mini npx mastra dev --dir src

# Claude (also requires ANTHROPIC_API_KEY)
AGENT_MODEL=claude-sonnet-4-6 npx mastra dev --dir src
```

### Data classification & retention

The LibSQL store on the agent's Railway volume (`/data/mastra.db`) holds
**user-generated content that may contain client PII**: chat threads (legal
aid attorneys and case managers paste real case details despite the UI's
guidance not to), working/observational memory profiles, and feedback
comments. Treat that file — and its dated backups in the Railway bucket
(`agent/mastra/`, 30-day retention; see Backups & Restore) — accordingly:
access is operational-only, never for content review.

Retention in force:
- **Chat threads** — user-controlled; sidebar delete removes the thread and
  its messages server-side. Feedback rows for deleted threads are pruned
  opportunistically (`FeedbackRepository.pruneOrphans`).
- **Rate-limit events** — pruned after ~25h; **usage events** — pruned after
  `USAGE_RETENTION_DAYS` (default 400).
- **Memory profiles** — kept while the account exists; disable entirely with
  `OBSERVATIONAL_MEMORY_ENABLED=false`.
- **Account deletion requests** (privacy policy contact): delete the user in
  WorkOS, their threads via the memory API (each thread delete also removes
  its messages; orphaned feedback is pruned automatically), then remove the
  remaining rows directly on the agent volume (or work on a downloaded
  backup, verify, and upload — see Backups & Restore):

  ```sql
  -- sqlite3 /data/mastra.db, with <id> = the WorkOS user id
  DELETE FROM mastra_threads     WHERE resourceId = '<id>';   -- if any remain
  DELETE FROM feedback           WHERE resource_id = '<id>';
  DELETE FROM usage_events       WHERE user_id = '<id>';
  DELETE FROM rate_limit_events  WHERE user_id = '<id>';
  ```

### Abuse Protections

WorkOS signup is open self-registration, so every authenticated-user protection matters. The web chat path (CLI/eval runs are unaffected) has four layers, all env-tunable:

- **Scope gate** — one `gpt-5-mini` call classifies each message; clearly-off-topic requests (creative writing, homework, general trivia) are blocked before the main model runs. Ambiguous/messy benefits questions always pass. Kill switch: `SCOPE_GATE_ENABLED=false`; model override: `SCOPE_GATE_MODEL`. Fails open (logged + Sentry).
- **Rate limits** — per-user sliding windows on agent-run starts (chat + deep-research): `RATE_LIMIT_MESSAGES_PER_HOUR` (30) and `RATE_LIMIT_MESSAGES_PER_DAY` (150). Set a window `<= 0` to disable it. Counters live in the `rate_limit_events` table in the LibSQL store (durable across deploys; doubles as a usage audit log). To raise limits for a trusted org, bump the env vars on the Railway agent service.
- **Input caps** — `MAX_MESSAGE_CHARS` (10,000; server-side mirror of the browser cap) and `MAX_BODY_BYTES` (2 MB per request; the body carries the whole thread history).
- **Prompt injection detector** — pre-existing Mastra processor; blocks injection/jailbreak attempts.

Blocked messages render as an amber notice in the chat UI; rate-limited requests return `429` with a `Retry-After` header and a user-readable message. Deferred known gap: observational/working-memory ingest is not sanitized.

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

## Scheduled Checks & Backups (launchd)

Two data operations are scheduled on the ops laptop via launchd, with
[healthchecks.io](https://healthchecks.io) as a dead-man's switch (an alert
fires when a job *doesn't run* — laptop off, plist unloaded — not just when it
fails):

| Job | Schedule | Script | Healthcheck env |
|---|---|---|---|
| Daily document check | 07:30 | `scripts/ops/daily-check.sh` | `HC_URL_DAILY` |
| Prod chat-store backup | 06:45 | `scripts/ops/backup-mastra.sh` | `HC_URL_MASTRA_BACKUP` |

Install/refresh the schedules: `scripts/ops/install-launchd.sh` (idempotent;
`--uninstall` removes them). launchd coalesces runs missed while the laptop
slept into one run at wake. Logs: `~/Library/Logs/nc-medicaid/`. Ping URLs and
bucket config live in `~/.config/nc-medicaid/ops.env`.

No laptop job loads data into the production graph. (`daily-check.sh` can
only ask for a blue-green release, and only when `CORPUS_RELEASE_TRIGGER_URL`
is set in `ops.env`.) The Saturday job whose last step wiped and reloaded the
serving Neo4j graph in place was removed in October 2026, together with `npm run deploy-data`, its
evaluation gate and its TCP-proxy helper. Its intended successor is the
[blue-green corpus release](docs/operations/blue-green-corpus-releases.md), which rebuilds an inactive graph and
switches the agent only after the release gates pass. That path does not yet
work end to end; review cards OPS-2, OPS-3, OPS-7 and OPS-9 in the
[October 2026 review](docs/reviews/2026-10-05-full-review/issues/release-ops.md)
track the fixes.
Until they land there is no supported procedure for publishing a new corpus to
production.

The Saturday job was also the only scheduled caller of the corpus backup, so
corpus backups are manual until the Railway corpus job takes over (see
[Backups & Restore](#backups--restore)).

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
  evidence_mode}`). The 80 KB cap applies to tool blocks only; golden text is
  never charged against it. If `budget_trimmed=true`, some lower-priority tool
  blocks did not fit; check this first when a hallucination score drops
  unexpectedly. Runs under this rule record `evidence_mode: unified-v2` and
  are not comparable with earlier `unified` runs, where golden text consumed
  the budget first.

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

Cost controls live in the checked-in `railway.json` files and on the Neo4j
service, not in code:

- **Serverless (app sleeping)** is on for web and agent (`deploy.sleepApplication`).
  Railway sleeps a service after ~5 minutes with no outbound traffic and wakes
  it on the next public or private-network request, so an idle stack costs
  almost nothing. Observed on 2026-09-21: the agent was stopped 8 minutes after
  its last packet and answered its first request after a 7 s cold start (web:
  ~2 s); the agent ready check allows 300 s. Anything that talks outbound on a
  timer (a synthetic monitor, a keepalive, an idle database connection) defeats
  sleeping — keep such probes coarse. `NEXT_TELEMETRY_DISABLED=1` is set on the
  web service because Railway lists Next.js telemetry as a known blocker.
  **Railway's metrics feed lags ~10 minutes**, so to know whether a service is
  actually asleep read its deploy logs (`Mastra shutdown completed` /
  `Starting Container`) rather than the memory graph. The agent logs
  `LibSQLStore: Failed to checkpoint WAL before close` on every sleep; LibSQL
  replays the WAL on the next open, so nothing is lost.
- **Memory limits** (`deploy.limitOverride.containers.memoryBytes`): agent 4 GiB,
  web 1 GiB. A service that exceeds its limit is restarted rather than billed
  for open-ended growth. Railway bills RAM at $10/GB-month, so memory is the
  whole bill; check `railway usage` and
  `railway metrics --service '@nc-medicaid/agent' --since 7d --memory` when
  the estimate climbs. The agent logs `process.memory` every 15 minutes
  (rss/heap/external) so a ramp is attributable from logs.
- **Neo4j** has no config file (it deploys from the `neo4j` image), so its heap
  and page cache are capped by service variables:
  `NEO4J_server_memory_heap_initial__size=512m`,
  `NEO4J_server_memory_heap_max__size=512m`,
  `NEO4J_server_memory_pagecache_size=512m` (2.3 GB → ~1.6 GB idle), and
  `NEO4J_server_bolt_connection__keep__alive__for__requests=OFF`. Note that an
  idle bolt connection was still measured exchanging one packet each way per
  minute with that set (Neo4j's keep-alive scheduler), and each packet counts as
  activity for Railway's Serverless sleep. The mechanism that actually lets the
  agent sleep is `NEO4J_IDLE_CLOSE_MS`: the agent drops its driver, and with it
  the connection, after that long without a session.
- Workspace usage limits (`railway usage limit status`): the **hard** limit
  stops every service in the workspace when reached — raise it before it trips
  rather than after.

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

## Backups & Restore

Production's data has three tiers, each with its own backup path. Off-platform
copies live in the Railway bucket (`backups`, region iad) — rclone remote
`ncmedicaid:`, configured on the ops laptop (`~/.config/rclone/rclone.conf`,
credentials via `railway bucket credentials --bucket backups`). Script config
(bucket name, healthchecks ping URLs) lives in `~/.config/nc-medicaid/ops.env`.

| Data | Where | Backup | Cadence | Retention |
|---|---|---|---|---|
| Crawler registry (`crawler.db`) | laptop | `VACUUM INTO` snapshot → bucket `crawler/registry/` | manual (`backup-corpus.sh`) | 90 days of dated copies |
| Downloaded PDFs (~3 GB) | laptop | `rclone sync` → `crawler/documents/` (+`crawler/deleted/<date>/` undo) | manual | deleted-file undo kept 120d |
| Parsed artifacts (~3 GB) | laptop | `rclone sync` → `pipeline/parsed/` (+undo) | manual | deleted-file undo kept 120d |
| Golden/audits/references/ecfr-cache/eval-results | laptop | `rclone sync` → `pipeline/<dir>/` | manual | mirrors |
| LibSQL `mastra.db` (chat history, feedback, rate limits) | Railway agent volume | in-container `VACUUM INTO` → download → bucket `agent/mastra/` | daily (`backup-mastra.sh`) | 30 days of dated copies |
| Neo4j graph | Railway volume | **no off-platform copy** — Railway volume backups only (see below) | n/a | n/a |

Also enable **Railway-native volume backups** (dashboard → service → volume →
Backups → Daily + Weekly) on both the agent volume and the Neo4j volume. They
restore fastest but live in the same project — the bucket copies above are the
independent tier.

**Corpus backups are manual.** No job runs `scripts/ops/backup-corpus.sh`
since the Saturday laptop job was removed, and it stays that way until the
Railway corpus job takes over. Run it from the ops laptop after any crawl or
parse whose results you want kept; the laptop rows above are only as fresh as
the last manual run:

```bash
scripts/ops/backup-corpus.sh    # manual corpus/crawler backup (pings HC_URL_BACKUP if set)
```

The chat-store backup is scheduled (see the launchd table) and can also be run
by hand:

```bash
scripts/ops/backup-mastra.sh    # daily prod chat-store backup
```

One-time prereqs for `backup-mastra.sh`: `railway ssh keys add` and
`ssh-keyscan ssh.railway.com >> ~/.ssh/known_hosts` (the script snapshots
inside the container over Railway SSH, then downloads via
`railway service files download`).

### Restore

- **Crawler registry:** `rclone copyto ncmedicaid:<bucket>/crawler/registry/crawler-<date>.db packages/crawler/data/crawler.db`
- **Documents / parsed artifacts:** `rclone sync ncmedicaid:<bucket>/crawler/documents packages/crawler/data/documents` (same pattern for `pipeline/parsed`). A file deleted or overwritten by a bad sync also survives under `.../deleted/<date>/`.
- **mastra.db (prod chat store):** pick a dated copy, `sqlite3 file 'PRAGMA integrity_check;'`, then `railway service files upload -s '@nc-medicaid/agent' <file> /data/mastra.db` **while the service is stopped/redeploying**, or use a Railway volume-backup restore for same-project incidents.
- **Neo4j (prod graph):** the only copy of the graph is a Railway-native volume backup, if those are enabled as described above (dashboard → `neo4j` service → volume → Backups). There is no off-platform graph dump, and the script that used to rebuild the production graph from the laptop (`npm run deploy-data`) has been removed. The graph is still a derivation of the parsed artifacts + federal caches, so restore those (above) if the laptop is lost; publishing a rebuilt graph to production is the job of the [blue-green corpus release](docs/operations/blue-green-corpus-releases.md), which does not yet work end to end (review cards OPS-2, OPS-3, OPS-7 and OPS-9). Until it does, a lost Neo4j volume with no usable volume backup has no tested recovery procedure.

**Quarterly restore drill:** pull the newest `mastra-<date>.db`, run `PRAGMA integrity_check`, and spot-restore 5 random parsed JSONs, diffing against local.

## Full Rebuild (Nuclear Option)

If the local graph is corrupted or you need to rebuild from scratch. **`load --reset` drops every node and relationship in the graph that `NEO4J_URI` points at** — confirm it targets your local instance before running, and never point it at production. There is no in-place rebuild of the production graph: that path was removed, and its successor, the [blue-green corpus release](docs/operations/blue-green-corpus-releases.md), does not yet work end to end (review cards OPS-2, OPS-3, OPS-7 and OPS-9).

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
