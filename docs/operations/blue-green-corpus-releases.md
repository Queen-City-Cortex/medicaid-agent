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
HC_URL_CORPUS_JOB=<optional-healthchecks-io-ping-url>
```

Inject `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `REGION`, and `ENDPOINT`
from the existing Railway Object Storage bucket by variable reference. Also
provide the current OpenAI, Voyage, WorkOS, and evaluation-judge secrets.

The scheduled job exits after each run. Railway skips a cron occurrence if the
previous one is still active, so a stuck job must be treated as an incident.

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

## Initial bootstrap

The legacy-to-blue transition is supervised; keep the legacy graph serving until
all source and evaluation gates pass.

1. Complete `recovery-inventory` with zero required failures and zero undocumented
   removals. Freeze the code revision, source snapshot, retirement evidence and
   the complete 55-question benchmark. Keep maintenance mode and the writer lock.
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
   model fingerprint. Partial runs, infrastructure errors, missing verification
   telemetry and disabled verification fail. Observability uses `:memory:`.
   Generate the canonical catalog once from the frozen source artifacts with
   `eval-identity-catalog --output /data/pipeline/releases/evidence-identities.json`.
   Set `EVAL_IDENTITY_CATALOG` to that same file for the baseline, candidate,
   activation, and later scheduled validation. The 55 questions remain unchanged.
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
   explicitly with those variables; do not enable cron. It runs strict parsing,
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
   blue promoted and upload its promotion record.
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

After bootstrap, all promotions use:

```bash
CORPUS_JOB_MODE=release railway redeploy --service corpus-job --yes
```

## Promotion invariants

[`corpus-release-policy.json`](../../corpus-release-policy.json) is checked in
and fail-closed. Duplicate identities, missing answer-ready graph loads,
required-document parse exceptions, incomplete/wrong-dimension embeddings,
missing required source families, and evaluation failures cannot be
overridden. Only source-family count drop, total answer-ready drop, and
freshness SLA failures accept a recorded reason of at least ten characters.

Policy version 2 requires retrieval recall of at least 0.9, primary-evidence hit
rate of at least 0.95, answer score of at least 2.75, hallucination score of at
least 2.5, and aggregate regression of at most 0.15. Precision remains in release
reports and baseline comparisons, without an absolute threshold. The golden
benchmark names a sparse set of known relevant sections: at ten returned
results, its current mean precision ceiling is about 0.21, so a 0.9 threshold
would reject even perfect retrieval of the labeled evidence. A future absolute
precision gate requires broader relevance labeling and calibration. Server-side
answer verification remains mandatory independently of these corpus metrics.

The promotion flow is:

1. Read `ACTIVE_CORPUS_COLOR` and `CORPUS_RELEASE_ID` from the agent service.
2. Refuse to reset the inactive color if its seven-day retention deadline has
   not elapsed.
3. Start the inactive graph and wait for Bolt.
4. Parse, reset/load, ingest federal sources, resolve references/amendments,
   embed, audit, and evaluate.
5. Upload the building evidence and reject on any unapproved gate.
6. Set the agent URI, release ID, and active color without an intermediate
   deploy; redeploy once.
7. Require graph-backed `/readyz`, authenticated `/corpus-status`, provider
   health, and a complete chat stream with a terminal `passed` or `corrected` outcome,
   nonempty released answer text and citations. Withheld, source-only and
   interrupted streams fail.
8. Mark and upload the promoted manifest.
9. Keep the old service live for 24 hours. The daily cleanup job then stops
   compute while preserving its volume for at least seven days.

If cutover verification fails, automation restores the previous agent target
and verifies it before exiting nonzero.

## Rollback

Within the 24-hour window:

```bash
CORPUS_JOB_MODE=rollback railway redeploy --service corpus-job --yes
```

Rollback starts the previous color if necessary, switches the agent, verifies
the previous graph-backed release ID and authenticated smoke, and records the
event in both manifests. An expired rollback window fails before mutation.

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
is written atomically after every stage, so a restart can retry a failed stage
without presenting partial JSON as valid evidence.

## Retiring workstation scheduling

Keep launchd as a development fallback until two Railway-run promotions and
one rollback rehearsal succeed. Then uninstall the production launchd agents
with `scripts/ops/install-launchd.sh --uninstall`; local scripts remain for
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
generation/tool results. Never include these files in ordinary logs, SSE, history,
public release evidence or unencrypted artifact uploads. Use isolated observability
storage and the production agent's actual graph and model configuration; corpus-job
credentials may point at a different graph account.

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
visible titles fail rather than selecting an arbitrary thread.

The [2026-09-23 source audit](../validation/source-audit-2026-09-23/README.md)
records the current blocked inventory, per-source dispositions, identity preflight,
failed fixed smoke batch, verified browser persistence and matching restored backup.
