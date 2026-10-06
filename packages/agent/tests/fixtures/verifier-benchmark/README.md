# Verifier benchmark fixtures

Private. These files hold model-written answers, some of them wrong, with the corpus text each answer was written from. Do not publish them, quote them as policy, or use them as examples of correct answers. They are inputs to `packages/agent/scripts/verifier-benchmark.ts`; see [how to run it](../../../../../docs/operations/verifier-benchmark.md).

| File | Contents |
| --- | --- |
| `judged-bad.json` | 64 stored answers over 26 questions that the evaluation judge scored 1 or less (of 3) on factual accuracy or hallucination, each with its question and the evidence the agent retrieved. **Known bad by the judge's score only.** |
| `labels.json` | One label per judged-bad answer: `unconfirmed`, `confirmed-bad` or `not-bad`. Every row is `unconfirmed` until a person sets it. The benchmark reports the three groups separately. |
| `review-sheet.md` | One row per judged-bad answer for the person setting the labels: the question, the judge's stated defect, the closest answer sentence and evidence excerpt, and what the deterministic checks find. Generated; do not edit. |
| `clean-sample.json` | 49 stored answers, one per question, that the judge scored 3 of 3 on factual accuracy, hallucination and overall. The benchmark seeds one error into each and also replays them unchanged. |
| `SHA256SUMS` | Checksums of the two fixture files, checked by `tests/verifier-benchmark/fixture.test.ts`. |

## Provenance

Copied on 2026-10-06 from the answer-evaluation result files under `packages/pipeline/data/eval-results/` on the owner's workstation, by `scripts/verifier-benchmark/build-fixture.ts`. The loose files in that directory are gitignored and existed nowhere else; 9 of the 64 judged-bad rows are also in the committed `milestones/` snapshots. The source was 129 distinct answer-level result files (byte-identical copies counted once) from April to September 2026, holding 1,676 replayable rows.

Selection rules (the same text is in each file's `selection` field):

- **Judged bad.** Every stored row with evidence, a non-empty answer, no agent error, a judge score and an answer that was not withheld, whose judge score for `factual_accuracy` or `hallucination` is 1 or less. This is the rule and the count (64 rows, 26 questions) of finding `r2-critic-stored-run-incidence-04` in the October 2026 review.
- **Clean sample.** From the July 2026 result files (advisory verifier, no enforced gate): for each question, the latest row judged 3 on `factual_accuracy`, `hallucination` and `overall` whose stored answer carries no verifier marker and passes today's deterministic link, quotation and evidence-budget checks against its stored evidence. July was chosen because those answers were never filtered by the enforced gate or by the current verifier model.

Each item's `id` is `<result file>#<question id>`. Identical evidence entries are stored once in `sources` and referenced by hash.

## What the stored rows do and do not contain

- Each stored source has `toolName`, `key`, `text` and `link`. The structured `sectionNumber` and `policyNumber` fields that the verifier's measured-only section-label check reads were added later; the loader recovers them from the `Section:` and `Policy:` header lines of each section's serialized text.
- No row has web (supplementary) evidence.
- The stored answer is the text the run released. In the advisory runs that is the answer after the advisory verifier's markers or rewrite, not the agent's draft: 16 of the 64 judged-bad answers carry a marker such as `[unverified: …]`, which today's gate fails without consulting the model. The benchmark attributes those to the deterministic layer.
- The evidence was retrieved from the April to July 2026 graphs and serialized by the code of that time (for example, sections cut at 6,000 characters). A replay shows the verifier that evidence, not what the current graph would return.
- Pre-verifier drafts were never stored. A capture-enabled evaluation run (`VERIFIER_PRIVATE_DIAGNOSTICS_DIR`) would record them; that is a paid run and was not done.

## Regenerating

From `packages/agent`, on a machine that has the result files:

```sh
npx tsx scripts/verifier-benchmark/build-fixture.ts
```

It makes no model call. Labels already set in `labels.json` are kept. Commit the changed files together, including `SHA256SUMS`.
