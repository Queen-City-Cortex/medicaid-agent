# Blue-green corpus releases on Railway

This runbook provisions and operates the production corpus release boundary.
The application never mutates the active graph during a release. It completely
rebuilds the inactive color, runs mandatory audits and evaluations, changes the
agent target once, and keeps the old graph available for rollback.

## Railway topology

Create these services in the existing production environment:

| Service | Source | Persistent storage | Runtime |
| --- | --- | --- | --- |
| `neo4j-blue` | `neo4j:2026.05-community` | Dedicated volume at `/data` | Active or retained |
| `neo4j-green` | `neo4j:2026.05-community` | Dedicated volume at `/data` | Active or retained |
| `corpus-job` | This repository, config `/packages/pipeline/railway.json` | Dedicated volume at `/data` | Daily UTC cron |

Do not add public domains or permanent TCP proxies to either Neo4j service.
Railway private networking provides
`neo4j-blue.railway.internal` and `neo4j-green.railway.internal`. Railway can
assign an unrelated generated private DNS name when a service is created, so
set each service's private DNS name explicitly under **Settings → Private
Networking** before configuring these URIs. The two
graphs must use different generated passwords. Apply the non-secret settings
in [`deploy/railway/neo4j.env.example`](../../deploy/railway/neo4j.env.example).

Enable daily and weekly Railway volume backups for both Neo4j volumes. Volume
backups are a fast, same-project recovery path; encrypted corpus archives in
Object Storage remain the independent rebuild path.

## Corpus-job configuration

Mount its volume at `/data` and configure:

```text
CORPUS_DATA_ROOT=/data
CORPUS_JOB_MODE=scheduled
RAILWAY_ENVIRONMENT=production
RAILWAY_AGENT_SERVICE=@nc-medicaid/agent
NEO4J_BLUE_URI=bolt://neo4j-blue.railway.internal:7687
NEO4J_GREEN_URI=bolt://neo4j-green.railway.internal:7687
NEO4J_BLUE_PASSWORD=<secret>
NEO4J_GREEN_PASSWORD=<secret>
NEO4J_USER=neo4j
AGENT_PUBLIC_URL=https://<agent-domain>
SYNTHETIC_USER_EMAIL=<existing-production-test-account>
SYNTHETIC_USER_PASSWORD=<test-account-secret>
WORKOS_CLIENT_ID=<application-client-id>
WORKOS_API_KEY=<secret>
SYNTHETIC_RESOURCE_ID=<optional-account-id-binding>
RAILWAY_PROJECT_ID=<project-uuid>
RAILWAY_ENVIRONMENT_ID=<environment-uuid>
RAILWAY_AGENT_SERVICE_ID=<agent-service-uuid>
BACKUP_AGE_RECIPIENT=<age-public-recipient>
RAILWAY_TOKEN=<project-scoped-token>
EVAL_IDENTITY_CATALOG=/data/pipeline/releases/evidence-identities.json
HC_URL_CORPUS_JOB=<optional-healthchecks-io-ping-url>
```

`EVAL_IDENTITY_CATALOG` names the frozen evidence identity catalog that
`eval-identity-catalog` writes during [initial bootstrap](#initial-bootstrap).
Every release evaluation requires it, so it stays set for scheduled runs.

Inject `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `REGION`, and `ENDPOINT`
from the existing Railway Object Storage bucket by variable reference. Also
provide the current OpenAI, Voyage, WorkOS, and evaluation-judge secrets.

The scheduled job exits after each run. Railway skips a cron occurrence if the
previous one is still active, so a stuck job must be treated as an incident.

When discovery fails for a source family that is required for answering, the
crawler finishes its run and exits 3. The `scheduled` and `discover` modes then
still parse, take the answer-ready snapshot and mirror the corpus (`scheduled`
also backs it up), but skip promotion and do not acknowledge the snapshot, and
the job exits 3 so the healthcheck fails. The next clean run compares against
the last acknowledged snapshot and promotes then. Any other non-zero crawler
status is a crash and stops the job before parsing.

A source snapshot that a release gate already rejected is not rebuilt. The
[release preflight](#release-preflight) finds the rejected manifest and
`promote` exits 21 before any graph is restarted; `scheduled` and `discover`
then finish the mirror (`scheduled` also the cleanup and the backup), leave the
snapshot unacknowledged and exit 21, so the healthcheck fails every day until
the corpus, the code, the policy or an override changes. Any other `promote`
failure still stops the job where it happened.

`promote` has three statuses the job reads as something other than a failure
of the release, each from one place:

| Status | Meaning | `scheduled` and `discover` then |
| --- | --- | --- |
| 20 | The inactive graph is inside its rollback window (`release-retention-check`) | Leave the snapshot unacknowledged, finish, exit 0 |
| 21 | This snapshot was already rejected and nothing that decides it changed (`release-preflight`) | Leave the snapshot unacknowledged, finish, exit 21 |
| 22 | The serving release is promoted and was built from this snapshot with this fingerprint (`release-preflight`) | Acknowledge the snapshot, finish, exit 0 |

75 remains the job's own lock-contention status. Status 22 covers a run that
promoted a release and then stopped before the acknowledgement (a failed
evidence upload, or a kill): the next attempt may first be deferred (20) while
the rollback window is open, and the one after acknowledges without rebuilding.

### Running one run in another mode

The job reads its mode from the service's own variables when the container
starts (`JOB_MODE="${CORPUS_JOB_MODE:-scheduled}"` in
`scripts/ops/railway-corpus-job.sh`). A variable written in front of a local
command, as in `CORPUS_JOB_MODE=rollback railway redeploy …`, is set for the
Railway CLI on the operator's machine and never reaches the container: the job
runs in the stored mode, normally `scheduled`, which crawls and can start a
promotion. The modes are `scheduled`, `discover`, `recover-parse`, `bootstrap`,
`release`, `rollback`, `recover`, `cleanup`, `audit`, `evaluate` and `backup`;
any other value exits 64.

Every mode other than `scheduled` is run the same way, with `<mode>` replaced:

1. Set the mode on the service without deploying:

   ```bash
   railway variable set --skip-deploys --environment production --service corpus-job CORPUS_JOB_MODE=<mode>
   ```

2. Start a run and keep the deployment id it prints (`.id`):

   ```bash
   railway redeploy --environment production --service corpus-job --yes --json
   ```

3. Confirm the run was in that mode. Read the log of that deployment:

   ```bash
   railway deployment list --environment production --service corpus-job --limit 20 --json
   railway logs --service corpus-job --deploy --lines 200 <deployment-id>
   ```

   The last line the job prints is
   `CORPUS_RUN_SUMMARY {"run_id":"…","mode":"<mode>","status":"…","exit_code":…,"elapsed_seconds":…,"run_state":"…"}`.
   Require `"mode":"<mode>"`, and `"status":"success"` with `"exit_code":0`
   unless the mode's own section names another status. `run_id` is the
   Railway deployment id when Railway sets `RAILWAY_DEPLOYMENT_ID`, which ties
   the line to the deployment from step 2. A deployment listed as `SUCCESS` is
   not this confirmation: a cron deployment can report `SUCCESS` with its
   instance still `CREATED` and nothing run.
4. Set the mode back as soon as the run has finished, and read it back (the
   command prints every variable of the service, so keep the filter):

   ```bash
   railway variable set --skip-deploys --environment production --service corpus-job CORPUS_JOB_MODE=scheduled
   railway variables --environment production --service corpus-job --kv | grep '^CORPUS_JOB_MODE='
   ```

Never leave another mode stored. Railway runs the start command at every cron
tick in whatever mode is stored. `release`, `rollback`, `recover`, `cleanup`,
`audit` and `evaluate` do no crawl, mirror or backup, and `backup` and
`recover-parse` do no crawl; several of them exit zero with a green
healthcheck. A forgotten mode therefore leaves the job looking healthy while
the corpus goes unrefreshed and unbacked-up, and a stored `rollback` attempts
another rollback, from the release then serving, at the next tick.

Two limits on this procedure:

- **It needs the regular configuration.** On the maintenance configuration
  (`/deploy/railway/corpus-maintenance.json`: `sleep infinity`, no cron), which
  every validation report up to 2026-10-03 records as the service's state, a
  redeploy starts another idle container and the stored mode is ignored. There
  a mode is run by invoking `scripts/ops/railway-corpus-job.sh` inside the idle
  container with `CORPUS_JOB_MODE` set for that command, as step 3 of the
  [initial bootstrap](#initial-bootstrap) does. The repository records no
  command line for that. By analogy with how `scripts/ops/backup-mastra.sh`
  reaches the agent it would be
  `railway ssh -s corpus-job --deployment-instance <instance-id> -- "CORPUS_JOB_MODE=<mode> bash scripts/ops/railway-corpus-job.sh"`,
  with the RUNNING instance taken from `railway status --json` and the result
  judged by the `CORPUS_RUN_SUMMARY` line, because `railway ssh` exits 0 when
  the remote command fails. That line has not been run: whether the session
  starts in `/app` and carries the service's variables is not established.
- **Two Railway behaviours it relies on have not been observed**; the
  rehearsal below settles them.

#### Rehearsal: what a redeploy and a stored mode do on a cron service

**Not done.** This is the owner's to run; nothing here has been tried against
Railway. It answers two questions the procedure above assumes the answer to:
does `railway redeploy` on a cron service start the command at once, or only
schedule it for the next tick; and does a `--skip-deploys` variable change
reach the next cron run without a deployment. It uses a throwaway service, so
production is not touched.

1. In a Railway project or environment that is not production, create a
   service from a small public image (`alpine`, for one) with no volume. In its
   settings set the start command to
   `sh -c 'echo "REHEARSAL mode=${CORPUS_JOB_MODE:-unset} at $(date -u +%FT%TZ)"'`,
   the restart policy to Never, and a cron schedule whose next tick is at least
   30 minutes away at a time you will be present for. Those are the three
   `deploy` settings of `packages/pipeline/railway.json`. Write the tick time
   down, wait for the first deployment to settle, and note whether creating
   the service already printed the line.
2. Store a mode without deploying, then list the deployments and check that no
   new one appeared:

   ```bash
   railway variable set --skip-deploys --environment <environment> --service <scratch-service> CORPUS_JOB_MODE=rollback
   railway deployment list --environment <environment> --service <scratch-service> --limit 20 --json
   ```

3. Note the time in UTC, redeploy, and keep the `.id` it prints:

   ```bash
   railway redeploy --environment <environment> --service <scratch-service> --yes --json
   ```

4. For ten minutes, repeat the `railway deployment list` command and write
   down each status that deployment passes through, then read its log:

   ```bash
   railway logs --service <scratch-service> --deploy --lines 200 <deployment-id>
   ```

   `REHEARSAL mode=rollback` with a time within a few minutes of step 3 means
   a redeploy runs the command at once, in the stored mode. No line means it
   did not. Record also whether the deployment was listed as `SUCCESS` while
   nothing had been printed.
5. Store the scheduled mode without deploying, and do not redeploy:

   ```bash
   railway variable set --skip-deploys --environment <environment> --service <scratch-service> CORPUS_JOB_MODE=scheduled
   ```

   Wait for the cron tick from step 1. List the deployments again (note whether
   the tick made a new deployment id) and read the log of the tick's run.
   `mode=scheduled` means the change reached the tick without a deployment;
   `mode=rollback` means it did not.
6. Delete the scratch service. Nothing else was changed, so there is nothing
   else to put back.
7. Fill in the result below with the date and `railway --version`, and add the
   two answers to the [project gotchas](../development/gotchas.md). If a
   redeploy does not start a run, replace step 2 of the procedure above with
   whatever does. If a stored mode does not reach the next tick without a
   deployment, step 4 of the procedure needs a redeploy after it, and that
   redeploy may itself start a `scheduled` run.

| Question | Result |
| --- | --- |
| Does `railway redeploy` on a cron service run the start command at once? | **Not yet rehearsed** |
| Does a `--skip-deploys` variable change reach the next cron tick without a deployment? | **Not yet rehearsed** |
| Rehearsed on (date, Railway CLI version, by whom) | |

Until the table is filled in: after step 2 of the procedure, a run has started
only if its `CORPUS_RUN_SUMMARY` line, or the lines before it, appear in the
deployment's log. If nothing appears within ten minutes, assume the run is
waiting for the next 10:00 UTC tick and that the mode is still stored. The
October 2026 review cites a dashboard control that runs a cron service at once;
it has not been tried here.

## Supervised inspection and source preparation

For an interrupted initial ingest, temporarily set the corpus-job config file to
`/deploy/railway/corpus-maintenance.json` and upload a clean checkout. This starts
an idle container with the existing volume and no cron schedule. The file takes
precedence over the service start-command field, so confirm the effective
`serviceManifest.deploy` in deployment metadata before connecting. Redeploying
an old upload may reuse its old config-file metadata.

Inspect the crawler registry and `pipeline/run-state/latest-parse.json`, then
refresh stale required sources and any new benchmark source families under the
existing `/data/.locks/corpus-job.lock`. Bootstrap parses and validates existing
files; it does not perform discovery or update downloaded sources itself.
Leave the active graph unchanged throughout this preparation. Restore the
regular config path and `CORPUS_JOB_MODE=scheduled` only after successful initial
cutover. The maintenance container must be stopped or restored when supervised
work finishes.

## Recovery and retirement before bootstrap

Keep the maintenance configuration active throughout preparation. Every import,
retirement, reactivation, and inventory operation takes the existing
`$CORPUS_DATA_ROOT/.locks/corpus-job.lock`. Do not wrap the Python operator commands
in a second `flock`; they acquire it themselves. Shell backup/sync commands must
run under that lock (the supervised corpus job already holds it).

From `packages/pipeline`, use the guarded commands:

```bash
uv run python -m pipeline.cli parse-import /data/recovery-bundle
uv run python -m pipeline.cli parse-import /data/recovery-bundle --apply
uv run python -m pipeline.cli retire-source --evidence /data/retirement.json
uv run python -m pipeline.cli retire-source --evidence /data/retirement.json --apply
uv run python -m pipeline.cli recovery-inventory --output /data/pipeline/run-state/recovery-inventory.json
```

`parse-import` defaults to validation. Its `manifest.json` has `schema_version: 1`,
`code_commit`, `parse_cache_version`, exact `code_hashes`, and `files` entries with
`file` (relative crawler path), `source_url`, `source_hash`, and `metadata_hash`.
The eight parser fingerprint paths are defined in `recovery_import.py`. Put the
JSON, Markdown and metadata sidecars at `parsed/<source-relative-stem>.*`.
Import rejects changed source identities/hashes, incompatible parser builds,
quality failures and artifact tampering before writing anything. Journals retain
prior artifacts and the local attempt metadata. A repeated import reuses valid
output without incrementing hosted attempt counts.

Retirement evidence has `schema_version: 1`, canonical `source_url`, `basis`
(`not_found`, `withdrawn`, or `superseded`), a substantive `reason`,
`original_artifact_hash`, optional official `replacement_url`, and an `evidence`
list. Each finding contains `kind`, official `url`, `checked_at`, `finding`,
`sha256` (unprefixed), and a relative `capture_path` under
`pipeline/source-retirement-evidence`. Captured bytes must match their hash.
An `index_investigation` must explain the current index and replacement search.
`not_found` also requires the registry's three consecutive 404s; other bases
require a `withdrawal_notice` that explicitly establishes withdrawal or
supersession. Redirects, missing attachments, timeouts and server errors do not
establish retirement. Operators must review the actual evidence, not merely
supply a matching JSON shape.

Retirement is durable across rediscovery. Original files and registry history
remain available. To reactivate, recover a fresh payload through the normal
crawler content/identity checks:

```bash
scripts/ops/reactivate-source.sh --url '<canonical-source-url>'
scripts/ops/reactivate-source.sh --url '<canonical-source-url>' --apply
```

The first command only validates. A replacement with a different identity or
format must be investigated as a separate source. Historical crawler
`status=removed` tombstones are not retirement evidence: `recovery-inventory`
reports them and release preparation refuses to exclude them silently. It also
reconciles registry rows that never acquired a local payload; missing required
downloads block release, while optional supporting-source failures remain visible
under the existing source-family policy.

A row whose last crawl check failed (`status=error`) keeps its earlier payload
and stays in the release. It loads when the registry `file_hash` equals the hash
in its parsed sidecar. If the hashes differ the loader skips it as
`error_without_verified_payload`, the audit reports `missing_graph_load` and the
mandatory `missingAnswerReadyLoads` gate rejects the release: re-parse the
stored payload or repair the crawl, then rebuild. An `error` row whose parse
failed counts in `requiredCurrentParseExceptions`.

## Initial bootstrap

The legacy-to-blue transition is supervised; keep the legacy graph serving until
all source and evaluation gates pass.

For a reviewed bounded product scope, first complete the isolated preparation in
[answer coverage scope](answer-coverage-scope.md). Unresolved required sources
remain visible; only exact approved limitations are excluded from blocking
counts. Scoped candidates additionally require the repeated live acceptance
gate. Scope records are not retirement evidence or permission to override gates.

1. Complete `recovery-inventory` with zero blocking required failures and zero undocumented
   removals. Freeze the code revision, source snapshot, retirement evidence and
   golden dataset 3.0 (its validated entries are the benchmark; run
   `eval-validate-golden` against the catalog). Keep maintenance mode and the writer lock.
2. Run a fresh baseline against the **legacy** graph using that exact code and
   model configuration. Run the CLI from `packages/pipeline` with its legacy
   `NEO4J_URI` and `NEO4J_PASSWORD` supplied securely:

   ```bash
   uv run python -m pipeline.cli release-baseline \
     --release-id legacy-20260725-ae8595c \
     --output /data/pipeline/releases/legacy-baseline.json
   ```

   This is evaluation evidence, not a fabricated legacy release manifest.
   Baseline and candidate require the identical benchmark, implementation and
   model fingerprint. The implementation is identified by its commit: the full
   `RAILWAY_GIT_COMMIT_SHA` the corpus job was built from, or in a git checkout
   the `HEAD` of a clean tree (a changed or untracked file is refused). Run the
   baseline, the bootstrap and the activation from one deployed commit; a
   redeploy of the corpus job from any other commit in between voids the
   baseline. When a build is uploaded by hand, upload a clean checkout and set
   `RAILWAY_GIT_COMMIT_SHA` to its commit: the image has no `.git` to check.
   Two costs follow from naming the commit. A squash-merge, or a redeploy
   triggered by any watched path, gives an unchanged tree a new commit and
   voids a paid baseline. And a hand-set `RAILWAY_GIT_COMMIT_SHA` that is left
   in place after its deploy lets different code share a fingerprint: remove
   or correct it with every upload.
   Partial runs, infrastructure errors, missing verification
   telemetry and disabled verification fail. Observability uses `:memory:`.
   Generate the canonical catalog once from the frozen source artifacts with
   `eval-identity-catalog --output /data/pipeline/releases/evidence-identities.json`.
   Set `EVAL_IDENTITY_CATALOG` to that same file for the baseline, candidate,
   activation, and later scheduled validation. The dataset version remains unchanged.
   Mapping uses canonical source URL, family, and section identity; duplicate or
   unnumbered sections need exact content and structure. Missing sections count
   as misses; ambiguous mappings invalidate the comparison. Both results retain
   raw/canonical identities, mapping evidence, and graph-specific mapping hashes.
   Those graph hashes are excluded from the common configuration fingerprint.
3. Build only the confirmed inactive blue graph using the existing bootstrap
   workflow, under the supervised writer lock. Set `CORPUS_JOB_MODE=bootstrap`,
   `BOOTSTRAP_TARGET_COLOR=blue`, `BOOTSTRAP_RESET_CONFIRM=neo4j-blue`, and
   `BOOTSTRAP_BASELINE_EVIDENCE=/data/pipeline/releases/legacy-baseline.json`.
   In the idle maintenance container, invoke `scripts/ops/railway-corpus-job.sh`
   explicitly with those variables; do not enable cron. It runs strict parsing
   and the [release preflight](#release-preflight), and only then restarts and
   resets blue for
   loading, federal ingestion, relationships, embeddings, audits and full evals.
   Bootstrap never changes the agent target. Upload the validated manifest and
   all audit/evaluation evidence with `sync-corpus-artifacts.sh` under the lock.
4. Produce an encrypted backup of the final frozen snapshot and perform the
   restore drill below. Copy its nonsecret receipt into the corpus volume. A
   backup from before further imports/retirements cannot authorize activation.
5. From `packages/pipeline`, run:

   ```bash
   uv run python -m pipeline.cli release-activate-bootstrap \
     --manifest /data/pipeline/releases/<release-id>.json \
     --backup-receipt /data/pipeline/releases/backup-restore-receipt.json
   ```

   The command checks unchanged parse inventory/source snapshot, policy gates,
   matching baseline, candidate graph marker, uploaded manifest and evidence,
   and the tested backup receipt. It saves the exact previous target securely
   in `pipeline/private-activation/<release-id>/state.json` (directory 0700,
   file 0600). This contains credentials: never upload it as ordinary evidence.
   It atomically updates URI, password, release ID and color, redeploys once,
   waits for that deployment and graph release, and runs authenticated smoke.
6. While activation waits, use its printed nonce and receipt path to run the
   fresh-login browser check from the same clean checkout:

   ```bash
   SMOKE_EXPECTED_RELEASE_ID='<release-id>' \
   SMOKE_ACTIVATION_NONCE='<printed-nonce>' \
   SMOKE_RECEIPT_PATH=/tmp/browser-receipt.json npm run smoke:prod
   ```

   Supply `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` through the existing local
   test-account configuration. Securely copy the receipt to the printed corpus
   volume path within ten minutes. The browser check verifies the expected
   release before and after chat, and compares exact answer text and verification
   outcome after thread switching and reload. Only then does activation mark
   blue promoted and upload its promotion record. A fresh-thread run renames
   its thread to `smoke <timestamp>` before those checks and deletes it once
   it has passed; a failed run keeps the thread and prints its title.
7. Deployment, smoke, browser or promotion-record failure restores the exact
   previous settings, including removal of a previously absent active color,
   and verifies legacy service recovery. If interrupted, rerun the **same**
   activation command: it restores the saved legacy configuration before any
   new attempt. A failed restoration retains `recovery_pending` and the private
   checkpoint; do not delete it or attempt another release.
8. After successful activation, restore `/packages/pipeline/railway.json` and
   `CORPUS_JOB_MODE=scheduled`, remove bootstrap-only settings, and verify fresh
   scheduled authentication and encrypted backup creation. Retain legacy until
   the later blue-to-green promotion and green-to-blue rollback rehearsal pass.

After bootstrap, the scheduled job promotes whenever the answer-ready corpus
has changed. To promote by hand, run one run in `release` mode with the steps
in [running one run in another mode](#running-one-run-in-another-mode): set
`CORPUS_JOB_MODE=release` on the service, redeploy, confirm, and set it back
to `scheduled`. Do not put the variable in front of the `railway` command. The
run promoted if its log has `Promotion verified: <release-id> on
neo4j-<color>` and `CORPUS_RUN_SUMMARY` shows `"mode":"release"` with
`"exit_code":0`. In this mode exit codes 20, 21 and 22 are passed through as
the run's own status (see the table [above](#corpus-job-configuration)), so
`"status":"failed"` with `"exit_code":20` means deferred, not broken.

## Promotion invariants

[`corpus-release-policy.json`](../../corpus-release-policy.json) is checked in
and fail-closed. Duplicate identities, missing answer-ready graph loads,
required-document parse exceptions, incomplete/wrong-dimension embeddings,
missing required source families, a required family below its minimum
document count, and evaluation failures cannot be overridden. Only
source-family count drop, total answer-ready drop, and freshness SLA failures
accept an override, written for one source snapshot as described below.

### Gate overrides

An override is an operator's decision about one candidate. The file is a JSON
object keyed by gate name (`sourceFamilyDocumentDrop`, `answerReadyDrop` or
`freshnessSla`); each entry holds exactly a reason of at least ten characters
and the source snapshot it was written for:

```json
{
  "sourceFamilyDocumentDrop": {
    "reason": "The agency merged 31 superseded bulletins into the 2026 index",
    "sourceSnapshotHash": "sha256:<64 hex characters>"
  }
}
```

Take `sourceSnapshotHash` from the rejected release's manifest
(`/data/pipeline/releases/<release-id>.json`), or `snapshot_hash` from
`/data/pipeline/release-state/answer-ready-result.json`; the `sha256:` prefix
is optional. `release-validate` checks the file before any stage runs and
refuses an entry whose hash is not the candidate's, an entry in any other
shape, an unknown gate and a gate that cannot be overridden. If the corpus
changes after the file is written, the hash no longer matches and the override
must be decided again. The manifest keeps the accepted entries in
`gateOverrides` and the reason on the gate.

Put the file on the corpus volume and name it in `RELEASE_OVERRIDE_FILE` for one
operator-invoked `CORPUS_JOB_MODE=release` run, then remove the variable.
`corpus-release.sh promote` passes the file only in that mode. A `scheduled` or
`discover` run that finds the variable set exits 64 before the crawl, and
`promote` outside release mode exits 64 before it reads Railway.

Bootstrap is operator-invoked and takes the same file: set
`RELEASE_OVERRIDE_FILE` beside the bootstrap variables for that run. Its
preflight checks the file against the manifest it has just prepared and stops
before the graph is reset if an entry names another snapshot, so the first
release can run from a frozen snapshot whose discovery is more than a day old
with a `freshnessSla` override. To get the hash, run bootstrap without the
file: the preflight stops on the stale family and prints the snapshot the
override must be bound to. Bootstrap activation applies the manifest's recorded
`gateOverrides` when it re-evaluates the gates, under the same binding.

### Minimum documents per family

The two count gates compare a release only with the one before it, so losses
under their limits (5% of a family, 2% of answer-ready documents) compound,
and an override waives them. `mandatory.minimumLoadedDocuments.families`
therefore sets an absolute floor on the documents loaded into the candidate
graph for each family required for answering (`loaded` in the corpus audit,
`sourceFamily.<family>.loaded` in the manifest). Each family has its own
`sourceFamilyMinimum.<family>` gate; a family missing from the audit fails it,
and no override waives it. These gates are decided before the answer stage.

The values are provisional (`"provisional": true`): 80% of what the 2026-10-03
preparation build loaded for each family, rounded down. The `dhhs_policy`
value first subtracts the about 308 documents the agency has dropped from its
index, which the first full crawl leaves out of the graph (see the de-listing
procedure above); without that the first release would fail this gate for the
right behaviour. Confirm every value against the first candidate graph. When the agency really shrinks a family, lower that
family's number in a reviewed change. Later releases compare with the previous
manifest, which needs no fingerprint match; only the bootstrap baseline is
tied to the commit (see [retrieval floors](#retrieval-floors-and-the-order-of-the-gates)).

Policy version 3 requires retrieval recall of at least 0.9, primary-evidence hit
rate of at least 0.95, answer score of at least 2.75, hallucination score of at
least 2.5, at most 5 withheld answers, and a regression from the baseline of at
most 0.025 on each retrieval metric and 0.15 on each answer metric.
Precision remains in release reports and baseline comparisons, without an
absolute threshold. The golden benchmark names a sparse set of known relevant
sections: at ten returned results, its current mean precision ceiling is about
0.21, so a 0.9 threshold would reject even perfect retrieval of the labeled
evidence. A future absolute precision gate requires broader relevance labeling
and calibration.

The answer and hallucination floors apply to released answers only: rows the
verifier passed or corrected. A withheld answer is not judged; it scores 0 on
the all-rows answer score and has no hallucination score. Two gates keep a
build from meeting the floors by answering less:

- `withheldAnswers` caps the withheld count. The cap is a count set against one
  benchmark size (`evaluation.withheldAnswers` holds `max` and `benchmarkSize`);
  a run of any other size fails the gate until the cap is set again. No override
  can waive it. Golden dataset 3.0 scores only validated entries (8 on
  2026-10-05), so the current value no longer matches: `release-validate` stops
  before any run, naming both sizes, until the owner sets the cap again for the
  validated count. The value, 5 of 55, is provisional (`"provisional": true`):
  [issue #259](https://github.com/Queen-City-Cortex/medicaid-agent/issues/259)
  replaces it once the candidate graph has been measured. The 2.75 floor is
  revisited there too and is unchanged until then.
- `answerScoreAllRowsRegression` compares the all-rows answer score
  (`answerScoreAllRows` in the manifest) with the baseline, so withholding the
  weakest answers lowers the compared score. The released-rows `answerScore`
  and the withheld count are not part of that comparison.

Evaluation results from before the withheld-aware harness carry neither the
released-rows mean nor the withheld count, and fail both gates.

One answer run does not decide a release. `release-validate` runs the answer
evaluation three times (`evaluation.answerRuns`) and every answer gate above
reads the mean of the three per-run values; retrieval is run once. The
`answerRuns` gate fails a manifest built from fewer than three valid runs and
accepts no override. A run with an agent, judge or verifier infrastructure
error on any question is voided: its result is kept beside the others as
`answer-evaluation-voided-<n>.json`, the manifest records an
`answer_run_voided` event, and the run is repeated. Only the first three valid
runs count. After more than two voided runs (`evaluation.maxVoidedAnswerRuns`)
validation stops with the manifest still `building` and no gate evaluated.
Each release validation therefore pays for three answer runs, and up to five
during an outage. The baseline it is compared with is still a single
`release-baseline` run.

### Retrieval floors and the order of the gates

`release-validate` decides every gate that needs no agent answer before the
answer stage: the audit and graph gates, both retrieval floors and the three
retrieval regression limits. If one fails it writes the manifest as `rejected`
with the gates decided so far and exits with `Corpus release rejected before
the answer stage by: …`. Neither the scope acceptance cases nor an answer run
is paid for, and the retrieval result is already saved as
`<release-id>/retrieval-evaluation.json`.

The two retrieval floors (`evaluation.retrievalRecall` and
`evaluation.primaryDocumentHitRate`) are **not calibrated**. 0.9 and 0.95
predate the 55-question benchmark; no retrieval run on that benchmark or on a
rebuilt graph is stored. Set them once, from a measurement:

1. Build the candidate graph (bootstrap does this). With the floors as they
   are, expect validation to stop before the answer stage on the two retrieval
   floors. That stop is the measurement.
2. Read the result:

   ```bash
   jq '{questions: (.per_question | length),
        recall: .aggregate.recall_at_k,
        primaryHit: .aggregate.primary_hit_rate,
        missing: .config.evidence_normalization.missingCanonicalIds}' \
     /data/pipeline/releases/<release-id>/retrieval-evaluation.json
   ```

   Require every validated golden question and an empty `missing` list. A labelled section absent
   from the candidate graph is a corpus defect to fix, not a number to
   calibrate around.
3. Confirm the measurement repeats. From `packages/pipeline`, with the
   candidate colour's `NEO4J_URI` and `NEO4J_PASSWORD`, the frozen
   `EVAL_IDENTITY_CATALOG` and the embedding provider key:

   ```bash
   MASTRA_OBSERVABILITY_PATH=:memory: uv run python -m pipeline.cli eval --level retrieval
   ```

   Retrieval is deterministic on one graph, so both figures must equal step 2
   exactly. This runs no answer or judge model; it pays for query embeddings.
4. Set each floor to the measured value minus 0.02 to 0.04, rounded down to two
   decimals. One question moves the primary-evidence hit rate by 0.018, so
   that margin allows one or two questions of drift between rebuilds and no
   more. Change only those two numbers in `corpus-release-policy.json`, merge
   the change, and record the measured values, the graph's release id and the
   chosen floors in issue #188.
5. Deploy the merged commit to the corpus job. The merge is a new commit and
   the evaluation fingerprint names the commit, so the legacy baseline from
   step 2 of [initial bootstrap](#initial-bootstrap) no longer matches: run
   `release-baseline` again from the merged commit (one retrieval and one
   answer run against the legacy graph).
6. Validate the same manifest again with the merged policy and the new
   baseline; do not rerun bootstrap, which resets and rebuilds the graph. The
   manifest keeps the `commitSha` the graph was built from and records the
   commit it was evaluated under in `evaluationFingerprint`. From
   `packages/pipeline` with the candidate colour's graph variables:

   ```bash
   MASTRA_OBSERVABILITY_PATH=:memory: uv run python -m pipeline.cli release-validate \
     --manifest /data/pipeline/releases/<release-id>.json \
     --baseline-evidence /data/pipeline/releases/legacy-baseline.json
   ```

   Then mark the graph (`release-mark-graph --state validated`) and upload the
   evidence with `sync-corpus-artifacts.sh`, as bootstrap would have.

The floors accept no override. The policy has no value of its own in the
evaluation fingerprint, but the fingerprint names the code commit, and a
merged policy change is a commit: that is why step 5 runs the baseline again.
The candidate graph is not rebuilt. Each validated or rejected manifest records
the policy it was gated against as `releasePolicyHash`, and each gate records
its own threshold.

### Baseline comparison

Every release is compared with a baseline: the previous release's manifest, or
at bootstrap the legacy `release-baseline` evidence. `release-validate` refuses
to start without one, and a comparison that cannot be made fails its gate: each
of `retrievalPrecision`, `retrievalRecall`, `primaryDocumentHitRate`,
`answerScoreAllRows` and `hallucinationScore` has its own
`<metric>Regression` gate and its own limit in `evaluation.maxRegression`. No
override waives them. The retrieval limit of 0.025 tolerates one benchmark
question changing and never two, on 50 or on 55 questions.

At bootstrap the comparison leaves out every question for which the legacy
graph lacks a labelled section (`missing:` evidence identities in the baseline
retrieval result; today the five beneficiary-guidance questions). The legacy
graph misses those by construction, so including them would let the candidate
lose ground on the 50 questions both graphs can answer and still show no
regression. The manifest lists them in `baselineComparisonExcludedQuestions`.
The floors still read every scored question, and a question the candidate cannot
answer stays in the comparison and counts against it. A later release is
compared with the previous manifest's figures for the whole benchmark.

Server-side answer verification remains mandatory independently of these corpus
metrics.

### Release preflight

`bootstrap` and `promote` run `release-prepare` (strict parse and the manifest)
and then `release-preflight` before the target graph is restarted, reset and
re-embedded. The preflight needs no graph. It fails, listing every problem and
its fix, when:

- `EVAL_IDENTITY_CATALOG` is unset or its file is not a catalog, or the
  evaluation fingerprint cannot be computed (verification disabled, for one);
- the baseline cannot be compared: at bootstrap the legacy baseline evidence
  has another fingerprint or is incomplete, and for a later release the
  previous manifest lacks one of the five compared metrics;
- the override file would be refused by `release-validate` (wrong shape, another
  snapshot, an unknown gate, or a gate that cannot be overridden);
- a family required for answering is past its `freshness_sla_days` by the
  audit's rule and no `freshnessSla` override covers this snapshot. The check
  reads the clock at the start of the build; a family that goes stale during
  the build still fails the gate afterwards.

It then looks in the releases directory for an earlier manifest that was
`rejected` with the same `sourceSnapshotHash`, the same `evaluationFingerprint`
(code, benchmark, catalog and model configuration; the two values read from
the built graph are left out of the comparison) and the same
`releasePolicyHash`. If that release failed a gate other than `freshnessSla`
that this run carries no override for, the same build would be rejected again:
the command exits 21 and names the release and its gates. A rejection for
staleness alone does not count, because discovery timestamps are outside the
snapshot hash. To build an unchanged snapshot again on purpose, set
`RELEASE_RETRY_REJECTED=<rejected release id>` for the run; the variable covers
that one release, so left in place it does not cover the retry's own rejection.

The result is recorded on the manifest as the `preflight` stage. A manifest
whose preflight failed stays `building` and is never uploaded.
`release-validate` is still the gate: it repeats each of these checks against
the built graph.

`promote` also stops the target Neo4j service again (`railway down`) when it
ends after restarting it and before the agent switch, so a rejected or failed
build does not leave a second graph running. Its volume is kept. Bootstrap
leaves its target running for activation.

The promotion flow is:

1. Read `ACTIVE_CORPUS_COLOR` and `CORPUS_RELEASE_ID` from the agent service
   and require a settled cutover (see [interrupted cutovers](#interrupted-cutovers)).
2. Defer if the inactive color still holds a release inside its rollback
   window (see [deferred promotions](#deferred-promotions)).
3. Parse, write the manifest and run the release preflight. Then start the
   inactive graph and wait for Bolt.
4. Reset/load, ingest federal sources, resolve references/amendments,
   embed, audit, and evaluate retrieval. Reject here, before any answer run,
   on a gate that is already decided.
5. Run the three answer evaluations, upload the building evidence and reject
   on any unapproved gate.
6. Record the cutover: stamp the serving release's manifest with
   `supersededByReleaseId` and `rollbackWindowEndsAt`, append `cutover_started`
   to the candidate, and upload both manifests.
7. Set the agent URI, release ID, and active color without an intermediate
   deploy; redeploy once.
8. Require graph-backed `/readyz`, authenticated `/corpus-status`, provider
   health, and a complete chat stream with a terminal `passed` or `corrected` outcome,
   nonempty released answer text and citations. Withheld, source-only and
   interrupted streams fail.
9. Mark the manifest promoted (the rollback window restarts from this moment),
   mark the graph, and upload both manifests.
10. Keep the old service live for the rollback window (`rollbackWindowHours`,
    24). The daily cleanup then stops its compute; its volume stays until the
    next promotion resets that color.

If the switch, the verification or the promotion record fails, automation
restores the previous agent target and exits nonzero. A restore is judged by
the agent's Railway deployment and the graph-backed `/readyz` release id, not by
the chat smoke: a withheld answer on a healthy target must not leave the
restore recorded as failed.

### Deferred promotions

`rollbackWindowEndsAt` is the only deadline on a graph. While the inactive
color holds a release inside its rollback window, `release-retention-check`
exits 20 and `promote` passes that status on without touching anything. In
`scheduled` and `discover` modes this is a deferral, not a failure: the
snapshot stays unacknowledged so the next run tries again, the cleanup, mirror
and backup still run, and the job succeeds. `CORPUS_JOB_MODE=release` and
`bootstrap` end with status 20 and the message naming the deadline.

With a 24-hour window and one run a day at 10:00 UTC, a change found the day
after a promotion is deferred once and released the day after that. Releasing
every day needs `operations.rollbackWindowHours` shorter than the cron interval
less the build time; that number is the owner's to set.

### Interrupted cutovers

The record of a cutover is the manifest the agent names. Each step writes one
thing, and `promote`, `rollback` and the cleanup all begin by reading it:

| Left behind | How it happens | What the next run does |
| --- | --- | --- |
| Agent names a `promoted` release that is not stamped as superseded, on the color and URI its manifest records, and the running agent reports that release ready on `/readyz` | A finished promotion, rollback or recovery | Proceeds |
| The same record, but `/readyz` reports another release or is not ready | The variables were set and the agent's redeploy failed, typically a restore whose three attempts all failed | Refuses: nothing is reset or stopped. `recover` checks the graph the variables name and redeploys the agent onto it |
| Agent names a `promoted` release that is stamped `supersededByReleaseId` | The job died after recording the cutover and before the switch; or the switch and its restore both failed; or a rollback switched back and died before recording it | Restores that release as the target, records the other release `rolled_back`, clears the stamp, exits nonzero |
| Agent names a `validated` or `recovery_pending` release | The job died after the switch and before the promotion was recorded, including a release that had passed verification | Restores the previous release named by the manifest, records the candidate `rolled_back`, exits nonzero |
| Agent names an unpromoted release with no previous release | Bootstrap activation was interrupted | Refuses; rerun the same `release-activate-bootstrap` command |
| The agent's color or URI disagrees with a settled manifest, or the serving manifest cannot be read from the volume or the bucket | Variables edited by hand, or lost evidence | Refuses; nothing is reset or stopped |

`bootstrap` makes the same check whenever the agent already serves a blue or
green release, because it resets the other color; beside a legacy agent, which
has no color, there is no cutover to check. Every one of these paths needs
`AGENT_PUBLIC_URL` and stops before it switches anything without it.

A restore first checks that the previous graph answers with the job's own
`NEO4J_<COLOR>_URI` and password, and leaves the agent where it is if it does
not. `promote` refuses to start when the job's password for the serving color
is not the agent's `NEO4J_PASSWORD`.

A run that restores exits nonzero and resets nothing. The snapshot is still
unacknowledged, so the following scheduled run builds and promotes again; a
release that had in fact passed verification before the job died is therefore
reverted once and released a day later. Both manifests are uploaded before the
switch, so a rebuilt corpus volume reads the same state from the bucket.

To recover without waiting for the next run, set the mode on the service (a
variable in front of the `railway` command only reaches the local CLI), run
it, and set it back. These are the steps of
[running one run in another mode](#running-one-run-in-another-mode), which
also says how to confirm the run and what is not yet established about a
redeploy:

```bash
railway variable set --skip-deploys --environment production --service corpus-job CORPUS_JOB_MODE=recover
railway redeploy --environment production --service corpus-job --yes --json
# when CORPUS_RUN_SUMMARY shows "mode":"recover":
railway variable set --skip-deploys --environment production --service corpus-job CORPUS_JOB_MODE=scheduled
```

`recover` exits zero with a green healthcheck and does no crawl, mirror or
backup, so a mode left on `recover` looks healthy while the corpus goes
unrefreshed and unbacked-up: always set it back.

`recover` does the same restore and exits zero when it completes, or when there
is nothing to recover. When the variables and the running deployment disagree
it redeploys the agent onto the release the variables name, after checking that
graph answers; if it does not, it changes nothing and prints the manual steps. If the previous target cannot be restored the candidate
stays `recovery_pending` with a `cutover_restore_failed` event, every later run
keeps refusing to build, and `recover` can be repeated once Railway or the
graph is reachable again. The abandoned graph is left running for inspection;
the next promotion restarts and resets it. One exception: a run terminated
after the cutover was recorded and before the switch has its target stopped by
the exit hook, so the recovery's `release-mark-graph --state rolled_back` then
fails against a stopped graph and the run reports the recovery as incomplete.
The agent and both manifests are already correct in that case; the marker
belongs to a graph the next promotion resets.

## Rollback

Rollback applies only after a second blue-green promotion. Beside a legacy
agent, which has no `ACTIVE_CORPUS_COLOR`, and on the first release, whose
manifest names no `previousReleaseId`, `rollback` exits 64 and changes
nothing. A failed first activation goes back to the legacy graph through
`release-activate-bootstrap` (step 7 of the
[initial bootstrap](#initial-bootstrap)), not through this mode.

Within the rollback window, with the service on its regular configuration:

1. Set the mode on the service. A variable in front of the `railway` command
   only reaches the local CLI, and the job would then run `scheduled`: a crawl,
   and possibly a new promotion, while the window runs out.

   ```bash
   railway variable set --skip-deploys --environment production --service corpus-job CORPUS_JOB_MODE=rollback
   ```

2. Redeploy and keep the deployment id:

   ```bash
   railway redeploy --environment production --service corpus-job --yes --json
   ```

3. Confirm in that deployment's log
   (`railway logs --service corpus-job --deploy --lines 200 <deployment-id>`)
   that the run printed `Rollback verified: <previous-release-id> on
   neo4j-<color>` and ended with `CORPUS_RUN_SUMMARY` showing
   `"mode":"rollback"`. Any other mode in that line means the rollback did not
   run. `"exit_code":1` after `Rollback verified` means the rollback is
   recorded and serving but its chat smoke failed: check an answer by hand.
   Then confirm the agent itself: `/readyz` must return 200 with the previous
   release as `releaseId`.
4. Set the mode back at once, and read it back:

   ```bash
   railway variable set --skip-deploys --environment production --service corpus-job CORPUS_JOB_MODE=scheduled
   railway variables --environment production --service corpus-job --kv | grep '^CORPUS_JOB_MODE='
   ```

   A stored `rollback` runs again at the next cron tick, against the release
   then serving.

[Running one run in another mode](#running-one-run-in-another-mode) has the
two things this relies on that are not yet established (whether a redeploy of
a cron service starts the run at once, and whether the restored mode reaches
the next tick without a deployment) and what to do on the maintenance
configuration, where a redeploy runs nothing.

Rollback first requires a settled cutover: after an unfinished one it restores
the previous release as above and stops, which is the rollback. Otherwise it
starts the previous color if necessary, switches the agent, and waits for the
agent's deployment and the previous graph-backed release ID on `/readyz`. That
is what decides it, as for a restore: the previous release already passed its
smoke when it was promoted, and one withheld answer must not send the agent
back to the release being left. It then records the event in both manifests
and runs the authenticated smoke; a failed smoke is reported and fails the run
but moves nothing. An expired rollback window fails before mutation. If
the job dies after the switch, the next run completes the record.

## Artifacts and recovery

Railway Object Storage holds:

- mutable current mirrors of crawler registry/source artifacts and parsed
  artifacts;
- release manifests plus per-release audit/evaluation evidence;
- generated audit and evaluation history;
- age-encrypted full corpus archives.

Retirement records live in the crawler SQLite registry; their captured official
responses are mirrored and restored from `pipeline/source-retirement-evidence`.
Encrypted archives include both, source originals and all parse-import journals.
The mutable registry mirror is made through SQLite's backup operation, so WAL
transactions are included. Never include `private-activation` in plaintext mirrors.

Create one dedicated age identity in macOS Keychain under service
`Queen-City-Cortex.medicaid-agent.corpus-backup.age`, account `production`.
Only its public `age1...` recipient belongs in Railway's `BACKUP_AGE_RECIPIENT`.
Keep private key material out of files, shell arguments, logs and Railway.
Run `object-storage-backup.sh` under the corpus writer lock, download the
resulting encrypted object, and restore-check it with a locally built corpus image:

```bash
python3 scripts/ops/verify-corpus-backup.py \
  --archive /tmp/corpus-<timestamp>.tar.gz.age \
  --receipt /tmp/backup-restore-receipt.json \
  --image nc-medicaid-corpus-job
```

The tool retrieves the private key through Security.framework, pipes it into
container tmpfs, streams decrypted archive contents, extracts SQLite into
short-lived temporary storage, verifies database integrity, parsed-artifact and
retirement-evidence hashes, and records the archive and source-snapshot hashes.
It does not retain decrypted source files or private keys. Preserve and upload
the nonsecret receipt with the release evidence. Activation requires the receipt
to describe the exact frozen source snapshot.

Fresh authentication uses the existing production test account's password grant
immediately before each smoke run. Five-minute access tokens are intentionally
not stored as scheduled-release configuration. The standalone smoke supports an
explicit unexpired token for operator diagnostics, but release automation requires
the fresh credential path. It never falls back to a cached token after auth fails.

`restore-corpus-artifacts.sh` hydrates a fresh corpus-job volume. Rebuilding the
inactive graph on every release is the graph restore drill. A release manifest
is written atomically after every stage so that partial JSON is never read as
evidence; it is not a checkpoint. Every restart is a full rebuild: a failed or
interrupted build is not resumed, and the next `promote` prepares a new
release, resets the inactive graph and loads and embeds it from empty.

## Retiring workstation scheduling

The Saturday launchd job that pushed the corpus into the serving graph in
place has already been removed, with its scripts. The remaining launchd agents
(daily document check and chat-store backup) stay until two Railway-run
promotions and one rollback rehearsal succeed. Then uninstall them with
`scripts/ops/install-launchd.sh --uninstall`; local scripts remain for
development only.

Railway references:

- [Private networking](https://docs.railway.com/private-networking)
- [Cron jobs](https://docs.railway.com/cron-jobs)
- [Volumes and live resizing](https://docs.railway.com/volumes)
- [Volume backups](https://docs.railway.com/volumes/backups)
- [Storage buckets](https://docs.railway.com/storage-buckets)


## Resumable source audit

Keep `corpus-job` in maintenance mode and leave the agent on legacy while any
required source, undocumented removal, classification, identity, or release gate
is unresolved. Use the existing writer lock for all mutations and inventories.

1. Capture a selected `documents` array from a locked read of the crawler registry.
   From `packages/pipeline`, run
   `CORPUS_DATA_ROOT=/data uv run python -m pipeline.cli source-audit --collect-input selection.json --output /data/pipeline/source-audit-evidence/<audit-id>`.
   Optional `urls` add reviewed official index/replacement leads. Captures preserve
   registry/download history, canonical URLs, redirects, timestamps and SHA-256
   response hashes. Collection uses the normal crawler rate, robots, retry and
   domain checks. The exact archive hostname is allowed only because an official
   index links to it. Failed DNS observations cannot become 404 evidence.
2. Resume with the same input/output. Cached captures are hash-checked and do not
   increment attempts or availability counters. After exhausted DNS retries, other
   links on that host are explicitly recorded as unvisited. Use a new directory
   for a deliberate fresh observation; never relabel a cached response as fresh.
3. Author a version-1 reviewed action bundle. Each action has a unique `action_id`,
   `source_url`, SHA-256 `registry_hash` (canonical sorted JSON), original artifact
   hash when present, `disposition` (`retire`, `classify`, or `unresolved`), and
   reviewed evidence. Run `source-audit --reviewed actions.json` to validate;
   only `--apply` mutates state. Application rechecks current registry and original
   bytes while locked and journals each action. Resume with the same IDs after
   interruption; changing an existing action's evidence is rejected.
4. A classification includes `schema_version: 1`, `resource_role`, a substantive
   finding, the exact source capture and all `children` from that captured index.
   Every document child is registered transactionally before index exclusion.
   Missing children remain required failures. Retain the index artifact.
5. Version-2 retirement evidence requires explicit `payload_state`:
   `original_present` retains the original SHA-256, while `never_downloaded`
   requires consistent empty registry history, `history_complete: true`, retained
   registry/artifact snapshots and their tested encrypted-backup restore receipts.
   Lost originals and contradictory histories cannot use this exception. Version-1
   records still require their original hashes. Retirement also requires three
   confirmed 404s plus official index/replacement investigation, or an explicit
   official withdrawal/supersession notice. Redirects, missing attachments, DNS
   failures and similarly titled newer documents are insufficient by themselves.
6. Recover failed downloads, undocumented tombstones or formal retirements with
   `scripts/ops/reactivate-source.sh --url <canonical-url> --expected-registry-hash <hash> --recovery-id <reviewed-attempt-id>`.
   Validate first, then repeat with `--apply`. Reuse the recovery ID after a crash
   or duplicate invocation; a subsequent lifecycle recovery needs a new ID.
   Normal payload checks and exact source identity are mandatory. Original bytes
   are versioned before replacement. Parse recovered bytes normally and use the
   existing guarded `parse-import` for isolated parser output.

   For an exact document relocated to another official URL, pair
   `--payload-url <exact-url>` with `--identity-evidence <manifest.json>`.
   A reviewed registry hash and a distinct recovery ID are required. The
   manifest has `schema_version: 1`, the original `source_url`, `payload_url`,
   `expected_payload_sha256` (bare SHA-256), a substantive
   `reviewed_identity_finding`, and `captures`. Each capture records `url`,
   matching `final_url`, `status_code: 200`, relative `capture_path`, and bare
   `sha256`. Capture files must remain within the manifest directory and match
   their hashes. Official captures must link both the original source identity
   and the new attachment. The operator reviews document number, revision,
   language, and the agency's migration relationship; similar titles alone do
   not establish identity. Obtain captures with normal source-audit collection.
   The new payload must pass normal family, format and download checks and
   match the reviewed hash. Redirects away from that exact URL require another
   review and are rejected. The registry keeps the original URL. Applied
   recoveries retain proof under `crawler/documents/.recovery-evidence/` and
   journal its fingerprint. Replays check both supplied and durable proof,
   including after a completed recovery. Preserve that namespace in corpus
   snapshots and backups along with `crawler/recovery-journal/`.
   Reconciliation preserves retained proof. Backup verification rejects changed
   manifests, missing or changed captures, and missing journal dependencies;
   incomplete proof written before a crash must be recovered before the archive
   can pass restore verification.
   Recovery journals record registry commit completion separately from source
   availability, so a later download error does not invalidate historical proof.
   A crash between commit and completion marking resumes without another
   download. Current-corpus sync requires a local journal directory: absence is
   an incomplete input and fails before mirror writes; an explicitly empty
   directory mirrors removal. New volumes and explicit restores initialize the
   namespace. An existing registry without local recovery journals fails job
   startup; restore the history rather than recreating an empty directory.
   Restore verification checks the installed payload at its recorded path.
   After a later revision it requires both the retained reviewed version and
   the current artifact matching the registry hash.

`recovery-inventory` reports every required/optional failure, missing payload,
undocumented tombstone, classification and retirement. Snapshot schema 2 includes
all source identities and artifact hashes, including originals and retained
versions. Incremental sync, restore and encrypted backups include the audit
captures. Backups made before dispositions cannot authorize activation.

## Private answer diagnosis

Set `VERIFIER_PRIVATE_DIAGNOSTICS_DIR` only for an explicit diagnostic run. It must
be an absolute private directory (0700); captures are exclusive 0600 JSON files.
They contain retrieved evidence, candidate answers, deterministic URL/quotation
findings, corrections, exact rechecks and outcomes. CLI runs also retain private
generation/tool results. HTTP captures retain generation messages, original
request-local tool results, and verification stages under one server-generated
diagnostic ID. `chat.diagnostic_started` and `chat.diagnostic_finished` log only
that correlation ID and terminal timing/outcome; capture bodies remain private.
Failure or cancellation before verification also completes the diagnostic once.
`elapsedMs` measures the request; `verifierLatencyMs` measures verification only.
Never include these files in ordinary logs, SSE, history,
public release evidence or unencrypted artifact uploads. Use isolated observability
storage and the production agent's actual graph and model configuration; corpus-job
credentials may point at a different graph account.

For an isolated HTTP diagnostic, use a consistent database snapshot on a separate
non-public port in the production image, fresh authentication, and the actual
graph/model configuration and the deployed memory setting. Keep memory and its
signing key together. Remove copied research/checkpoint/budget rows only in the
disposable copy before startup so automatic recovery cannot resume production
research. Preserve the original snapshot. Stop the diagnostic process, encrypt
and download-verify retained captures, then remove only its owned remote files.
The authenticated route retains the newest user question; the verifier retains
original corpus tool evidence per request even when observation evicts messages.
Neither client context nor model-generated observations supply this evidence.

After a demonstrated fix, run exactly three independent fresh-authenticated EPSDT
smokes and retain every result, including failures. Require all three to release
`passed` or `corrected` answers with citations before freezing configuration. A
successful CLI reproduction alone does not replace the HTTP and browser checks.
The server's two-pass verification limit and withholding behavior remain mandatory.

For a persistence-only diagnostic, set `SMOKE_RESTORE_THREAD_TITLE` to the exact
existing sidebar title. The browser receipt records `existing_verified_thread`;
this never substitutes for a fresh-answer release smoke or the fixed three-attempt
EPSDT batch. The check waits for the active sidebar row, because the first row can
still describe a previous conversation during asynchronous refresh. Duplicate
visible titles fail rather than selecting an arbitrary thread. This mode never
renames or deletes the thread; point it at a conversation you mean to keep, since
a passing fresh-thread run removes its own.

The [2026-09-23 source audit](../validation/source-audit-2026-09-23/README.md)
records the initial inventory, identity preflight, failed fixed smoke batch and
verified browser persistence. The [closure follow-up](../validation/source-closure-2026-09-23/README.md)
records the September baseline of seven required failures, zero undocumented
removals, 313 optional failures and its matching restored backup. The
[October 2–3 source closure follow-up](../validation/source-closure-followup-2026-10-02/README.md)
records three recovered attachments, four remaining required failures, preserved
history and a new matching restored backup. Production remains legacy and
scheduling stays disabled.

For large encrypted backups transferred through Railway SSH, retain the completed
byte prefix if the transfer ends early. Resume with bounded object-store byte ranges,
verify each range length and the complete object length, then run the full decrypt/
restore check. A partial local archive never satisfies the backup gate.

## Reviewing documents dropped from the DHHS index

A `dhhs_policy` row that a complete crawl no longer finds on the agency index is
left out of the graph load as `delisted_from_index`. Its registry status,
payload, parse and evidence stay in place, and it returns on the first crawl
that lists it again. Only a default full `crawl` in which the family passed
discovery can show a document as absent.

The first full crawl after this behaviour ships de-lists the whole backlog at
once: about 308 rows on the October 2026 workstation registry, roughly 197 of
them administrative letters. Review them as one release before loading:

1. Run the full crawl, then `pipeline audit-corpus`. The JSON report marks each
   affected document `"delisted_from_index": true` and the family row counts
   them; the release graph is not touched.
2. Read the list. Check that superseded manual sections have a listed
   replacement, and spot-check the administrative letters against the agency
   site, since an index can drop a letter that is still in force. There is
   no per-document override yet: if a de-listed document must stay answerable,
   hold the release and raise it rather than editing the registry by hand.
3. Record the outcome with the release. Expect the overridable
   `maxAnswerReadyDrop` gate to need a recorded override for this one release.

## Applying reviewed availability observations

Collection remains read-only. To record collected HTTP checks without another
request, use a reviewed `source-audit` action with `disposition: availability`
and evidence `{schema_version: 1, observations: [{audit: {capture_path, sha256}}]}`.
Each audit manifest must be an immutable corpus-relative copy and contain the
exact source's captured response. Validate before applying under the writer lock.
The action updates only `last_checked_at` and the consecutive-404 count; it never
reactivates a tombstone or increments download attempts. A successful HTTP
observation resets the streak. A redirected observation also resets it, even if
the destination returns 404; only a direct 404 from the original source adds to
the streak. Original URL plus request timestamp identifies
an observation, so copied caches and new action IDs cannot count it twice.
Out-of-order evidence, modified captures and stale registry state are rejected.
The update and journal commit atomically. Applied observations join source
snapshots and their captures are checked during backup restoration.

A document-specific “Obsolete” label on an official index is withdrawal evidence
when the label clearly identifies the exact linked document. Preserve the link,
its immediate text/markup, date and captured hash. Do not extend that finding to
nearby attachments or other versions without their own explicit evidence.
