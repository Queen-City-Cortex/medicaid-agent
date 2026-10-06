# Bounded answer coverage

The [October 3 review](../validation/product-scope-review-2026-10-03/README.md) identified four unavailable originals whose absence need not prevent every supported policy question. The implementation separates those limitations from source recovery and retirement. Its presence in Git does not approve a corpus exclusion, qualify a graph, or authorize activation.

## Runtime behavior

[`PolicyCorpus`](../../packages/policy-corpus/src/scope/coverage.ts) owns the boundaries and dated source selection. The shared [policy](../../packages/policy-corpus/src/scope/policy.json) identifies exact canonical URLs, reviewed registry/content hashes, required available sources, and eight acceptance scenarios.

| Request | Required behavior |
| --- | --- |
| MAGI table for a supported date | Retrieve the applicable full table with its effective date; distinguish population, household size, listed percentage and disregard. April 2025 evidence supports April 1, 2025–March 31, 2026; April 2026 evidence supports April 1–December 31, 2026. The year-end bound requires renewed review before extending support. |
| Earlier, later or ambiguous MAGI period | State the dated evidence limitation. A year-only table request selects that year's April table; a specific date selects applicability for that date. |
| Original 2025 MAGI wrappers | State that their contents/revision identities are unavailable. Available identical PDFs do not prove what those wrappers contained. |
| General DHB-5097 explanation | Retrieve the available English form; consult the applicable manual for procedure. A blank form cannot establish an individual's response deadline. |
| Official Gujarati DHB-5097 | State that the official attachment is unavailable. Language-access questions remain available; do not invent an official translation. |
| OTC COVID home-test payment change effective October 1, 2024 | Retrieve the full September 25, 2024 bulletin and its September 30 end date. Current or other-period payment questions remain unsupported until additional dated evidence is qualified. |
| Exact pharmacist standing-order authority or withdrawal | State that the original order is unavailable. Ending payment coverage does not establish withdrawal of dispensing authority. |

Chat input processing and the research API provide a fixed limitation notice for unsupported original-evidence requests. Research rejects these requests before creating a run or consuming start quota. Internal planning/reflection prompts are not classified as new user questions; the final report is checked against the original research question. A follow-up inherits the most recent scoped subject of the conversation only when it is a continuation: at most nine words opening with a continuation cue ("and", "what about", "for", "as of", "ok then", a request such as "translate" or "show"), or at most three words. A continuation that states a period (a year, a dated month, "last year") inherits a date-bound subject such as a MAGI table; one that names a language or a translation inherits a subject that is not date-bound, such as DHB-5097. A translation of a dated answer therefore carries no dated-source requirement. A question with its own scoped subject, or an explicitly named policy, replaces the earlier subject; any other question stands alone and leaves it in place for a later continuation. The rule is a word-shape heuristic: a short dated continuation about a different, unscoped topic still inherits, and an undated follow-up never does. A slash date such as 6/1/2025 is read as its year alone, in a first question as well. The preceding turns come from the stored thread, read by the chat route, not from the in-flight message list, so the rule does not depend on the memory mode. The shared final-answer verifier independently enforces the boundary, including CLI evaluation and research reports. Required source bodies must come from actual corpus sections with the exact canonical URL; routing hints, metadata, search excerpts and web results cannot satisfy that obligation. Missing/wrong-period evidence withholds the answer before invoking the factual verifier. Passing evidence still needs normal verification of the exact final text, including any correction.

The boundary's patterns are English only, so a question in Spanish resolves no scope from its own text and is not refused at input. The chat verifier therefore resolves the scope a second time from the `query` of every `resolveAnswerFrame` call the server ran in the turn, which the step-0 instruction asks the model to write in faithful English, and applies the stricter of that and the user-text scope (`strictestCoverageScope` in the verifier's `run.ts`): a limitation notice beats required sources, required sources beat no scope, and when both readings require sources all of them are required. The model's query can add an obligation and never removes one the user's text produced. A Spanish question about a supported dated table is released only if that table's body was retrieved; one that would be refused in English is answered by the model and then withheld, and the user sees the general withheld text, not the limitation notice, because the notice is shown only by the input block. This rests on the model passing the query in English: when it passes the Spanish text through, no scope is resolved and only the model-based verification applies. CLI evaluation and research reports do not pass a frame query and resolve the scope from the question alone, as before.

## Prepare and review an isolated corpus

Keep the active graph serving. Follow the [release runbook](blue-green-corpus-releases.md) for maintenance mode, writer locking, private evidence storage and backups. Use a complete isolated copy of the production corpus, including its registry, original payloads, parsed artifacts and lifecycle history. A development registry or a handful of copied PDFs cannot qualify production identities.

1. Freeze a clean implementation revision. Run corpus/agent/crawler tests, agent and corpus builds, and pipeline tests/lint. Inspect the eight scenario results and the matching review evidence; do not mark cases passed merely because a JSON field accepts `true`.
2. Discover/download the declared full September 25, 2024 bulletin and parse it through the normal pipeline. It is an explicit HTML seed in `corpus-manifest.json`. Bulletin HTML is accepted only for that declared seed and must pass substantive article/title validation. HTML returned for an ordinary PDF attachment remains a failed download.
3. Verify all required source hashes and parsed artifacts on the isolated copy. Existing originals, errors and unknown identities must remain intact. If a reviewed identity has changed, investigate and update the policy through review; do not rewrite the registry to satisfy its guard.
4. Produce a fresh encrypted baseline archive and run the native decryption/restore verifier. The receipt must identify the exact pre-scope source snapshot. Keep the archive and receipt durable. A backup from before ingesting the full bulletin cannot establish this snapshot.
5. Prepare a private, reviewed bundle with the fields below. The eight case flags attest to the implementation/boundary review; they do **not** substitute for the repeated live candidate checks below.

```json
{
  "action_id": "<unique reviewed action>",
  "policy_hash": "<stable_hash(scope_policy())>",
  "qualification": {
    "policy_hash": "<same policy hash>",
    "implementation_revision": "<40-character Git revision>",
    "implementation_hash": "<implementation_hash()>",
    "source_snapshot_hash": "<pre-scope snapshot hash, without sha256:>",
    "cases": {
      "magi-2026": true,
      "magi-2025": true,
      "magi-before-april-2025": true,
      "magi-missing-archives": true,
      "dhb-5097-procedure": true,
      "gujarati-official-form": true,
      "covid-payment-after-2024": true,
      "covid-standing-order-authority": true
    },
    "baseline_backup_receipt": "<replace this string with the complete verified receipt object>"
  }
}
```

From `packages/pipeline`, with `CORPUS_DATA_ROOT` pointing to the isolated corpus:

```bash
uv run python -m pipeline.cli source-scope --evidence /private/scope-review.json --baseline-archive /private/corpus-baseline.tar.gz.age --backup-image corpus-job:TESTED_REVISION
uv run python -m pipeline.cli source-scope --evidence /private/scope-review.json --baseline-archive /private/corpus-baseline.tar.gz.age --backup-image corpus-job:TESTED_REVISION --apply
uv run python -m pipeline.cli recovery-inventory --output /private/scoped-inventory.json
```

Run these commands on the local isolated complete corpus using the reviewed corpus-job image and the existing macOS Keychain backup identity. Both initial validation and application rerun the native encrypted-archive decryption/restore verifier and compare its independently produced receipt with the declared evidence; supplied receipt fields alone cannot authorize an approval. The validation command writes no scope records. Application takes the corpus writer lock and writes only `source_answer_scopes`; it does not change source status, family requiredness, download attempts, payloads, retirement or availability history. Each record embeds the policy, qualification, baseline receipt and exact coverage-artifact hashes. Repeating the identical action is idempotent. A differing existing approval is rejected rather than overwritten.

Inventory continues to report every unresolved required failure. It separately reports approved scoped failures and remaining blocking required failures. Any new required failure or undocumented removal still blocks release. New content/status/identity, policy, implementation or any change to the complete pre-scope corpus snapshot invalidate approvals; harmless failed-download retry timestamps/counters do not. Snapshots and encrypted backups include the scope records and verify their retained dependencies. Snapshots with no scopes keep their previous identity.

## Qualify before activation

Rehearsal approval alone cannot release a graph. `release-prepare` records scope policy/implementation hashes when scope records exist. `release-validate` runs all eight [live scenarios](../../packages/pipeline/src/pipeline/eval/answer_scope.py) twice against the candidate, with isolated observability and normal exact-text verification. The 16 results retain answers, routing, verification telemetry and tool evidence in `answer-scope-acceptance.json`. Supported cases require verified released answers and expected dated figures; negative cases must be withheld by the declared coverage limitation, rather than fail through a verifier outage.

This is a mandatory, non-overridable gate in addition to the unchanged 55-question benchmark, matching baseline/configuration, source identity, graph, freshness and embedding checks. Missing, partial, duplicate, failed or stale receipts block qualification. The receipt must match the policy, implementation, complete source snapshot and evaluation fingerprint in the manifest.

After applying scope records or making any other source mutation, create and decrypt-test a new matching encrypted backup. The pre-scope archive is rollback evidence; it cannot authorize activation of the scoped snapshot. Sync the manifest, acceptance evidence and audit artifacts durably, then use the ordinary activation/browser acceptance procedure. Assess qualification and activation separately; keep agency inquiries unsent.

If approval becomes invalid, stop release work. Retain the scoped archive and evidence, restore a tested complete pre-scope corpus into an isolated location, and repeat reviewed preparation with current identities/code. Do not delete or edit scope rows to bypass the guard. Existing graph rollback remains available through the release runbook.
