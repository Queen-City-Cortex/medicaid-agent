# Operations documentation

Check live service state and dated release evidence before applying a procedure. A runbook or service definition alone does not establish that a deployment is healthy or a release gate has passed.

| Subject | Documentation or entrypoint |
| --- | --- |
| General configuration and commands | [RUNBOOK.md](../../RUNBOOK.md) |
| Verified chat release and bounded research recovery | [Answer release and recovery](answer-release-and-recovery.md) |
| Candidate graphs, evidence gates, promotion and rollback | [Blue-green corpus releases](blue-green-corpus-releases.md) |
| Failed downloads, parser remediation and source retirement | [Corpus parser recovery](corpus-parser-recovery.md) |
| Dated verification results | [Verified release report](../validation/verified-release-2026-09-22.md) and [corpus recovery evidence](../validation/corpus-recovery-2026-09-23/README.md) |
| Operational checks and backups | [Operations scripts](../../scripts/ops/) and [launchd installer](../../scripts/ops/install-launchd.sh) |
| Corpus deployment | [Deploy-data script](../../scripts/deploy-data.sh) and [corpus release script](../../scripts/ops/corpus-release.sh) |
| Production smoke | [Root scripts](../../package.json) and [browser smoke](../../e2e/scripts/smoke-production.mjs) |

The [project gotchas](../development/gotchas.md) cover build context, watch paths, service configuration, identity validation, source availability, and deployment failures. Validate external settings directly and preserve private credentials outside committed evidence.
