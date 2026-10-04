# Reconciled embedding and fee integration — 2026-10-04

The scope/qualification branch (#199) and embedding repair branch (#204) introduced incompatible planners and saved-plan schemas. This integration starts from current main `67ae251`, preserves both PR heads as merge parents, and includes the native-proved fee compaction from #207. Resolving documentation conflicts alone would leave auto-merged code importing removed byte-planner APIs.

The combined implementation uses **one pinned-token planner, version 3**. It retains semantic source epochs and transactional stale-result guards, adapts provenance and topology checks to the same planner, preserves repeated ancestor titles, and refuses whitespace-only novel inputs before spend. Generation, CLI stats and release inspection recompute exact model/dimension/text/offset coverage rather than trusting stored counts or nonnull hashes. Provider responses must contain the exact input index set, and returned vectors must be finite, non-boolean and nonzero. The release manifest's model selects coverage; offline fingerprints bind model and dimensions explicitly.

The XLSX compactor and its native proof logic remain unchanged. The existing [version-2 fee comparison](../fee-compaction-2026-10-04/README.md), [byte-planner diagnostics](../embedding-repair-2026-10-03/README.md) and [qualification-cycle measurements](../qualification-cycle-2026-10-03/README.md) remain source-attested historical evidence. Their original receipts and checksums were preserved. They do **not** measure or qualify this combined version-3 revision, and their plan fingerprints must not authorize a future paid campaign.

## Validation

- Linux pipeline suite against an owned disposable Neo4j: **669 passed**, 21 embedding tests intentionally skipped there.
- Separate empty-graph embedding suite with mocked Voyage: **21 passed**. It covers original loader/epoch guards, repeated headings, resume, model/dimension mismatch, eight plan corruptions, seven preflight failures, atomic rollback and partial-provider-failure resume.
- Operational Python tests: **17 passed**. Linux operations suite: **16 Node tests and eight shell tests passed**. Isolation guards: **three fee tests and ten qualification tests passed**.
- Workspace lint, builds, test typechecks and JavaScript suites passed. Production dependency audit passed.
- Actual Opus approach and implementation reviews approved the reconciliation. The final model-binding changes have focused regression tests and full Linux verification; automated review and exact-head CI are recorded on [PR #208](https://github.com/Queen-City-Cortex/medicaid-agent/pull/208).

The [source attestation](source-attestation.json) verifies 111 source/configuration file hashes in the actual Linux test image against code revision `69254e4`. Subsequent report changes contain documentation and receipts only. [Private receipt checksums](private-receipt-checksums.json) retain test/review evidence without publishing credentials or corpus contents.

## Preservation and scope

[Preservation](preservation.json) confirms all 72 original pending-file hashes, original registry bytes and all three PR heads. The private Git bundle preserves the starting refs; original worktrees were neither reset nor removed. [Cleanup](cleanup.json) records removal of the owned test container, anonymous volumes and internal network; the developer graph remains running.

**NOT_ASSESSED / non-promotable; $0 qualification provider spend.** Tests generate only mocked vectors in their disposable graph. No production embeddings, paid answer evaluations, source reparse, agency contact, corpus activation or deployment occurred. A main merge is separate from corpus qualification: future corpus work still requires current source/plan binding, renewed scope approvals, verified backups, and a separately approved budget with an enforced spending guard.

See [current input plans](../../operations/embedding-input-plans.md) and [fee-compaction runbook](../../operations/fee-schedule-compaction.md). Exact relational fee lookup remains proposed follow-up, not part of this integration.
