# Disabled Jev integration — October 4, 2026

Jev code is reconciled onto current main in [PR #209](https://github.com/Queen-City-Cortex/medicaid-agent/pull/209). This establishes implementation and verification, not runtime adoption. Defaults remain the OpenAI scope provider, disabled section roles, an empty role allowlist and diagnostic-only routing. Production agent and corpus-job flags were inspected without changing them; none enable Jev or validation transport. [Configuration receipt](runtime-flags.json).

The integration preserves the bounded whole-graph identity reader, semantic embedding source epochs, coverage boundaries and exact-text verification. Section reloads invalidate labels while unchanged embedding plans remain intact. Label metadata stays private to retrieval. Backup checks retain retirement, availability and relocation proofs alongside label validation and consistent SQLite snapshots. Dedicated CI Neo4j services keep annotation tests separate from agent and embedding fixtures; the Jev suite requires a matching explicit disposable URI and an empty graph.

## Verification

- Linux pipeline: **716 passed**, 23 intentionally skipped (21 dedicated embedding cases and two dedicated annotation cases).
- Separate mocked-provider embedding suite: **21 passed**. Dedicated real-Neo4j Jev suite: **two passed**, including unchanged-plan preservation and changed-body invalidation.
- Backup pipeline: **four passed**, including the real GNU tar/snapshot script with only encryption/upload adapters stubbed. Its archive restores the registry, immutable labels and committed live WAL ledger; no encryption or production restore is claimed.
- Workspace lint, builds, test typechecks, JavaScript tests and production dependency audit passed. Operational Python: **17 passed**; Linux operations: **16 Node and eight shell tests passed**; qualification/fee isolation guards: **ten and three passed**.
- Actual Opus review **APPROVED** after the backup proof and follow-up fixes. Exact-head CI and automated reviews are retained on the PR.

The [source attestation](source-attestation.json) binds 295 actual image source/configuration hashes to implementation commit `533706c`. The subsequent receipt commit changes documentation only. [Private receipt checksums](private-receipt-checksums.json) retain the validation/review evidence without publishing campaign text or credentials.

## Preservation and limits

[Preservation](preservation.json) verifies the original worktree and all 72 pending files unchanged, with separate private snapshots of 181 campaign artifacts and 233 cache/manifest artifacts. The original shared ledger remains the spend authority. [Cleanup](cleanup.json) records only task-owned graph containers, anonymous volumes and the internal network; the developer graph remains untouched.

**NOT_ASSESSED for adoption; $0 provider inference spend.** Existing AI audit choices remain provisional, human qualification reports remain pending, and no paid campaign, corpus reparse, production graph mutation, feature activation, manual deployment or agency outreach occurred. A main merge may trigger normal automated application deployment with the features disabled.

Before adoption, assess whole-corpus annotation memory, stamped-build resume, scope failure monitoring and provider transport compatibility, then obtain matching qualification evidence and separately approved spending. Changing the pinned model/specification also requires an explicit artifact/backup migration. These gates do not disappear because code is merged; see the [Jev guide](../../development/jev.md).
