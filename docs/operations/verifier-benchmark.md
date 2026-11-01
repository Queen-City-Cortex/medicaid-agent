# Verifier benchmark

An offline measurement of how often the answer verifier stops a wrong answer and how often it withholds a good one. It replays `runVerificationForAnswer`, the function the chat route, the CLI and deep research all release through, over stored answers. It never runs in CI, and the paid mode runs only when a person asks for it with a spending cap.

Change the verifier's model or reasoning effort only against this benchmark, and only within the limits issue #18 fixes: a 30-second deadline, two passes, no retries.

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

For the default model, `gpt-5.6-terra`, the full run is 738 runs and at most 1,476 model calls. The script prints its upper bound before the first call: about $165, which assumes every run makes both passes, every call sends evidence up to the verifier's budget at 3 characters per token, and every call returns 6,000 output tokens. Live calls are capped at those 6,000 output tokens, so no call can cost more than the bound assumes; a reply cut off by the cap fails closed and counts as an unavailable run. A failed call reports no usage, so the script charges it at the per-call maximum and says how many it charged that way. Most runs make one pass, so expect a fraction of that. A `--live` run:

- refuses to start without `--max-usd`, under CI (`CI` set), when the printed bound exceeds `--max-usd`, when the model has no entry in `src/usage/pricing.ts`, or when the model's provider key is missing;
- adds up the cost of each call from its reported token usage and starts a run only while the spend so far, plus both passes of every run in flight and of the new run at the costliest call's price, stays within the cap, or within `--stop-usd` when given (exit code 3, with the rates for the runs that finished). The first batch is checked too. A run refused while others are in flight only retires that worker, since their reservations clear as they finish; the benchmark stops when a run cannot fit with nothing in flight. A stop too low for one run is refused before any call. `--max-usd` must still cover the printed bound; `--stop-usd`, which may not exceed it, holds the run to a budget below that bound;
- reads `VERIFIER_MODEL` and the provider key from the environment or `packages/agent/.env`, sends the stored questions, answers and corpus evidence to that provider only, and with OpenAI keeps response storage off;
- writes every run, including the model's findings, to `packages/agent/benchmark-results/` (gitignored, mode 0600). Keep that file with the release evidence, outside Git.

Useful options: `--limit 5` (first five items of each fixture, for a cheap trial), `--arms judged_bad`, `--repeats 1`, `--concurrency 4`, `--out <file>`. The run's duration has not been measured; at a guessed 10 to 15 seconds per call and the default concurrency, allow about an hour.

## The three-arm comparison (decision 0002)

[Decision 0002](../decisions/0002-verifier-model-family.md) sets this design. It picks the verifier's model family and effort by measuring three arms on the seeded and originals fixtures only. The judged-bad arm stays out.

| Arm | `VERIFIER_MODEL` | `VERIFIER_REASONING_EFFORT` | Printed bound, full run |
| --- | --- | --- | --- |
| Baseline | `gpt-5.6-terra` | `low` | about $121 |
| Effort | `gpt-5.6-terra` | `medium` | about $121 |
| Family | `claude-sonnet-5-5` | `low` | about $108 (needs `ANTHROPIC_API_KEY`) |

The bounds come from `--mock --arms seeded,original` (546 runs, three repeats of 182 cases). The bound does not depend on effort. Re-read them from a fresh mock run before trusting these figures.

Each arm is one invocation. Set the two variables in the shell for that command. Shell variables win over `packages/agent/.env`, so a value left in that file cannot leak into the wrong arm.

### Free checks first

On the commit the arms will run on:

1. From the repository root, `npx turbo run test build --filter=@nc-medicaid/agent` passes.
2. From the repository root, `npm ls @ai-sdk/openai @ai-sdk/anthropic` shows the provider versions. Write them down.
3. From `packages/agent`, `npx tsx scripts/verifier-benchmark.ts --mock --arms seeded,original` and the same command with `VERIFIER_MODEL=claude-sonnet-5-5` print the latency, deadline-abort and stray-correction lines, and the upper bound for each model.

No paid call happens until all three pass.

### Trial, forecast, then the full arm

Run these from `packages/agent`. The total budget is $150 across the three arms, and the owner holds it.

1. **Trial each arm at $5.** For example, the baseline:

   ```sh
   VERIFIER_MODEL=gpt-5.6-terra VERIFIER_REASONING_EFFORT=low \
     npx tsx scripts/verifier-benchmark.ts --live --arms seeded,original --limit 5 --repeats 1 --max-usd 5
   ```

   The trial is 20 runs. Its bound is about $4.60 for `gpt-5.6-terra` and $4.10 for the Claude arm, so `--max-usd 5` lets it start.
2. **Forecast.** Divide the spend the script prints by the 20 runs and multiply by 546. Write the forecast down.
3. **Run the full arm only when its forecast is under $60** and the running total stays within $150. Pass `--max-usd` at the arm's printed bound, because the script refuses to start below it. Pass `--stop-usd` at the forecast ceiling, so the hard stop is the budget and not the bound:

   ```sh
   VERIFIER_MODEL=gpt-5.6-terra VERIFIER_REASONING_EFFORT=low \
     npx tsx scripts/verifier-benchmark.ts --live --arms seeded,original --max-usd 122 --stop-usd 60
   ```

   If the forecast is over $60, skip the arm and record its forecast.

Never change the deadline, pass ceiling or retry count to make an arm finish. A candidate that needs more than issue #18's bounds is disqualified.

### Reading the result

Read the medium-effort arm and the Claude arm each against the baseline. A candidate wins only when all three conditions hold:

| Condition | Where it is in the report |
| --- | --- |
| No seeded kind is caught less often, and at least one is caught more often | Seeded table, `rate` and `95% interval` per kind. A kind **rises** only when the candidate's rate is above the baseline's interval upper bound. It **drops** only when the rate is below the baseline's lower bound. Otherwise it is unchanged. The `items 3/3`, `some` and `none` columns must not get worse. Stray corrections are not catches. |
| Clean originals are withheld no more often | Originals table, `rate`, read against the baseline's interval in the same way. More catches bought with more withholding is a loss. The release policy caps withheld answers at a count tied to the benchmark size (`withheldAnswers` in `corpus-release-policy.json`, 4 of 47 at the time of writing). |
| Deadline aborts stay under 2 percent of runs | The latency table's `deadline aborts`, divided by the arm's total runs. Also watch `one-pass runs over 25 s` as an early sign of drift toward the deadline. |

### Where the evidence goes

- Raw results files stay out of Git (`packages/agent/benchmark-results/` is gitignored), together with the commit, the provider versions and each arm's measured spend.
- A summary goes under `docs/validation/verifier-benchmark-2026-10/`. It holds the three report tables, the spend per arm, the abort counts, the provider versions, the commit and the commands, and no model findings text.
- The decision is a comment on issue #18 in the style of the earlier verifier decisions there. Decision 0002 then moves from Proposed to Accepted, with the figures.

### Adopting a winner

A winner is adopted at the next `release-baseline` regeneration and not before, so the swap costs no extra paid run. One commit changes both the agent's code defaults (`DEFAULT_VERIFIER_MODEL`, `DEFAULT_VERIFIER_REASONING_EFFORT` in `packages/agent/src/processors/verifier/config.ts`) and the pipeline qualification environment ([qualification preparation](qualification-preparation.md)). Both are in the evaluation fingerprint, so changing one alone means evaluation and production verify differently.

## A cheaper same-family candidate (November 2026)

The model upgrade moved the verifier from `gpt-5.6-terra` to `gpt-6.1-terra` (half the price) under the cost-swap rule in decision 0002. It is a fourth arm with the same fixtures, effort and bounds:

| Arm | `VERIFIER_MODEL` | `VERIFIER_REASONING_EFFORT` | Printed bound, full run |
| --- | --- | --- | --- |
| Cost swap | `gpt-6.1-terra` | `low` | about half the baseline's (re-read it from a mock run) |

`scripts/model-upgrade-checks.sh verifier` runs the baseline and this arm: a $5 trial each, a forecast from the trial, and each full arm only when its forecast is under $60, stopped at $60 of measured spend. Read the candidate against the baseline with the non-inferiority rule: no seeded kind drops, the originals' withhold rate does not rise, and deadline aborts stay under 2 percent. A rise is not required. The figures go in [the model upgrade record](../validation/model-upgrade-2026-11/README.md).

## Reading the report

Each row gives runs, hits, the rate and a Wilson 95% interval over runs. Three repeats of one item are not independent, so read the interval with the per-item columns: `items 3/3` were hit on every repeat, `some` on one or two, `none` never. An item in `some` is the verifier disagreeing with itself.

A hit is, for a seeded error, a run that did not release it; for an original, a clean answer withheld; for a judged-bad answer, a run withheld or corrected. A seeded run counts as caught by correction only when the corrected text matches the clean original everywhere outside the seeded span. A correction that removes the seed but changes other text too is a **stray correction**: it is not a hit, and the seeded section prints the stray count for each group. Only the verifier approved that other text.

The layer columns say what stopped the answer:

- **deterministic**: no model verdict was needed. The coverage-scope or no-evidence rule withheld before a call, pass 1 carried an unknown link or quotation, or the text carried a verifier marker.
- **budget**: cited section text did not fit the evidence budget, so the answer was withheld without a call.
- **model p1**: the model's first verdict rejected the text.
- **model p2**: seeded arm only. The first verdict rejected the text for something else, its correction kept the seeded error, and the recheck withheld it.
- **not stopped**: released as written, or released as a correction that still carries the seeded error. The second case is also counted on its own line under the seeded table.

**model rate** is the card's question: of the runs no deterministic layer decided, the share the model stopped. `corrected` counts answers released after a rewrite: for an original that is an unneeded rewrite, and for a judged-bad answer it is released text that nobody has judged. `unavailable` runs (no verdict) are left out of every rate.

The last table, **latency and unavailable runs**, covers every group with unavailable runs included. It gives the median and 95th-percentile latency per run, the count of one-pass runs over 25 seconds (the verifier drifting toward its 30-second deadline), and unavailable runs split into **deadline aborts** and **other failures**. A run can make two calls, each with its own deadline, so these are per-run figures and not per-call figures.

Limits to state with any result:

- The originals were chosen to pass today's deterministic checks, so the false-withhold rate is the model's only. Stored answers that fail those checks were excluded when the fixture was built.
- The originals were judged clean by a noisy judge and were released by an older advisory verifier; a withheld original can be a real defect the judge missed.
- A flipped qualifier that survives a reworded correction is not detected. Read the corrected seeded runs in the output file before trusting a qualifier catch.
- A section label moved to a section the turn did retrieve is invisible to the measured-only section check; the seeds record which case each one is (`siblingRetrieved`).
- The evidence is from the April to July 2026 graphs.
