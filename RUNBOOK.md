# NC Medicaid Navigator — Operations Runbook

## Incidents

**What is live.** This is the last state recorded in the repository (the
validation reports of 2 and 3 October 2026), not a live reading; the owner
should confirm each point.

- **Graph:** the agent serves one legacy graph, release
  `legacy-20260725-ae8595c`, on the `neo4j` service. No blue-green release has
  happened. The agent serves whichever graph four of its Railway variables
  name: `NEO4J_URI`, `NEO4J_PASSWORD`, `CORPUS_RELEASE_ID` and
  `ACTIVE_CORPUS_COLOR`. A legacy agent has no colour, so the `rollback` and
  `recover` rows below do not apply until the first blue-green release.
- **Scheduler:** the Railway `corpus-job` is parked (`sleep infinity`, no
  cron). Nothing on Railway crawls, releases or backs up the corpus. The only
  scheduled jobs are the two launchd jobs on the ops laptop: the document
  check at 07:30, which is the fallback discovery and publishes nothing, and
  the chat-store backup at 06:45. The removed Saturday job
  (`com.ncmedicaid.weekly-refresh`) was still loaded on the laptop on
  2026-10-05; the repository cannot show whether it has been unloaded since
  (see [Scheduled Checks & Backups](#scheduled-checks--backups-launchd)).
- **Health:** `/livez` says the process is up. `/readyz` (also served as
  `/healthz`) checks the graph, its release id and the chat store.
  `/dependencyz` checks the model and embedding providers. Commands and
  fields are under [Health endpoints](#health-endpoints).

| Symptom | First check | Action | Full steps |
|---|---|---|---|
| Chat fails for everyone | `/readyz`, then `/dependencyz` | Follow the row for whichever is not `ok`. Both `ok`: read the agent's deploy log | [Health endpoints](#health-endpoints) |
| Every answer is withheld | Agent log: `chat.verification` reason, `verifier.failed_closed`, `verifier.deadline_aborted`; then `/dependencyz` | Fix the provider, or `VERIFIER_MODEL` and its key. Never set `VERIFIER_ENABLED=false`: production refuses to start. Withheld is the safe state | [Answer release](docs/operations/answer-release-and-recovery.md#operational-checks) |
| `/readyz` returns 503 | Its body: `neo4j`, `storage`, `releaseId` | `neo4j: error`: the graph is down, or its release id is not `CORPUS_RELEASE_ID`. `storage: readonly`: the chat store row | [Health endpoints](#health-endpoints) |
| `/dependencyz` returns 503 | Which of `voyage`, `openai`, `anthropic` is `error`; log `dependencyz.openai_failed` and its `status` | 429: the quota row. 401 or 403: the key. 404: the classifier model was retired | [Health endpoints](#health-endpoints) |
| A deploy does not come up | `railway deployment list`, then the deployment's `--deploy` log | Start-up names the bad or missing variable (`VERIFIER_MODEL`, a provider key, `DATABASE_URL`). Correct it and redeploy | [A deploy that does not come up](#a-deploy-that-does-not-come-up) |
| Corpus job fails or ends with an unusual status | Its last log line, `CORPUS_RUN_SUMMARY` (`mode`, `status`, `exit_code`) | 3: discovery failed for a required family. 20: deferred, rollback window open. 21: snapshot already rejected, skipped. 22: already released, acknowledged. 64: bad mode or a setting left behind. 75: lock held | [Corpus-job configuration](docs/operations/blue-green-corpus-releases.md#corpus-job-configuration) |
| A release was interrupted; later runs refuse to build | Job log; `/readyz` `releaseId` against the agent's variables | Run one run with `CORPUS_JOB_MODE=recover` set on the service, then set `scheduled` back | [Interrupted cutovers](docs/operations/blue-green-corpus-releases.md#interrupted-cutovers) |
| A promoted release is bad | Is the 24-hour rollback window still open? | Set `CORPUS_JOB_MODE=rollback` on the service, redeploy, confirm `"mode":"rollback"`, set `scheduled` back. A variable in front of `railway redeploy` does nothing | [Rollback](docs/operations/blue-green-corpus-releases.md#rollback) |
| Chat store lost or corrupt | `/readyz` `storage`; newest copy in `agent/mastra/` | Restore to a new file name and repoint `DATABASE_URL`. Never overwrite the live file | [Restore the chat store](#restore-the-chat-store) |
| OpenAI quota exhausted (as on 2026-07-10) | `/dependencyz` shows `openai: error`; log status 429 | Add credit or raise the limit in the OpenAI project; `/dependencyz` recovers within about a minute | [Health endpoints](#health-endpoints) |
| Every service stopped at once | `railway usage limit status` | The workspace hard limit was reached: raise it | [Production Deployment](#production-deployment) |
| CI fails on "at least 45 days of reviewed MAGI table support left" (from 2026-11-16) | The test's message | Do the scope review and move `supported_until`. Do not edit the test | [Answer coverage scope](docs/operations/answer-coverage-scope.md#runtime-behavior) |

## Prerequisites

- Docker running (Neo4j via `docker compose up -d neo4j` or `npm run dev:infra`)
- Node.js 22.23.3, the version in `.nvmrc` and root `engines.node` (CI installs it from `.nvmrc`; the three Dockerfiles pin the same version)
- Python 3.11.13, the version in `packages/pipeline/.python-version` (CI installs it from that file; `pyproject.toml` accepts 3.11 or later), with venv at `packages/pipeline/.venv/`
- `VOYAGE_API_KEY` environment variable set (for embeddings and search)
- `OPENAI_API_KEY` environment variable set (for the agent, verifier, scope gate and prompt-injection detector)
- `ANTHROPIC_API_KEY` only if you override `AGENT_MODEL` to a Claude model

Copy `.env.example` to `.env` at the repo root and fill in keys. The agent and web packages pick up `.env` via `packages/agent/src/load-env.ts`. Note: the Mastra agent CLI does NOT get `.env` values from `tsx` / `npm exec` automatically when invoked ad-hoc — use the real entrypoints or export vars manually.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | Yes (agent) | — | OpenAI API key — always required: the verifier (`gpt-5.6-terra` unless `VERIFIER_MODEL` names a Claude model), the scope gate and prompt-injection detector (`gpt-5-mini`), and observational memory when enabled (`gpt-5.4-mini`) run on OpenAI even when the main agent model is Claude |
| `EVAL_OPENAI_API_KEY` | No | falls back to `OPENAI_API_KEY` | OpenAI key the **answer-level eval** runs the agent on, isolated from production. Set it to a separate OpenAI project/account so a research run can't drain the live agent's quota (which would surface to users as failing chats). |
| `VOYAGE_API_KEY` | Yes (search/embed) | — | Voyage AI API key for embeddings |
| `ANTHROPIC_API_KEY` | Only for a Claude model | — | Anthropic API key; needed only when `AGENT_MODEL` or `VERIFIER_MODEL` is a `claude-*` model |
| `AGENT_MODEL` | No | `gpt-5.6-terra` | Main agent model (`gpt-*`/`o3*`/`o4*` route to OpenAI, anything else to Anthropic) |
| `AGENT_REASONING_EFFORT` | No | `medium` | Reasoning effort for the chat agent and the three deep-research agents on OpenAI models: `none`, `minimal`, `low`, `medium`, `high` or `xhigh`. Any other value stops startup. Set explicitly on every request so it no longer follows each model's API default. |
| `VERIFIER_MODEL` | No | `gpt-5.6-terra` | Answer-verifier model: an OpenAI id (`gpt-*`, `o1*`, `o3*`, `o4*`) or a `claude-*` id, which needs `ANTHROPIC_API_KEY`. The agent refuses to start on any other id, or on one whose provider key is missing, because such a verifier would withhold every answer. Change it only against the [verifier benchmark](docs/operations/verifier-benchmark.md) |
| `TRACE_STORE` | No | `off` in production and CLI runs, else `duckdb` | Where Mastra persists traces/metrics for Studio. `duckdb` writes a local DuckDB file (`MASTRA_OBSERVABILITY_PATH`, default `mastra.duckdb`); `off` skips the store and exporter entirely. Off in production because the file is ephemeral, nothing reads it without Studio, and DuckDB's buffer pool grew the agent to ~10 GB idle on Railway. |
| `OBSERVATIONAL_MEMORY_ENABLED` | No | `false` | Observational memory: a model-written summary of a conversation's earlier turns, stored server-side. Off unless `true` or `1` (owner decision, October 2026); do not build on it. With it off the agent recalls the newest ten stored messages of the thread through the release gate, bounded by the 128,000-token input limiter. Working memory is always disabled. The coverage boundary and scope gate read prior turns from the stored thread and behave the same in either mode. |
| `NEO4J_URI` | No | `bolt://localhost:7687` | Neo4j connection URI |
| `NEO4J_IDLE_CLOSE_MS` | No | `300000` (5 min) | Close the Neo4j driver after this long with no session in flight; the next use reconnects. Keeps an idle agent free of bolt keep-alive/ACK packets so Railway's Serverless sleep can trigger. `0` disables. |
| `NEO4J_USER` | No | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | No | `medicaid-dev` | Neo4j password |
| `NEO4J_QUERY_TIMEOUT_MS` | No | `30000` | Server-side transaction timeout applied to every corpus query via `withSession` — bounds how long one slow query can hold a chat request |
| `VOYAGE_TIMEOUT_MS` | No | `15000` | Per-request timeout on Voyage embedding calls (the agent retries once on 429/5xx/timeout) |
| `DATABASE_URL` | No | `file:./mastra.db` | LibSQL storage URL for Mastra and the application tables. In production the agent refuses to start on the default, and a `file:` URL must begin `file:/data/` (the Railway volume) |
| `PORT` | No | `4111` | Mastra server port |
| `SENTRY_DSN` | No | — | Server-side error tracking for both agent and web. Unset = Sentry disabled (no-op). **Also skipped when the resolved environment is `development`** (see below), so a DSN in local `.env` does not report dev errors. Set per service in Railway. |
| `NEXT_PUBLIC_SENTRY_DSN` | No | — | Browser error DSN for `packages/web`. Inlined at **build** time, so on Railway it must be a **build-time** variable on the web service. |
| `SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | No | `NODE_ENV` | Environment label on events (`production`, `staging`, …). |
| `SENTRY_TRACES_SAMPLE_RATE` / `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | No | `0.1` | Performance-trace sample rate. The default traces 10% of requests so errors carry span context; set `0` for errors only. |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | No | — | Web **build-time** source-map upload. Absent = upload skipped, build still succeeds. |
| `SENTRY_RELEASE` | No | `RAILWAY_GIT_COMMIT_SHA` | Release tag on events; set from the commit SHA in both Dockerfiles. |

### Sentry error tracking

Sentry is wired into both services and is **fully disabled until `SENTRY_DSN` is set** — evals and CI run with no Sentry traffic. It is **also skipped whenever the resolved environment is `development`** (`SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, falling back to `NODE_ENV`), so a DSN left in a local `.env` will **not** send `next dev` / `mastra dev` errors into the shared project — only deploys (prod/staging) report. It captures every error plus a 10% sample of request traces (`tracesSampleRate` defaults to `0.1`), with request bodies, headers and cookies excluded from both; the request URL and query string are still sent. It does **not** replace `@mastra/observability` (LLM/agent tracing).

To enable in production (Railway):

1. Create a Sentry org + a project per service (or one shared project) and a source-map **auth token**.
2. **agent** service — runtime variables: `SENTRY_DSN`, `SENTRY_ENVIRONMENT=production`.
3. **web** service — **build-time** variables: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (these drive browser-DSN inlining + source-map upload during `next build`); **runtime** variables: `SENTRY_DSN`, `SENTRY_ENVIRONMENT=production`.

`SENTRY_RELEASE` is derived automatically from Railway's `RAILWAY_GIT_COMMIT_SHA` at build time, so uploaded source maps and runtime events resolve against the same release.

### Model Selection

The agent defaults to **`gpt-5.6-terra`** (OpenAI) — adopted 2026-07-09 after an A/B gate (`scripts/eval-ab.sh agent`) showed it matched or beat the prior `gpt-5.4` default on every judge dimension at the same price. Override `AGENT_MODEL` to experiment with other models — Claude models work for the main agent loop, but the scope gate, injection detector, and observational memory remain OpenAI-wired, and the verifier runs on OpenAI unless `VERIFIER_MODEL` names a Claude model, so `OPENAI_API_KEY` is required regardless:

Reasoning effort is a separate, explicit setting (`AGENT_REASONING_EFFORT`, default `medium`). The 2026-07-09 comparison ran each model at its own API default (none for `gpt-5.4`, medium for `gpt-5.6-terra`), so it varied model and effort together. Answer evaluation results record the model and effort the agent resolved, under `config.agent_config` and on each row.

**Unqualified production override.** The 2026-10-03 model audit records the production agent and corpus job setting `AGENT_MODEL=gpt-5.4`. That configuration is not the one release evidence was gathered on (`gpt-5.6-terra` at medium effort), and `gpt-5.4` at medium effort has not been evaluated. Until the override is removed or a qualification run covers it, treat production answers as coming from an unqualified model configuration.

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
guidance not to), per-conversation observational summaries from any period
when that feature was on, deep-research runs, feedback comments, and the
verification record of each chat answer (`answer_audit`, below). Treat
that file — and its dated backups in the Railway bucket
(`agent/mastra/`, 30-day retention; see Backups & Restore) — accordingly:
access is operational-only, never for content review, with one exception: an
exchange a user rated thumbs-down may be read to improve answers, as the
privacy page and the comment box say. Read those with
`npx tsx scripts/feedback-review.ts` (from `packages/agent`, `DATABASE_URL`
pointing at a downloaded backup), which prints the question, released answer
and comment for each recent thumbs-down whose conversation still exists. Its
output is user text: read it in the terminal, do not paste it into tickets,
chat or commits, and promote a reviewed case into `data/golden/dataset.json`
by hand, rewritten without client details. Each thumbs-down also logs
`feedback.negative` with ids and the comment's length only, so the log shows
when there is something to review.

Vendor-side copies: every OpenAI request the agent makes sets `store: false`
(one factory, `openaiModel` in `packages/agent/src/model.ts`), so OpenAI keeps
no retrievable stored Response for a prompt, and encrypted reasoning is replayed
by the agent between tool steps instead. This does **not** remove OpenAI's
abuse-monitoring logs, which the vendor documents as kept for up to 30 days
unless the organisation is approved for Zero Data Retention or Modified Abuse
Monitoring. Whether this organisation has either cannot be read from the code.
Responses stored before the change expire on the vendor's schedule; deleting a
thread in the app never reached them.

Retention in force. The periods are constants in
`packages/contracts/src/schemas.ts` with no environment override, and the
privacy page renders the same constants. `AppDatabase.runRetention` applies
them at every agent boot and every 24 hours while the agent stays up; a
sleeping agent purges when it next wakes.
- **Chat threads** — deleted after 90 days without activity
  (`CONVERSATION_RETENTION_DAYS`; a saved message resets the clock), with
  their messages, thread state, feedback and observational summary. Sidebar
  delete removes a thread and its messages sooner.
- **Observational summaries** — none are written while
  `OBSERVATIONAL_MEMORY_ENABLED` is off (the default). Rows from an earlier
  period are one per thread, never shared between a user's threads, and are
  deleted with the thread when it expires. Sidebar delete leaves the summary
  row behind; the same job sweeps it 90 days after its last update.
- **Deep-research runs** — deleted 90 days after their last update (the
  same constant), with their checkpoints, budgets and workflow snapshots.
- **Feedback** — deleted after 180 days (`FEEDBACK_RETENTION_DAYS`), or
  sooner with its expired thread. Feedback for threads deleted from the
  sidebar is pruned opportunistically (`FeedbackRepository.pruneOrphans`).
- **Verification records** (`answer_audit`) — one row per chat answer, keyed
  by the stored assistant message id (the id feedback is filed under): the
  release outcome, the verifier telemetry, each pass's findings (unsupported
  and uncited claims, relevance issues, unmatched links and quotations), the
  verifier's token usage, `CORPUS_RELEASE_ID` and the agent model. The
  findings quote short excerpts of the checked text, so treat rows as user
  content. A row never holds the question, the draft, the model's correction
  or the evidence text, and no route returns it. Deleted 90 days after it was
  written (`CONVERSATION_RETENTION_DAYS`), or sooner with its expired thread;
  rows for a thread deleted from the sidebar are deleted with it, and the
  daily retention run removes any that delete missed. To see why one answer was withheld or
  corrected, on a downloaded backup:
  `sqlite3 backup.db "SELECT outcome_json, findings_json FROM answer_audit WHERE message_id = '<message-id>'"`
  (the `chat.verification` log line carries the thread and message ids).
- **Usage events** — deleted after 400 days (`USAGE_RETENTION_DAYS`). A chat
  turn writes one row for the agent run (no phase) and one per verifier call
  (phase `verifier`); `scripts/usage-report.ts` prints them as `runs` and
  `calls`.
- **Rate-limit events** — deleted after 25 hours
  (`RATE_LIMIT_RETENTION_HOURS`).
- **Backups** — dated bucket copies are deleted after 30 days
  (`scripts/ops/backup-mastra.sh`), so anything purged above survives in
  earlier copies for up to 30 more days. The prune runs only when a backup
  run reaches its last step.
- **Account deletion requests** (privacy policy contact): delete the user in
  WorkOS, then run this command from `packages/agent` on the ops laptop.
  `<user-id>` is the WorkOS user id (`user_` followed by 26 characters);
  `<instance-id>` is the RUNNING agent instance, found after waking the agent
  as in steps 1 and 2 of the chat-store backup (see Backups & Restore):

  ```bash
  railway ssh -s '@nc-medicaid/agent' --deployment-instance <instance-id> -- \
    "sqlite3 -bail /data/mastra.db \"$(npx tsx scripts/delete-user-data.ts <user-id>)\""
  ```

  `/data/mastra.db` is the file the agent's `DATABASE_URL` names; after a
  [chat-store restore](#restore-the-chat-store) use the restored file's path.
  The deletion happened only if the output contains `USER_DATA_DELETED`;
  `railway ssh` exits 0 even when the remote command fails. The script
  prints, as one transaction, the statements `AppDatabase.deleteUserData`
  runs: the user's threads, messages, thread state, observational summaries,
  feedback, verification records, usage and rate-limit events, research runs with their
  checkpoints, budgets and workflow snapshots, and the Mastra resource row.
  It prints nothing unless given exactly one WorkOS user id, and it opens no
  database itself, so running it without the `railway ssh` wrapper is a safe
  way to read the SQL first. Do not hand-write DELETE statements instead.
  Dated backups taken before the deletion still hold the user's rows until
  each is 30 days old; after restoring one of them, run the command again
  for every user deleted since it was taken. The command has been tested
  against a local copy of the schema but not yet run against production.

### Abuse Protections

**Release check: WorkOS Production.** The agent refuses to start in production with a `sk_test_` (Staging) `WORKOS_API_KEY`. The web, agent and corpus-job services must all carry the same Production client id, `sk_live_` key and cookie password. WorkOS users cannot be copied between environments: moving a user to a new environment gives them a new user id, and the threads, research runs and feedback stored under the old id stay with the old id. Update `SYNTHETIC_RESOURCE_ID` on corpus-job to the synthetic account's new id.

**Release check: sign-up is by invitation only.** Before any release that real users can reach, confirm in the WorkOS dashboard that self-registration is off, that validation users are admitted by invitation, and that email verification is required. The agent admits every authenticated WorkOS user (`authorizeUser` in `packages/agent/src/index.ts` returns true), so the dashboard setting is the only control on who can spend the shared model budget. Until that check has been done and recorded on issue #244, treat sign-up as open: each scripted account can start up to 150 runs a day against one OpenAI balance, and the service-wide ceiling below must stay off. Keep the production OpenAI project on prepaid credit with automatic recharge off or capped; the repository cannot see or enforce that setting.

The web chat path (CLI/eval runs are unaffected) has four layers, all env-tunable:

- **Scope gate** — one classifier-model call (`CLASSIFIER_MODEL` in `packages/agent/src/model.ts`, currently `gpt-5-mini`, retiring 2026-12-11) classifies each message; clearly-off-topic requests (creative writing, homework, general trivia) are blocked before the main model runs. Ambiguous/messy benefits questions always pass. Kill switch: `SCOPE_GATE_ENABLED=false`; model override: `SCOPE_GATE_MODEL`, which also sets the injection detector and the default health-probe model. Fails open (logged + Sentry).
- **Rate limits** — per-user sliding windows on agent-run starts (chat + deep-research): `RATE_LIMIT_MESSAGES_PER_HOUR` (30) and `RATE_LIMIT_MESSAGES_PER_DAY` (150). Set a window `<= 0` to disable it. Counters live in the `rate_limit_events` table in the LibSQL store (durable across deploys; doubles as a usage audit log). To raise limits for a trusted org, bump the env vars on the Railway agent service. `RATE_LIMIT_GLOBAL_PER_DAY` is one service-wide ceiling on the same rows: allowed chat turns and research starts by all users in any 24 hours. It is off at `0` or less, the default, and is checked inside the same atomic insert as the per-user windows. **Leave it off while self-registration is open:** a shared ceiling can be used up by a few throwaway accounts, which locks every user out until runs age out of the day. Set it only after the sign-up release check above, to a number well above expected daily use (the per-user daily limit times the invited users is the upper bound). When it is reached every user gets `429` with code `service_limit_reached`, the agent logs `rate_limit.service_ceiling_reached` and reports to Sentry; raise the variable or set it to `0` to lift it at once.
- **Input caps** — `MAX_MESSAGE_CHARS` (10,000; server-side mirror of the browser cap) and `MAX_BODY_BYTES` (2 MB per request; the body carries the whole thread history).
- **Prompt injection detector** — Mastra processor on the same classifier model; blocks injection/jailbreak attempts. Fails open; a failed classifier call logs `prompt_injection.failed_open`.

Blocked messages render as an amber notice in the chat UI; rate-limited requests return `429` with a `Retry-After` header and a user-readable message. The chat stream carries only the guard's code and fixed notice, and a failed tool step shows fixed text: look up the classifier's reason (`scope_gate.blocked`) and the tool's real error (`chat.tool_error`) in the agent logs. [Answer release](docs/operations/answer-release-and-recovery.md) lists everything the stream emits. Deferred known gap: observational/working-memory ingest is not sanitized.

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
is set in `ops.env`.) When discovery fails for a source family that is required
for answering, the crawler exits 3: the daily check still parses and takes the
snapshot, never asks for a release, and exits 3 so its healthcheck fails. The Saturday job whose last step wiped and reloaded the
serving Neo4j graph in place was removed in October 2026, together with `npm run deploy-data`, its
evaluation gate and its TCP-proxy helper. Its intended successor is the
[blue-green corpus release](docs/operations/blue-green-corpus-releases.md), which rebuilds an inactive graph and
switches the agent only after the release gates pass. That path has not yet
produced a release. The changes for review cards OPS-2, OPS-3, OPS-7 and OPS-9
in the
[October 2026 review](docs/reviews/2026-10-05-full-review/issues/release-ops.md)
have merged, but the supervised first bootstrap has not been run and the
Railway corpus job is still parked.
Until a first release succeeds there is no exercised procedure for publishing a
new corpus to production.

The Saturday job's launchd entry is not removed by a checkout or by
`scripts/ops/install-launchd.sh`, which no longer knows its label. It was
still loaded on the ops laptop on 2026-10-05, and its plist names a script
that no longer exists. Unloading it is the owner's step, and the repository
cannot show whether it has been done:

```bash
launchctl bootout gui/$(id -u)/com.ncmedicaid.weekly-refresh; rm ~/Library/LaunchAgents/com.ncmedicaid.weekly-refresh.plist
```

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

### Health endpoints

None of the four needs a sign-in. The first request after the agent has slept
wakes it and can take several seconds or return 502.

```bash
curl -i https://medicaid-agent-backend.up.railway.app/livez
curl -i https://medicaid-agent-backend.up.railway.app/readyz
curl -i https://medicaid-agent-backend.up.railway.app/dependencyz
```

- `/livez` returns 200 whenever the process is serving. 200 here with 503 on
  `/readyz` means the agent started and a dependency is the problem.
- `/readyz` and `/healthz` are one handler, and `/readyz` is the Railway
  deploy healthcheck. The body has `status` (`ok` or `degraded`), `neo4j`
  (`connected` or `error`), `storage` (`writable` or `readonly`) and
  `releaseId`. `neo4j` is `error` when the graph cannot be reached and also
  when `CORPUS_RELEASE_ID` is unset, or the graph's release marker is missing
  or is not that id; the log line is `readyz.neo4j_failed` for the first
  and `readyz.release_identity_failed`, with both ids, for the second. A
  mismatch after a corpus release is an
  [interrupted cutover](docs/operations/blue-green-corpus-releases.md#interrupted-cutovers).
  `storage` is `readonly` when a test write to the chat store fails; no log
  line carries the cause. If a redeploy, which resets the volume's ownership,
  does not clear it, see [Restore the chat store](#restore-the-chat-store).
- `/dependencyz` reports the providers only, never the graph: `voyage`,
  `openai`, and `anthropic` when `AGENT_MODEL` is a Claude model, each `ok` or
  `error`, with 503 if any is `error`. Each result is cached for a minute.
  The OpenAI probe makes a one-token call to the classifier model, so it fails
  when the account's quota is exhausted, which a key check alone would not
  show. The log line `dependencyz.openai_failed` carries the HTTP status: 429
  is quota or rate limit (the 2026-07-10 production outage was an exhausted
  quota: every chat failed until credit was added), 401 or 403 is the key, 404
  means the probed model no longer exists (`gpt-5-mini` leaves the API on
  2026-12-11; see the [project gotchas](docs/development/gotchas.md)), and 5xx
  is the provider. For quota, add credit or raise the limit in the OpenAI
  project the production key belongs to, wait for the cache to expire, and
  check `/dependencyz` again. Keep answer evaluations on `EVAL_OPENAI_API_KEY`
  so they cannot spend the production balance.

### A deploy that does not come up

The agent validates its settings before it listens. It exits at start-up, and
the deploy log names the setting, when `OPENAI_API_KEY`, `VOYAGE_API_KEY`,
`WORKOS_CLIENT_ID` or `WORKOS_API_KEY` is missing, when `VERIFIER_MODEL` is
not an OpenAI or `claude-*` id or its provider key is missing, when
`VERIFIER_ENABLED=false`, or when `DATABASE_URL`, `NEO4J_URI`,
`NEO4J_PASSWORD` or `CORS_ORIGINS` holds a development value. CI builds the
agent image and boots it until `/livez` answers, so a bundle that cannot
start should fail CI before it reaches Railway; CI uses placeholder settings
and cannot catch a wrong production variable. A deployment that starts but
never passes `/readyz` within the 300-second healthcheck has a graph or
chat-store problem, not a settings one: see [Health endpoints](#health-endpoints).

Find the deployment and read its log with the commands under "Check current
deploy status" and "Inspect a failed deploy" above. Correct the variable in
Railway (a variable change deploys the service unless it is made with
`--skip-deploys`), or retry the deploy from a clean worktree as above. To go back to an earlier build, the October 2026 review
cites the Railway dashboard (the service's Deployments list, an earlier
successful deployment, Rollback); that has not been exercised here, and the
CLI commands in this runbook cannot select an older deployment.

`npm run smoke:prod` uses `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` from the environment or local env files, asks a real production question, checks for a substantive answer with tool steps and sources, and writes a screenshot to `/tmp/nc-medicaid-prod-smoke.png` by default. Override with `SMOKE_BASE_URL`, `SMOKE_QUESTION`, `SMOKE_TIMEOUT_MS`, or `SMOKE_SCREENSHOT_PATH` when needed.

A run that starts a fresh thread renames it to `smoke <timestamp>` (with `SMOKE_TEST_RUN_ID` in front when set) before the persistence check, so repeat runs never collide on the question's title. A passing run then deletes that thread; if the delete fails it prints a warning and still passes. A failing run keeps the thread and prints its title and id for diagnosis: delete it from the test account's sidebar when done. The script only renames or deletes a thread whose id it recorded being created in that run.

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
| LibSQL `mastra.db`, or the file `DATABASE_URL` names after a restore (chat history, feedback, usage, rate limits, research runs, verification records, the answer-signing key) | Railway agent volume | wake via `/healthz` → in-container `VACUUM INTO` on the running instance → download → bucket `agent/mastra/` | daily (`backup-mastra.sh`) | 30 days of dated copies |
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
by hand from the repository root on the ops laptop:

```bash
scripts/ops/backup-mastra.sh    # daily prod chat-store backup
```

**No copy newer than 21 September 2026 exists yet.** Every scheduled run from
22 September to 4 October 2026 (13 days) failed at the snapshot step, starting
the day after the agent service was set to sleep when idle. The script has
been changed as described below but has not been run against production
since. The owner must take one manual backup with the command above, and the
gap is not repaired until a scheduled 06:45 run also finishes with
`mastra backup complete` and a `mastra-<date>.db` for that day is in the
bucket (`rclone lsl ncmedicaid:<bucket>/agent/mastra/`).

What the script does, in order:

1. Polls `https://medicaid-agent-backend.up.railway.app/healthz` until it
   returns 200 (up to 30 tries, 10 seconds apart). The agent sleeps when idle
   and `railway ssh` does not wake it.
2. Reads `railway status --json` and takes the RUNNING instance of the agent
   service. Every `railway ssh` call names it with `--deployment-instance`;
   left to its default after a wake, `railway ssh` can reach an obsolete
   instance and print Railway account JSON instead of command output.
3. In one remote command, removes every `/data/mastra-backup-*.db` left on the
   volume by earlier runs, checks that the database file exists, then writes
   today's snapshot with `VACUUM INTO`.
   Success is the `SNAPSHOT_OK` line in the output, not the exit code. If it
   is missing, steps 1 to 3 run once more; a second miss fails the run.
4. Downloads the snapshot with `railway service files download`, runs
   `PRAGMA integrity_check`, uploads it to `agent/mastra/` and prunes copies
   older than 30 days.
5. On exit, however the run ended (including a snapshot that failed on both
   tries, which can still have written a file), removes the snapshots from
   the volume and the local temporary directory. The remote removal must
   print `CLEAN_OK`, which is echoed only when no `/data/mastra-backup-*.db`
   remains. Without it the run pings the healthcheck's `/fail` URL and exits
   non-zero even if the upload succeeded, because the leftover is a full plaintext copy of the chat store
   that thread deletion and the retention purge do not reach. To look for
   leftovers by hand, wake the agent and list `/data` on the running instance.

One-time prereqs for `backup-mastra.sh`: `railway ssh keys add` and
`ssh-keyscan ssh.railway.com >> ~/.ssh/known_hosts`. It also needs `curl`,
`jq`, `rclone` and `sqlite3` on the launchd `PATH`.

The script backs up the file its own `DATABASE_URL` names, read from
`~/.config/nc-medicaid/ops.env` or the environment, and `/data/mastra.db` when
that is unset. It does not read the agent's Railway variable. It accepts only
`file:/data/<name>` and stops before waking the agent on anything else, and it
fails the snapshot when the named file is not on the volume. After a restore
that repoints the agent, put the same `DATABASE_URL` in `ops.env`: otherwise
the daily backup keeps copying the old file for as long as it exists.

### Restore

- **Crawler registry:** `rclone copyto ncmedicaid:<bucket>/crawler/registry/crawler-<date>.db packages/crawler/data/crawler.db`
- **Documents / parsed artifacts:** `rclone sync ncmedicaid:<bucket>/crawler/documents packages/crawler/data/documents` (same pattern for `pipeline/parsed`). A file deleted or overwritten by a bad sync also survives under `.../deleted/<date>/`.
- **Chat store (`mastra.db`):** see [Restore the chat store](#restore-the-chat-store) below.
- **Neo4j (prod graph):** the only copy of the graph is a Railway-native volume backup, if those are enabled as described above (dashboard → `neo4j` service → volume → Backups). There is no off-platform graph dump, and the script that used to rebuild the production graph from the laptop (`npm run deploy-data`) has been removed. The graph is still a derivation of the parsed artifacts + federal caches, so restore those (above) if the laptop is lost; publishing a rebuilt graph to production is the job of the [blue-green corpus release](docs/operations/blue-green-corpus-releases.md), which has not yet produced a release (the changes for review cards OPS-2, OPS-3, OPS-7 and OPS-9 have merged; the first bootstrap has not been run). Until it has, a lost Neo4j volume with no usable volume backup has no tested recovery procedure.

**Quarterly restore drill:** pull the newest `mastra-<date>.db`, run `PRAGMA integrity_check`, and spot-restore 5 random parsed JSONs, diffing against local.

### Restore the chat store

Restore to a **new file name** and point the agent at it. Do not upload over
`/data/mastra.db`. The agent leaves its write-ahead log un-checkpointed on
every sleep, so `mastra.db-wal` and `mastra.db-shm` normally sit beside the
live file; SQLite replays a write-ahead log left beside a replaced database,
which silently undoes the restore or corrupts it. A new name has no such
files beside it, and the old database stays in place if the restore has to be
abandoned. For an incident inside the same Railway project, a Railway volume
backup restore (dashboard, agent service, volume, Backups) is the
alternative.

The steps below are derived from `scripts/ops/backup-mastra.sh` and the
release scripts. The procedure as a whole has not been run against
production, and step 4 is marked where a command's form is not established.

1. List the copies and fetch one:

   ```bash
   rclone lsl ncmedicaid:<bucket>/agent/mastra/
   rclone copyto ncmedicaid:<bucket>/agent/mastra/mastra-<date>.db ./mastra-<date>.db
   ```

2. Check it locally. The output must be exactly `ok`:

   ```bash
   sqlite3 ./mastra-<date>.db 'PRAGMA integrity_check;'
   ```

3. Wake the agent and find its RUNNING instance, as steps 1 and 2 of the
   backup do: request `/healthz` until it returns 200, then read
   `railway status --json`.
4. Upload under a name that is not on the volume. Use
   `/data/mastra-restored-<date>.db`; do not use a name of the form
   `mastra-backup-*.db`, which the daily backup deletes.

   ```bash
   railway service files -s '@nc-medicaid/agent' upload ./mastra-<date>.db /data/mastra-restored-<date>.db
   ```

   Only the `download` form of this command is used by a script; the argument
   order of `upload` is assumed from it. Run
   `railway service files -s '@nc-medicaid/agent' upload --help` first. Then
   check the copy on the volume: the output must contain `ok`, because
   `railway ssh` exits 0 even when the remote command fails.

   ```bash
   railway ssh -s '@nc-medicaid/agent' --deployment-instance <instance-id> -- \
     "sqlite3 /data/mastra-restored-<date>.db 'PRAGMA integrity_check;'"
   ```

5. Point the agent at the new file and redeploy. The redeploy also gives the
   uploaded file to the `node` user the agent runs as (the entrypoint resets
   ownership of the volume on every boot).

   ```bash
   railway variable set --skip-deploys --environment production --service '@nc-medicaid/agent' DATABASE_URL=file:/data/mastra-restored-<date>.db
   railway redeploy --environment production --service '@nc-medicaid/agent' --yes --json
   ```

6. Confirm: `/readyz` returns 200 with `"storage":"writable"`, and a signed-in
   user sees the threads the copy held. At start-up the agent applies any
   schema migrations the copy lacks and runs the retention purge.
7. Put the same `DATABASE_URL` in `~/.config/nc-medicaid/ops.env` so the daily
   backup follows the agent, and run `scripts/ops/backup-mastra.sh` once: its
   first log line names the database it is backing up.
8. When the restore is confirmed, remove the old `/data/mastra.db`,
   `/data/mastra.db-wal` and `/data/mastra.db-shm` from the volume. They are a
   full plaintext copy of the chat store that thread deletion, account
   deletion and the retention purge no longer reach.

What a restore brings back and what it loses:

- The file holds everything the agent stores: threads and messages, feedback,
  usage and rate-limit events, research runs with their checkpoints and
  budgets, verification records (`answer_audit`) and the key that signs
  released answers (`answer_release_keys`). They are restored together, so
  the copy is consistent with itself: its stored answers were signed with the
  key it carries and still read as released.
- Everything written after the copy was taken is gone: threads, feedback,
  and the rate-limit and usage rows of that period.
- Never combine one database's messages with another's key. Starting the
  agent on an empty or new file creates a new key, and answers signed with a
  different key show as unverified history.
- A research run that was in progress when the copy was taken comes back in
  that state, and the recovery sweep can resume it within its two recovery
  claims.
- Accounts deleted after the copy was taken are back. Run the account
  deletion command in [Data classification & retention](#data-classification--retention)
  again for each, with the restored file's path.

## Full Rebuild (Nuclear Option)

If the local graph is corrupted or you need to rebuild from scratch. **`load --reset` drops every node and relationship in the graph that `NEO4J_URI` points at** — confirm it targets your local instance before running, and never point it at production. There is no in-place rebuild of the production graph: that path was removed, and its successor, the [blue-green corpus release](docs/operations/blue-green-corpus-releases.md), has not yet produced a release (the changes for review cards OPS-2, OPS-3, OPS-7 and OPS-9 have merged; the first bootstrap has not been run).

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
| Social Security Act | govinfo.gov Statute Compilations COMPS-8765 (Title XIX) and COMPS-8770 (Title XXI) | When the Act is amended |
