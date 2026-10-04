# Operations documentation

Check live service state and dated release evidence before applying a procedure. A runbook or service definition alone does not establish that a deployment is healthy or a release gate has passed.

The [October 3 product scope and coverage review](../validation/product-scope-review-2026-10-03/README.md) proposes a bounded release without agency outreach. It confirms available MAGI/form coverage and records targeted checks and unavailable-original limitations; it does not change the current source gate or qualify a release.
The [October 3 bounded coverage rehearsal](../validation/coverage-rehearsal-2026-10-03/README.md) passed isolated scope approval and backup checks but returned **NO_GO** for qualification: federal content refresh, required-family discovery freshness and the legacy identity query remain blocked. Its unrun candidate gates and independent main deployment are recorded explicitly.

The [October 3 qualification repair](../validation/qualification-unblock-2026-10-03/README.md) demonstrates bounded identity reads and all 43 current CFR parts. Qualification remains **NO_GO** because statute endpoints return maintenance pages; subsequent candidate gates were not run.

| Subject | Documentation or entrypoint |
| --- | --- |
| General configuration and commands | [RUNBOOK.md](../../RUNBOOK.md) |
| Verified chat release and bounded research recovery | [Answer release and recovery](answer-release-and-recovery.md) |
| Candidate graphs, evidence gates, promotion and rollback | [Blue-green corpus releases](blue-green-corpus-releases.md) |
| Preparation without embeddings or paid evaluations | [Offline qualification preparation](qualification-preparation.md) |
| Failed downloads, parser remediation and source retirement | [Corpus parser recovery](corpus-parser-recovery.md) |
| Bounded coverage, unavailable originals and mandatory targeted acceptance | [Answer coverage scope](answer-coverage-scope.md) |
| Dated verification results | [Verified release report](../validation/verified-release-2026-09-22.md) and [corpus recovery evidence](../validation/corpus-recovery-2026-09-23/README.md) |
| Bounded embeddings and model audit | [October 3 qualification cycle](../validation/qualification-cycle-2026-10-03/README.md) |
| Current readiness and blockers | [October 2–3 source closure follow-up](../validation/source-closure-followup-2026-10-02/README.md), [October 2 chat acceptance](../validation/chat-acceptance-2026-10-02/README.md), [October 2 runtime remediation](../validation/readiness-remediation-2026-10-02/README.md), [initial October 2 readiness](../validation/readiness-2026-10-02/README.md), and [later source closure](../validation/source-closure-2026-09-23/README.md) |
| Operational checks and backups | [Operations scripts](../../scripts/ops/) and [launchd installer](../../scripts/ops/install-launchd.sh) |
| Corpus deployment | [Deploy-data script](../../scripts/deploy-data.sh) and [corpus release script](../../scripts/ops/corpus-release.sh) |
| Production smoke | [Root scripts](../../package.json) and [browser smoke](../../e2e/scripts/smoke-production.mjs) |
| Chat ownership deployment acceptance | [October 3 ownership and browser checks](../validation/chat-ownership-acceptance-2026-10-03/README.md) |

The [project gotchas](../development/gotchas.md) cover build context, watch paths, service configuration, identity validation, source availability, and deployment failures. Validate external settings directly and preserve private credentials outside committed evidence.

Readiness diagnostics use `SMOKE_READINESS_RECEIPT_PATH` with `SMOKE_EXPECTED_RELEASE_ID`, fresh test-account credentials, and a new absolute receipt path in a private directory (0700). The receipt is 0600 and records created thread IDs for owned cleanup; exclude that synthetic account/run from usage assessments. This mode cannot be combined with activation receipt variables or an existing-thread restore. Failed generation leaves persistence/feedback unassessed while logout is attempted independently. Use normal nonce-bound browser acceptance for activation; a diagnostic receipt never substitutes for it.

- [Offline fee-schedule XLSX compaction](fee-schedule-compaction.md): native-cell proofs, sealed diagnostic graphs, local tokenizer measurements and non-promotable receipts.
