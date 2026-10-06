# Verifier benchmark

An offline measurement of how often the answer verifier stops a wrong answer and how often it withholds a good one (issue #268). It replays `runVerificationForAnswer`, the function the chat route, the CLI and deep research all release through, over stored answers. It never runs in CI, and the paid mode runs only when a person asks for it with a spending cap.

Change the verifier's model or reasoning effort only against this benchmark, and only within the limits issue #188 fixes: a 30-second deadline, two passes, no retries.

## What it replays

Each case is replayed three times, because the model's verdict varies between calls.

| Arm | Cases | Question it answers |
| --- | --- | --- |
| Seeded errors | 133: each of 49 clean stored answers with one seeded error per kind, where the answer has a place for it | Catch rate, per kind |
| Unseeded originals | The same 49 answers unchanged | False-withhold rate |
| Stored judged-bad answers | 64 answers the evaluation judge scored 1 or less on factual accuracy or hallucination | Catch rate on natural failures, by label |

The four kinds of seeded error (`packages/agent/scripts/verifier-benchmark/seeding.ts`):

- **figure**: one dollar amount, percentage or counted quantity that the evidence states becomes a value the evidence does not state (`30 calendar days` to `45`, `$2,829` to `$2,892`).
- **date**: one date moves a year.
- **qualifier**: the first qualifier flips (`must` to `may`, `under 21` to `21 and over`, `not covered` to `covered`).
- **section_label**: one citation label moves to another section of the same document; the link is unchanged.

Seeds never touch a link or a quotation, so the deterministic link and quotation checks cannot be what catches one. The fixtures, their selection rules and their limits are described in the [fixture README](../../packages/agent/tests/fixtures/verifier-benchmark/README.md).

## Confirm the labels first

The 64 judged-bad labels come from a noisy judge. Before reading the judged-bad arm as a catch rate, open `packages/agent/tests/fixtures/verifier-benchmark/review-sheet.md`, decide each row, and set its `label` in `labels.json` to `confirmed-bad` or `not-bad`. The report prints `confirmed-bad`, `unconfirmed` and `not-bad` as separate groups; only the first is a catch rate on known-bad answers.

## Running it

Offline, with a stand-in for the model (free; shows the report format, and its rates mean nothing):

```sh
cd packages/agent
npx tsx scripts/verifier-benchmark.ts --mock
```

Against the configured `VERIFIER_MODEL` (paid; the owner runs this):

```sh
cd packages/agent
npx tsx scripts/verifier-benchmark.ts --live --max-usd 170
```

For the default model, `gpt-5.6-terra`, the full run is 738 runs and at most 1,476 model calls. The script prints its upper bound before the first call: about $165, which assumes every run makes both passes, every call sends evidence up to the verifier's budget at 3 characters per token, and every call returns 6,000 output tokens. Most runs make one pass, so expect a fraction of that. A `--live` run:

- refuses to start without `--max-usd`, under CI (`CI` set), when the printed bound exceeds `--max-usd`, when the model has no entry in `src/usage/pricing.ts`, or when the model's provider key is missing;
- adds up the cost of each call from its reported token usage and stops starting runs once the next calls could cross the cap (exit code 3, with the rates for the runs that finished);
- reads `VERIFIER_MODEL` and the provider key from the environment or `packages/agent/.env`, sends the stored questions, answers and corpus evidence to that provider only, and with OpenAI keeps response storage off;
- writes every run, including the model's findings, to `packages/agent/benchmark-results/` (gitignored, mode 0600). Keep that file with the release evidence, outside Git.

Useful options: `--limit 5` (first five items of each fixture, for a cheap trial), `--arms judged_bad`, `--repeats 1`, `--concurrency 4`, `--out <file>`. The run's duration has not been measured; at a guessed 10 to 15 seconds per call and the default concurrency, allow about an hour.

## Reading the report

Each row gives runs, hits, the rate and a Wilson 95% interval over runs. Three repeats of one item are not independent, so read the interval with the per-item columns: `items 3/3` were hit on every repeat, `some` on one or two, `none` never. An item in `some` is the verifier disagreeing with itself.

A hit is, for a seeded error, a run that did not release it; for an original, a clean answer withheld; for a judged-bad answer, a run withheld or corrected.

The layer columns say what stopped the answer:

- **deterministic**: no model verdict was needed. The coverage-scope or no-evidence rule withheld before a call, pass 1 carried an unknown link or quotation, or the text carried a verifier marker.
- **budget**: cited section text did not fit the evidence budget, so the answer was withheld without a call.
- **model p1**: the model's first verdict rejected the text.
- **model p2**: seeded arm only. The first verdict rejected the text for something else, its correction kept the seeded error, and the recheck withheld it.
- **not stopped**: released as written, or released as a correction that still carries the seeded error. The second case is also counted on its own line under the seeded table.

**model rate** is the card's question: of the runs no deterministic layer decided, the share the model stopped. `corrected` counts answers released after a rewrite: for an original that is an unneeded rewrite, and for a judged-bad answer it is released text that nobody has judged. `unavailable` runs (the provider call failed) are left out of every rate.

Limits to state with any result:

- The originals were chosen to pass today's deterministic checks, so the false-withhold rate is the model's only. Stored answers that fail those checks were excluded when the fixture was built.
- The originals were judged clean by a noisy judge and were released by an older advisory verifier; a withheld original can be a real defect the judge missed.
- A flipped qualifier that survives a reworded correction is not detected. Read the corrected seeded runs in the output file before trusting a qualifier catch.
- A section label moved to a section the turn did retrieve is invisible to the measured-only section check; the seeds record which case each one is (`siblingRetrieved`).
- The evidence is from the April to July 2026 graphs.
