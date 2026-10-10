# Railway corpus parser recovery

This runbook covers bounded parser-backlog recovery for the production Railway
`corpus-job`. Recovery retries unresolved parse artifacts on the persistent
volume without crawling, creating or acknowledging an answer-ready snapshot,
loading Neo4j, or promoting a corpus release.

## Production identity and safety boundary

- Railway project: `2a11b10b-43ea-4181-b975-da24adcc3322`
- Railway environment: `production`
- Railway service: `corpus-job` / `37290952-ff1d-4ee3-b46d-101cb1619997`
- Persistent corpus volume: `/data`
- Entrypoint: `scripts/ops/railway-corpus-job.sh`

Always pass the project, environment, and service explicitly. Do not paste
Railway tokens, object-storage credentials, Healthchecks URLs, database
passwords, or output from `railway variables` into tickets, chat, or this
runbook.

The entrypoint takes a non-blocking advisory lock at
`/data/.locks/corpus-job.lock` before restore, crawl, parse, release, cleanup,
or backup work and holds it through the final sync and backup. A competing run
exits nonzero with status `lock_contended` and therefore sends the Healthchecks
failure ping. The lock is kernel-owned: the file remains as owner metadata, but
TERM, INT, or a hard container stop releases the actual lock automatically.
Never delete the lock file to resolve contention; first identify or stop the
deployment that owns the lock.

## Preconditions

1. Confirm no scheduled corpus run or manual corpus deployment is active.
2. Confirm the deployed revision includes the recovery parser CLI options and
   this entrypoint.
3. Freeze merges and deploys whose Railway watch paths can replace
   `corpus-job` for the entire recovery window. The volume flock prevents two
   live writers, but it cannot prevent Railway from terminating the old
   deployment and starting its replacement.
4. Keep `HC_URL_CORPUS_JOB` configured in Railway, but never print its value.
5. Start with the default five-hour runtime budget. Do not solve clustered PDF
   timeouts by increasing the per-document 600-second timeout. A long PDF in a
   required family already gets five seconds a page, up to four hours; optional
   families keep 600 seconds.

List deployments:

```bash
npx -y @railway/cli deployment list \
  --project 2a11b10b-43ea-4181-b975-da24adcc3322 \
  --environment production \
  --service 37290952-ff1d-4ee3-b46d-101cb1619997 \
  --json
```

A `SUCCESS` deployment with `buildOnly: true` proves only that an image built;
it does not prove that recovery started, completed, synced, or backed up. Do not
use the latest build-only deployment as the recovery result.

### Merge freeze and replacement rehearsal

Before the production run, announce a temporary freeze on corpus-service-
affecting merges. Record the recovery deployment ID and an owner who can keep
the freeze in place until strict success or an explicit abort. Include changes
to the corpus-job Docker context, pipeline, crawler, and ops entrypoint; check
current Railway watch paths rather than assuming this list is exhaustive.

Rehearse replacement behavior in a non-production environment with disposable
data: start a long mocked parse child, trigger a replacement, and confirm the
old deployment logs `corpus_job_interrupted`, exits in bounded time with no
descendant process, writes the interruption marker, sends one Healthchecks
failure, and releases the flock before the replacement acquires it. Never use
the production corpus volume for this rehearsal. If Railway's stop grace period
is shorter than `CORPUS_JOB_SIGNAL_GRACE_SECONDS` (default 30), align the values
before recovery so Railway does not send KILL before checkpointing finishes.

## Start recovery

Set these non-secret service variables in Railway:

```text
CORPUS_JOB_MODE=recover-parse
CORPUS_RECOVERY_MAX_RUNTIME_SECONDS=18000
CORPUS_RECOVERY_MAX_CONSECUTIVE_TIMEOUTS=3
```

Then redeploy the service with explicit selectors:

```bash
npx -y @railway/cli redeploy \
  --project 2a11b10b-43ea-4181-b975-da24adcc3322 \
  --environment production \
  --service 37290952-ff1d-4ee3-b46d-101cb1619997 \
  --yes
```

Recovery executes the equivalent of:

```bash
python -m pipeline.cli parse \
  --retry-failures \
  --strict \
  --max-runtime-seconds 18000 \
  --max-consecutive-timeouts 3
```

There is deliberately no `--limit`: each bounded run selects the full remaining
failure inventory. Runtime and consecutive-timeout bounds stop work safely
without redefining a partial batch as success.

Only a strict, zero-exit parser result proceeds to
`sync-current-corpus.sh` and then `object-storage-backup.sh`. A strict failure,
runtime-budget stop, consecutive-timeout stop, signal, or lock collision does
not sync or back up and cannot be mistaken for a healthy run. Rerun recovery
after diagnosing failures; successful artifacts are resumed from their durable
sidecars rather than parsed again. Valid answer-ready v4 success sidecars are
upgraded atomically to the v5 artifact-integrity contract by hashing their
existing JSON and Markdown outputs; they are not sent back through OCR. Failed,
non-answer-ready, malformed, stale, or incomplete sidecars remain retryable.
An existing empty registry and every active registry row whose downloaded source
file is missing are non-overridable strict failures; crawler `error` rows
remain active and retryable because they can retain the last downloaded source.
The graph load follows the same rule: an `error` row loads when the registry
`file_hash` equals the hash in its parsed sidecar, and an answer-ready `error`
row that is not loaded fails the `missingAnswerReadyLoads` release gate.
Removed and orphaned historical files are outside the active inventory. A PDF
bypasses OCR only when
every substantive page preserves the normalized source token sequence and
character count exactly. Parsed tables always force the OCR path because text
coverage alone cannot prove cell structure.

## Observe and classify the result

Each parent run emits exactly one final line in this form:

```text
CORPUS_RUN_SUMMARY {"run_id":"...","mode":"recover-parse","status":"success|incomplete|failed|interrupted|lock_contended","exit_code":0,"elapsed_seconds":123,"run_state":"/data/pipeline/run-state/latest-parse.json"}
```

Use the final summary together with the parser checkpoint. The parser writes
`/data/pipeline/run-state/latest-parse.json` atomically after each item. Inspect
its terminal state and counters on the mounted volume; do not infer completion
from the deployment status alone.

Current parser terminal states are:

- `completed`: the selected inventory finished; with strict mode, unresolved
  supported inputs must be zero before the shell syncs and backs up;
- `max_runtime_reached`: the runtime budget stopped a partial run;
- `max_consecutive_timeouts_reached`: the timeout circuit breaker stopped a
  partial run;
- `interrupted`: TERM/INT was handled and the checkpoint was preserved;

Recovery deliberately uses `--strict`, so `completed` still exits nonzero if
*any* selected supported input remains unresolved. The normal scheduled release
uses `--strict-required`, matching `corpus-release-policy.json`: unresolved
active required-for-answering inputs block promotion, while optional failures
remain visible in the inventory and audit without silently redefining them as
required. The shell reports both bounded terminal states above as `incomplete`
by reading the structured run-state JSON. It reports strict recovery inventory
failures and unexpected CLI failures as `failed`. Both `incomplete` outcomes
are nonzero, not release-ready, and do not sync or back up; the persistent
volume and sidecars remain resumable for the next run.

On TERM or INT, the shell forwards the signal to the parser process group,
waits for it, writes
`/data/pipeline/run-state/latest-corpus-job-interruption.json`, and exits 143 or
130. The interruption marker is written before the EXIT hook sends the
Healthchecks failure ping. The parser's own `latest-parse.json` remains the
source of per-document progress; the shell marker is fallback evidence if the
CLI cannot finish its signal checkpoint.

Useful log signals:

```text
parser recovery starting (...)
corpus_job_interrupted ...
lock corpus-job-volume held (...) — refusing overlap
CORPUS_RUN_SUMMARY {...}
```

### Response by status

| Status | Action |
| --- | --- |
| `success` | Confirm `latest-parse.json` is `completed`, current artifacts synced, encrypted backup uploaded, and Healthchecks is green. |
| `failed` | Inspect unresolved inventory and failure kinds. Fix the parser or source-specific issue; do not promote. |
| `incomplete` / `max_runtime_reached` | Confirm the checkpoint advanced and no timeout cluster dominates, then start another bounded recovery run. |
| `incomplete` / `max_consecutive_timeouts_reached` | Investigate the timed-out source family before rerunning. |
| `interrupted` | Identify the deployment/redeploy that sent the signal, confirm no parser process remains, then rerun from sidecars. |
| `lock_contended` | Find the active corpus deployment. Do not remove the lock file or launch another writer. |

If three consecutive documents time out, stop and investigate that source
family. Do not globally raise the timeout or disable strict inventory checks.

## Return to scheduled operation

After recovery reports strict success and backup success:

1. Restore `CORPUS_JOB_MODE=scheduled` in Railway.
2. Keep the bounded recovery variables or remove them; scheduled mode ignores
   them.
3. Redeploy with the same explicit project/environment/service selectors.
4. Verify the next scheduled run performs normal discovery and the gated
   blue-green workflow.
5. Promotion and snapshot acknowledgement happen only in normal discovery or
   release modes, never in `recover-parse`.

Do not leave `recover-parse` configured indefinitely: the daily cron would keep
retrying the recovery selector and would not perform normal discovery.
