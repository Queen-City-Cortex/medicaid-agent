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
`neo4j-blue.railway.internal` and `neo4j-green.railway.internal`. The two
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
SYNTHETIC_ACCESS_TOKEN=<restricted-test-user-token>
SYNTHETIC_RESOURCE_ID=<restricted-test-user-id>
BACKUP_AGE_RECIPIENT=<age-public-recipient>
RAILWAY_TOKEN=<project-scoped-token>
HC_URL_CORPUS_JOB=<optional-healthchecks-io-ping-url>
```

Inject `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `REGION`, and `ENDPOINT`
from the existing Railway Object Storage bucket by variable reference. Also
provide the current OpenAI, Voyage, WorkOS, and evaluation-judge secrets.

The scheduled job exits after each run. Railway skips a cron occurrence if the
previous one is still active, so a stuck job must be treated as an incident.

## Initial bootstrap

The first conversion from the legacy single `neo4j` service is supervised:

1. Create blue and green with their volumes and backups.
2. Set these one-time variables on `corpus-job` and redeploy it:

   ```text
   CORPUS_JOB_MODE=bootstrap
   BOOTSTRAP_TARGET_COLOR=blue
   BOOTSTRAP_RESET_CONFIRM=neo4j-blue
   ```

   Bootstrap refuses to reset the graph currently serving the agent, requires
   the exact target-service confirmation, builds and validates the selected
   graph, stamps its release marker, and never changes the agent target.
3. Record the validated release ID from the successful job, remove
   `BOOTSTRAP_TARGET_COLOR` and `BOOTSTRAP_RESET_CONFIRM`, and restore
   `CORPUS_JOB_MODE=scheduled`.
4. Set the agent variables atomically:

   ```text
   NEO4J_URI=bolt://neo4j-blue.railway.internal:7687
   CORPUS_RELEASE_ID=<validated-release-id>
   ACTIVE_CORPUS_COLOR=blue
   ```

5. Redeploy the agent, verify `/readyz`, and run the authenticated smoke.
6. Keep the legacy graph available until a blue-to-green promotion and a
   green-to-blue rollback have both been rehearsed.

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
   health, and a deterministic citation-bearing chat.
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
