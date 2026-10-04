# Jev activation readiness — October 4, 2026

**No-go for activation. Conditional go for one narrow section-role study.** This pass closes the stamped-identity and backup-reference safeguards left by [PR #209](https://github.com/Queen-City-Cortex/medicaid-agent/pull/209). It does not qualify or enable Jev. Runtime defaults, role allowlist, model/specification pins and qualification thresholds remain unchanged. No paid inference, production graph mutation or agency outreach was authorized or performed.

## Activation safeguards

Enabled readiness, section retrieval and research recovery require a valid stamped annotation digest matching the live marker. A diagnostic label on a release stamped with roles disabled cannot acquire a role bonus merely by changing the agent flag. Missing or inconsistent identity fails readiness/recovery and omits roles from retrieval; section bodies and ordinary retrieval remain available.

Backup snapshotting retains release manifests alongside captured label bytes, and verifies every retained release's annotation manifest/cache dependencies before archiving. Restoration checks those references again and requires a label inventory for Jev artifacts or annotated releases. This detects labels missing before the backup starts, not just files lost inside an archive. Historical archives containing no Jev artifacts remain readable. Concurrent changes after snapshotting cannot change the captured bytes; cross-file inconsistency during capture fails validation.

## What the existing evidence supports

The coordinator recomputed the frozen diagnostic comparison in a separate private copy and matched its original digest exactly. Opus independently recomputed counts and reviewed limitations through `/orchestrate`. [Diagnostic receipt](diagnostics.json) contains aggregate metrics and source hashes; prompts and full reviews remain private.

| Direction | Evidence from the preserved sample | Decision |
| --- | --- | --- |
| `covered_services` | Held-out AI consensus has 13 positives. Jev made 7 positive predictions: 5 agree, 0 disagree with resolved consensus, 2 unresolved. Recall 0.385 vs heuristic 0.462; worst-case precision 0.714. | Consider one targeted study; current recall and support gates are unmet. |
| `exclusions` | Only 6 held-out consensus positives; 3 predictions agree with consensus. Recall 0.50 vs heuristic 0.833. | Consider with covered services; support and recall gates are unmet. |
| Scope | One fallback in 200 conversations, no independent human review; latency timing differs between providers. | Keep disabled. Do not repeat until a run happens to pass or relax the zero-failure gate. |
| Routing | Abstains on 1,683 of 4,486 consensus fields (37.5%). | Keep offline. Existing disagreements may guide separate inspection of deterministic routing. |
| Other roles | Billing workflow has no runtime consumer; PA roles have too few positives; boilerplate has observed false positives. | Defer. Do not add consumers to justify a classifier score. |

Neither candidate currently passes the fixed recall gate, and a fresh study may still fail; high observed precision alone is not enough. No answer or frame improvement has been demonstrated. Only 232 of 71,695 sections in the frozen corpus snapshot were labeled (0.32%). The 29 targeted human audit choices remain provisional; AI agreement is not independent reference truth, and the 19-vs-10 model-match count cannot rank the labelers. The inspected held-out set cannot serve as a fresh qualification set.

Opus favored exploring scope if its policy gates changed; the coordinator keeps the recorded failure and existing gates in force. Both agree on no activation, no whole-corpus enrichment now, no paid routing work, and a narrow section study only if independent reference evidence is feasible. No further labeling is requested from the user in this pass.

## Gated qualification proposal

1. **Feasibility, $0 provider spend.** Verify a matching corpus/configuration and complete canonical evidence identity. The frozen campaign records nine canonical evidence IDs missing and missing primary evidence for q-051 through q-055; revalidate on the eventual candidate rather than reuse that snapshot as qualified. Identify an independent reviewer and crisp definitions focused on `covered_services` and `exclusions`. Model consensus may draft references but cannot satisfy the current independent review gate. Current formal tooling requires complete review of all eight role fields, even for a two-role allowlist: 400 sections imply 3,200 judgments plus reading and adjudication. Reviewer time is the dominant cost. Stop here if independent evidence cannot be obtained; do not send the user another exhaustive checklist.
2. **Fresh sampling, no inference yet.** Prepare about 400 full-input sections from coverage candidate pools, stratified by policy family and document, with document-disjoint development/held-out splits. Retain a representative held-out arm; targeted enrichment of rare concepts alone cannot establish production-wide precision. Freeze sample, definitions, heuristics, corpus and configuration before inference. Sampling does not guarantee the required positive support; measure it and keep insufficient support pending.
3. **Optional classifier study, separately authorized.** At the frozen October 3 Jev rate of $0.042/M input tokens and observed sample mean of 1,346 tokens, 400 calls would charge about **$0.023**; a 2× input sensitivity gives **$0.046**. These are historical extrapolations, not current confirmed prices or maximum liability. The observed per-call reservation was about $0.048, and failed/unreconciled calls keep the full bound. A proposed **$0.10 incremental ceiling** must stop the study on failures or exhausted reservation headroom; it is not presently authorized. Reconfirm pricing and exact full-input bounds, use the original shared ledger with an incremental ceiling, and do not reset the ledger from a snapshot. No paid model-reference labeling is proposed.
4. **Qualification and utility gate.** Keep at least ten held-out positives and negatives, ten positive predictions, precision ≥0.90 and recall at least the heuristic baseline, with independent reviewed references. Passing these gates only permits an isolated candidate frame comparison. Then require primary evidence-selection improvement and at least three complete baseline and three candidate answer runs (330 question executions on the 55-question benchmark), matching corpus/configuration and existing grounding/withholding release gates. Estimate those costs from actual bounded requests before seeking a separate budget; the $0.10 classifier ceiling excludes embeddings, reference review and answer evaluations.

**Current authorized additional spend: $0.** Frozen ledger accounting ($4.906444128 charged of a $25 cap, six unsettled calls) is historical evidence, not authorization to spend its remainder. No ledger, pricing, allowlist or runtime settings were changed.

## Verification

See the PR's exact-commit CI and retained private receipts for checks. Regression coverage includes missing/malformed/mismatched stamps, matching-stamp retrieval, disabled parity, container headings, enabled research identity, missing backup inventory, and label directory/cache/manifest loss before snapshotting. Linux tests exercise the real tar/snapshot backup with mocked encryption/upload adapters. Agent and policy-corpus builds and test typechecks are required alongside tests.
