# Evaluation and model selection: all issues

The harness has sound parts: a judge from a different vendor than the system under test, infrastructure errors kept out of quality means, retrieval evaluation that calls production code, and fingerprinted release evidence. The main risk is that its numbers are trusted further than they can bear. Some reference answers are unsupported by their cited sections, every question set has been tuned against, the hallucination score is distorted by withheld answers, a lenient judge prompt and a faulty evidence budget, and the release floors have never been met and sit inside run-to-run noise. Nothing has been measured on the current 55-question benchmark, and no release has completed. First, fix the judge scoring defects and pin reasoning effort; then run retrieval alone and one answer run on the candidate graph, and reset the floors from those measurements before paying for a qualification cycle. Replace `gpt-5-mini` before 11 December 2026.

## What is working

- The judge comes from a different vendor (Anthropic) than the generator and verifier (OpenAI), and its model is stamped into every answer result (`packages/pipeline/src/pipeline/config.py:89`, `packages/pipeline/src/pipeline/eval/runner.py:100`).
- Agent and judge infrastructure errors are excluded from quality means and counted separately, with tests (`packages/pipeline/src/pipeline/eval/levels/answer.py:512-544`, `packages/pipeline/src/pipeline/eval/results.py:73-86`).
- Release evidence must cover the whole benchmark, contain no error rows, run with the verifier on and carry a configuration fingerprint (`packages/pipeline/src/pipeline/evaluation_evidence.py:21-28`, `:80-128`).
- Retrieval evaluation calls the production TypeScript retrieval through a thin bridge instead of a Python copy (`packages/pipeline/src/pipeline/retrieval/agent_bridge.py`), and three stored runs on an unchanged graph were identical.
- The verifier call is fully specified: explicit low reasoning effort, a 30-second deadline tied to the request's abort signal, no retries, and fail-closed on any error (`packages/agent/src/processors/verifier/verify.ts:92-136`).
- The 3 October model audit and cost sample measured instead of assuming: they found the production model override and stale prices, and ran paid calls behind a per-call budget ledger (`docs/validation/qualification-cycle-2026-10-03/model-audit.md`).

## High severity

### EVAL-1 · Golden reference answers assert facts their cited sections do not contain

**high** · effort M · evaluation validity, data quality, wrong-answer risk, release gate

The judge prompt labels every reference answer in `packages/pipeline/data/golden/dataset.json` "verified correct" (`packages/pipeline/src/pipeline/eval/judge.py:15`) and scores factual accuracy as agreement with it. Checked against the local July 2026 graph, the keys for `q-017`, `q-019`, `q-026`, `q-027`, `q-031` and `q-039` are unsupported or contradicted by the sections they cite. Twelve keys rest only on generic template sections; section 4.1 matches one template in 161 of 177 clinical policies. Fourteen of 55 entries are marked NEEDS_VALIDATION, and `q-042`, `q-044` and `q-045` are instructions, not answers.

**Impact.** Attorneys and beneficiaries would get answers shaped by these keys: the rules at `packages/agent/src/prompt.ts:20-21` were tuned to them and favour a definitive "No" citing generic sections. Accurate answers score lower.

**Fix.** Remove "(verified correct)" from the judge prompt, add a `status` field and skip unvalidated entries, and give each key verbatim `supporting_quotes` checked by an `eval validate-golden` preflight. Publish this as a versioned dataset, then re-evaluate the prompt rules and the section promotion in `packages/policy-corpus` against it. The owner must choose: amend issue #188 to name the new version before the qualification cycle, or run the cycle on the unchanged 55 questions and correct the keys afterwards.

*What is and is not established: Six keys were checked directly against the older local graph; the full tally of 24 suspect entries was not independently reproduced. The effect on production answers is inferred.*

Where: `packages/pipeline/data/golden/dataset.json:1160`, `packages/pipeline/src/pipeline/eval/judge.py:15`, `packages/agent/src/prompt.ts:20`, `packages/pipeline/data/golden/dataset.json:1777`

### EVAL-2 · Release floors have never been met and one noisy run decides

**high** · effort M · release gate, evaluation validity

`corpus-release-policy.json:17-20` sets four floors that accept no override, and `packages/pipeline/src/pipeline/cli/release.py:283` decides on a single answer run. No stored run meets the retrieval floors: ten June 2026 runs scored recall 0.295 to 0.36 and primary hit 0.46 to 0.58 against 0.9 and 0.95. Three July runs of one configuration scored 2.694, 2.760 and 2.729 against the 2.75 answer floor, and both complete September gate runs missed it. A proposed rule blocking on repeated low hallucination scores fails 77 of 114 unchanged July triples.

**Impact.** The owner's next paid qualification cycle can be rejected, or pass or fail by chance, and every corpus fix waits behind it. No wrong answer reaches a user.

**Fix.** Run the retrieval evaluation alone on the candidate graph, then one 55-question answer run, before paying for a cycle. Fail `release-validate` on retrieval before the answer stage, and reset the retrieval floors to the measured values minus 0.02 to 0.04. Apply the answer floors to the released-row mean of three runs without requiring each to pass. Split the regression limit by metric scale and fail when no baseline exists. Print repeated low-hallucination questions as a review list, not a gate.

*What is and is not established: All figures come from stored June to September runs on the legacy graph and 50-question sets. Nothing has been measured on the current 55-question benchmark or retrieval path.*

Where: `corpus-release-policy.json:17`, `packages/pipeline/src/pipeline/cli/release.py:283`, `packages/pipeline/src/pipeline/release.py:514`, `docs/operations/blue-green-corpus-releases.md:247`

## Medium severity

### EVAL-3 · Agent reasoning effort is never set, so it changes silently with the model

**medium** · effort S · evaluation validity, release gate, cost

Only the verifier sets a reasoning effort (`packages/agent/src/processors/verifier/verify.ts:99`). The chat and deep-research agents set none (`packages/agent/src/index.ts:218`), so each model runs at its provider default: none for `gpt-5.4`, medium for `gpt-5.6-terra`. The 3 October audit records production overriding `AGENT_MODEL` to `gpt-5.4`, and that day's six-question cost sample shows zero reasoning tokens on all 18 `gpt-5.4` generation calls. The comparison that chose `gpt-5.6-terra` therefore varied model and effort together, and result files record neither.

**Impact.** Attorneys and beneficiaries would probably receive multi-step policy answers written without model reasoning. The September release evidence came from a different model and effort, and the planned `gpt-6.1-sol` comparison would repeat the confound.

**Fix.** Add one validated `AGENT_REASONING_EFFORT` setting in `packages/agent/src/model.ts`, defaulting to medium, and pass it through `defaultOptions.providerOptions.openai.reasoningEffort` on the chat agent and the three deep-research agents, with a unit test that the request carries it. Record the effort in evaluation results and the release fingerprint. Remove the production override or label it unqualified. Recheck reasoning carry-over between steps if `store: false` is also adopted.

*What is and is not established: Rated medium, not high: production traces were not sampled, and zero reasoning in production is inferred from a six-question command-line sample. July's provider defaults could not be verified.*

Where: `packages/agent/src/index.ts:218`, `packages/agent/src/model.ts:23`, `packages/agent/src/processors/verifier/verify.ts:99`, `docs/validation/qualification-cycle-2026-10-03/model-audit.md:3`

### EVAL-4 · Withheld answers are judged and score a perfect 3 on hallucination

**medium** · effort S · evaluation validity, release gate

`packages/pipeline/src/pipeline/eval/levels/answer.py:512-533` sends every non-error answer to the judge without reading the verifier outcome, so the fixed withholding notice is scored against the reference. All 17 withheld rows in the two stored 22 September 2026 gate runs scored hallucination 3 and overall 0. With 15 of 50 answers withheld, the hallucination mean was 2.82 against a 2.56 baseline; over released answers only it is 2.743. A verifier outage would be scored the same way, while an agent-model failure is excluded as an infrastructure error.

**Impact.** The owner sees the safety metric improve when the product answers fewer questions, and a verifier or model comparison favours whichever arm withholds more. The gates still reject heavy withholding through the overall score.

**Fix.** Read the verifier outcome in `answer.py` before the judge branch. For a genuine withhold, skip the judge and record overall 0 with no hallucination score. Exclude a `verifier_unavailable` row as an infrastructure error and re-run it in the harness, without adding verifier retries. Apply the answer and hallucination floors to released rows, add a withheld-count cap that accepts no override, and keep the baseline comparison on all rows. Add tests for both row types.

*What is and is not established: Measured on two stored September runs of the 50 historical questions. The verifier-outage case was read from code, not observed.*

Where: `packages/pipeline/src/pipeline/eval/levels/answer.py:512`, `packages/pipeline/src/pipeline/release.py:516`, `packages/contracts/src/schemas.ts:90`, `packages/agent/src/cli-verification.ts:21`

### EVAL-5 · Hallucination judge sees the reference answer and accepts any fetched text as support

**medium** · effort S · evaluation validity, release gate

One judge prompt scores all five dimensions (`packages/pipeline/src/pipeline/eval/judge.py:15-33`). It shows the reference answer while scoring hallucination, and tells the judge to treat any claim that "appears anywhere in Evidence" as supported. Evidence includes whatever the agent's tools returned, within an 80,000-byte budget, so an agent that retrieves more text, including from the wrong policy, can raise its own score. The June 2026 remediation plan listed hiding the reference for this dimension under an item marked complete; it was not done. The size of the effect is unmeasured.

**Impact.** The owner reads the 2.5 hallucination threshold as a bound on unsupported claims in released answers. As scored it cannot carry that meaning, so a release can pass the safety gate without that assurance.

**Fix.** Split `judge_answer` into two prompts behind the same interface: a reference prompt (question, reference, answer) for factual accuracy, completeness and overall, and a grounding prompt (question, answer, evidence) for hallucination and citation quality. Label golden evidence blocks with their section identifier and require that a claim attributed to a policy be supported by a block from that policy. Record old and new scores side by side for three runs before resetting the threshold.

*What is and is not established: The prompt wording was read directly. How much it moves the hallucination score has not been measured.*

Where: `packages/pipeline/src/pipeline/eval/judge.py:15`, `packages/pipeline/src/pipeline/eval/judge.py:32`, `packages/pipeline/src/pipeline/eval/levels/answer.py:351`, `docs/reviews/2026-06-11-remediation-plan.md:67`

### EVAL-6 · Judge evidence budget drops all agent evidence for three questions

**medium** · effort S · evaluation validity, release gate

`packages/pipeline/src/pipeline/eval/evidence.py:127` charges golden section text against the 80,000-byte judge budget first, so when golden text alone exceeds it every agent source is dropped. This happens for `q-010`, `q-015` and `q-043` in all three stored September 2026 milestone runs. In both gate runs `q-043` scored hallucination 1; in the final run the judge called a URL fabricated that is present in the dropped tool output. The priority map also omits `resolveAnswerFrame:section`, the most frequent source in that run.

**Impact.** The owner gets a recurring false fabrication flag on the dimension used as the safety signal. It costs about 0.04 on a hallucination mean that sat 0.16 above its release threshold.

**Fix.** Apply the budget to agent blocks only: change `remaining = max(0, budget_bytes - golden_bytes)` to `remaining = budget_bytes`. Give `resolveAnswerFrame:section` top priority and move the `resolveAnswerFrame` routing hint last. Skip section entries whose key is already in the golden set. Add a test that 100 kilobytes of golden text plus one small agent source keeps that source, record a new `evidence_mode` value, and re-baseline before comparing with September.

*What is and is not established: Observed in stored September runs. The score is not deterministic: the paraphrase of `q-043` scored 2 or higher in 13 of 22 July runs with the same evidence dropped.*

Where: `packages/pipeline/src/pipeline/eval/evidence.py:127`, `packages/pipeline/src/pipeline/eval/evidence.py:20`, `packages/agent/src/processors/verifier/evidence.ts:336`, `RUNBOOK.md:261`

### EVAL-7 · Mandatory scope acceptance does not check what two pass cases actually say

**medium** · effort S · release gate, wrong-answer risk, test gap

`packages/pipeline/src/pipeline/eval/answer_scope.py:89-99` accepts a "passed" case when the verifier's own telemetry reports support and each listed figure appears in the answer. For `covid-payment-after-2024` the only figure is "2024", which the question itself contains, and `dhb-5097-procedure` lists none. A deterministic check does require that the September 2024 bulletin was retrieved. A wrong-polarity answer therefore passes whenever the bulletin was retrieved and the verifier still marks the answer supported in both runs. The result feeds the `answerScopeAcceptancePassed` release gate, which accepts no override.

**Impact.** A release could be certified while the agent tells a beneficiary that pharmacy coverage of over-the-counter COVID-19 home tests continued after it ended on 30 September 2024.

**Fix.** Replace the `figures` list with per-case required and forbidden patterns applied to the normalised answer, keeping the telemetry conditions. Require the 30 September 2024 end date and forbid a leading "yes" for the COVID-19 case, require a negation near "deadline" for the form case, and require the full effective date for the two income cases. Add a parametrized test in `packages/pipeline/tests/test_answer_scope_acceptance.py` that feeds wrong-polarity answers and expects failure.

*What is and is not established: Read from the acceptance code and case definitions. No wrong-polarity answer was observed passing; it also requires the verifier to mark that answer supported in both runs.*

Where: `packages/pipeline/src/pipeline/eval/answer_scope.py:46`, `packages/pipeline/src/pipeline/eval/answer_scope.py:89`, `packages/policy-corpus/src/scope/coverage.ts:109`

### EVAL-8 · The held-out set is a tuned paraphrase set with retired section identifiers

**medium** · effort M · evaluation validity, release gate, test gap, data quality

`packages/pipeline/data/golden/heldout-paraphrase.json` rewords 50 golden questions and copies their answers and evidence, so it never covered unseen topics. On 12 June 2026, eight code commits landed between its first baseline (2.60) and its "final" baseline (2.86); five name specific held-out questions. All 213 of its identifier fields use the pre-migration scheme, so on a graph built by the current loader it matches nothing, or raises when `EVAL_IDENTITY_CATALOG` is set. `scripts/eval-ab.sh:37` still defaults to it, and release gates use only the golden questions.

**Impact.** The owner has no score for questions on policies nobody tuned for, which is what attorneys and beneficiaries will ask. Absolute quality claims and the release thresholds rest on a development set.

**Fix.** Load each paraphrase's `answer` and `evidence` from its parent golden row and relabel the file a paraphrase-robustness set, with a hermetic test that every `paraphrase_of` resolves. Add a separate file of questions drawn from documents no golden evidence references, enforce disjointness with a unit test, and report it only in aggregate. Reviewers proposed between 20 and 40 questions; the owner must pick the size. Update the default dataset in `scripts/eval-ab.sh` afterwards.

*What is and is not established: Rated medium: the identifier failure was read from code, not run, is already recorded in `docs/development/gotchas.md` and issue #188, and is latent on the production graph.*

Where: `packages/pipeline/data/golden/heldout-paraphrase.json:30`, `packages/pipeline/data/golden/CHANGELOG.md:13`, `scripts/eval-ab.sh:37`, `packages/pipeline/src/pipeline/eval/identity.py:205`

### EVAL-9 · Answer evaluation runs a reduced agent and never calibrates the verifier

**medium** · effort L · evaluation validity, test gap, wrong-answer risk, needless complexity

Every answer score comes from a single-turn command-line run that builds no memory and omits the length guard, coverage-boundary processor, scope gate and injection detector (`packages/agent/src/index.ts:133-161`). Production runs observational memory, which can replace tool results in the model's context with a small model's summary, an effect never scored. The 55 questions contain no scope-block, injection, follow-up or out-of-corpus cases, and no labelled set measures the verifier's false-pass or false-withhold rate. In the September final gate run the judge scored hallucination 1 on 4 of 48 released answers.

**Impact.** A legitimate question blocked by the scope gate, an injection that gets through, a follow-up that loses context, or a fabricated claim the verifier passes would leave every evaluation number unchanged.

**Fix.** Add a replay script that runs `runVerificationForAnswer` over stored answers and evidence, unchanged and with one seeded error each, to measure false-withhold and false-pass rates. Stop passing `observationalMemory` in `packages/agent/src/chat-memory.ts` and cover bounded history with a two-turn regression test. Add a command-line flag enabling the production input processors. Report evidence recall and primary hit from exact key matches on `getSection` and `resolveAnswerFrame:section` entries only, never as a gate, with a unit test that a text mention is a miss.

*What is and is not established: Verifier error rates and the memory effect are unmeasured. The evidence metric is not implemented; on the September final run it reads 0.72 by exact key, 0.86 by text mention.*

Where: `packages/agent/src/index.ts:133`, `packages/pipeline/src/pipeline/eval/levels/answer.py:190`, `packages/agent/src/chat-memory.ts:27`, `packages/agent/src/processors/verifier/run.ts:79`

### EVAL-10 · No benchmark question exercises section truncation, sibling policy lookup or fee schedules

**medium** · effort M · test gap, evaluation validity, release gate, wrong-answer risk

The 55 golden and 50 held-out questions cannot measure four defects rated high elsewhere in this review. The 6,000-character truncation marker appears in the evidence of 796 of 1,697 stored answers, but only `q-043` and `q-045` depend on text past the cut, and both are answered through other tools (`packages/pipeline/data/golden/dataset.json:1740`). Every digit-plus-letter token in the questions is a real policy number, the one prefix-colliding policy is named exactly, and no stored answer or golden evidence block involves a fee schedule.

**Impact.** The owner cannot confirm a fix for unreadable section tails or wrong-document lookups on the benchmark that gates releases, and a regression in either would leave every score unchanged.

**Fix.** Add about eight tail-read probe rows in a separate file such as `packages/pipeline/data/golden/probes-tail-read.json`, run through the `DATASET` override of `scripts/eval-ab.sh` and written before the truncation fix so they fail first. Cover the wrong-document paths with unit tests on `extractExplicitPolicyNumbers` and `lookupPolicy` instead of judge-scored rows. Note in `q-043` that it tests `getAmendments`. Fold the probes into the next benchmark version after the current qualification cycle.

*What is and is not established: Counts come from 129 stored runs on legacy-identifier graphs. Probe offsets other than 42 CFR 440.70(f) are one reviewer's and must be re-derived on the current graph.*

Where: `packages/pipeline/data/golden/dataset.json:1754`, `packages/pipeline/data/golden/dataset.json:1740`, `packages/policy-corpus/src/internal/record-mapping.ts:144`, `scripts/eval-ab.sh:37`

### EVAL-11 · The model comparison script cannot resolve the differences it decides on

**medium** · effort M · evaluation validity, test gap

`scripts/eval-ab.sh:120-141` reports "no regression" unless the candidate's mean overall falls more than 0.05 below the baseline's. It uses no variance term, ignores hallucination and error counts, and assigns arms by file modification time; results omit the agent model. On stored July 2026 runs, the adopted difference of +0.040 has a standard error of about 0.04. Of the replacement rules reviewers proposed, a lower bound at -0.10 fails 863 of 1,700 unchanged three-run splits; a paired two-standard-error rule fails 31.

**Impact.** The owner can adopt a model worse by about 0.1, or one that regresses hallucination while overall holds, with no objection. The claim that `gpt-5.6-terra` "matched or beat" `gpt-5.4` is not statistically supported.

**Fix.** Add one tested function to `packages/pipeline/src/pipeline/eval/metrics.py` that takes explicit run identifiers per arm, averages each question within an arm, and returns the mean and standard error of the difference for overall and hallucination. Use it in `scripts/eval-ab.sh`: fail when either mean is below minus two standard errors or an arm has errors, and print a tie line for differences under about 0.10. Stamp agent and verifier models into each result's `config`. Keep `maxAggregateRegression` at 0.15.

*What is and is not established: Rates come from 22 stored July runs of the 50-question held-out set on the legacy graph; the splits are heavily dependent. Variance on the current benchmark is unmeasured.*

Where: `scripts/eval-ab.sh:124`, `packages/pipeline/src/pipeline/eval/metrics.py:76`, `packages/pipeline/src/pipeline/eval/results.py:159`, `packages/agent/src/model.ts:23`

### EVAL-12 · Scope gate and injection detector depend on a model retiring 11 December 2026

**medium** · effort S · deadline 2026-12-11 · dependency, security, reliability

`gpt-5-mini` is hardcoded for the prompt-injection detector in chat and deep research (`packages/agent/src/index.ts:161`, `packages/agent/src/deep-research/agents.ts:59`) and is the default for the scope gate and the health probe. OpenAI's deprecations page schedules its only snapshot for removal on 11 December 2026; whether the alias will be repointed is not stated. Both classifiers allow the message on a provider error, and the detector logs only a console warning. The probe at `packages/agent/src/health.ts:79-89` treats every status except 401, 403, 429 and server errors as healthy. Nothing in the repository tracks the date.

**Impact.** After that date, off-topic and prompt-injection screening would switch off in production chat and research while the health endpoint stays green. Answer verification runs on another model and is unaffected.

**Fix.** Export one classifier model constant and use it for the scope gate, both detector sites and the health probe default. Move it to `gpt-5.4-mini` before the date, after re-running the scope boundary scenarios and `e2e/tests/smoke/abuse.spec.ts`. Treat 404 as an error in the probe, report detector failures through `onDetection`, update the Jev tooling that pins `gpt-5-mini`, and record the date in `docs/development/gotchas.md`.

*What is and is not established: The removal date is from OpenAI's deprecations page; whether the alias will be repointed is not stated. Fail-open behaviour was read from code, not observed.*

Where: `packages/agent/src/index.ts:161`, `packages/agent/src/deep-research/agents.ts:59`, `packages/agent/src/processors/scope-gate.ts:52`, `packages/agent/src/health.ts:67`

### EVAL-13 · Judge call has no retry, scores parse failures as zero, and its credentials failed

**medium** · effort M · evaluation validity, reliability, dependency, release gate

The judge is `claude-sonnet-4-6`, hardcoded at `packages/pipeline/src/pipeline/config.py:89` and called once with no retry (`packages/pipeline/src/pipeline/eval/judge.py:73-88`). The 3 October audit recorded HTTP 401 from Anthropic for both Railway service credentials; local keys were not tested. An unparseable reply is recorded as zero on all five dimensions and enters the means (`judge.py:153-161`); four such rows exist in local April 2026 results and none since a parser fix. The request sends `temperature: 0`, which Anthropic documents as an error on Claude 4.7 and later, including the Sonnet 5.5 calibration candidate.

**Impact.** With those credentials no answer can be scored, so no release or model comparison can be qualified. A transient provider error invalidates a run as release evidence and forces a paid rerun.

**Fix.** Restore the Anthropic evaluation credential. In `judge.py`, raise on unparseable or invalid output so the existing judge-error path excludes it, validate that all five scores are integers from 0 to 3, check `stop_reason`, and retry on timeouts, 429 and server errors. Add `packages/pipeline/tests/test_judge.py`. Leave the Sonnet 4.6 request unchanged; add a successor request shape without `temperature` and calibrate it on stored rows before changing thresholds.

*What is and is not established: The 401 responses were recorded by the 3 October audit for the Railway service credentials; local keys were not tested. Zero-score rows exist only in April 2026 results.*

Where: `packages/pipeline/src/pipeline/eval/judge.py:153`, `packages/pipeline/src/pipeline/eval/judge.py:78`, `packages/pipeline/src/pipeline/config.py:89`, `docs/validation/qualification-cycle-2026-10-03/model-audit.md:3`

### EVAL-14 · The weekly gate before the production data push cannot fail closed

**medium** · effort S · release gate, reliability, data quality

`scripts/ops/eval-gate.sh` guards the weekly refresh's destructive production data push. Its first step, `eval-validate`, prints missing references but never exits non-zero (`packages/pipeline/src/pipeline/cli/eval.py:339-342`). With no baseline file it records the new run as last-known-good and passes (`scripts/ops/eval-gate.sh:34-37`), and the baseline advances on every pass. The baseline cache is empty on the owner's workstation, so the next run to reach the gate would pass unconditionally. The scheduled job currently dies at its crawl step before the gate, so the defect is latent.

**Impact.** Once the scheduled job is repaired, the operator could push a regressed corpus to production with the gate reporting it safe, and later runs would be compared against that run.

**Fix.** Make `eval_validate` exit non-zero on schema errors, missing references and empty primary sections, with a test for the exit code. Then either remove the production push from `scripts/ops/weekly-refresh.sh` and delete `scripts/ops/eval-gate.sh`, or delete its record-and-pass branch so a missing baseline exits 1 and must be seeded explicitly.

*What is and is not established: Latent: the scheduled job currently fails at its crawl step before reaching the gate. The empty baseline cache was seen on the owner's workstation only.*

Where: `scripts/ops/eval-gate.sh:34`, `packages/pipeline/src/pipeline/cli/eval.py:339`, `packages/pipeline/src/pipeline/cli/eval.py:310`, `docs/development/gotchas.md:140`

### EVAL-15 · Evaluation harness parses agent output loosely and its real subprocess path is untested

**medium** · effort M · evaluation validity, reliability, test gap

`packages/pipeline/src/pipeline/eval/levels/answer.py:88-94` takes the last JSON object line after each marker in the agent's standard output, a stream the loggers share. With the logger switched to JSON output, which its docstring describes, the evidence block parses as a log line and the judge receives no agent sources; the run completes. `extract_answer` returns all of standard output when the answer marker is missing. The three subprocess tests take a test-only `communicate()` branch (`answer.py:199`), so the reader-thread and timeout path is untested. Answer rows carry judge scores under retrieval metric names.

**Impact.** A logging or protocol change would shift the answer and hallucination scores that feed release gates without raising an error, and the owner would read it as a quality change.

**Fix.** Send logs to standard error in command-line mode. In `answer.py`, raise when a zero-exit run lacks the answer marker and validate each present block against a schema instead of falling back to an earlier line. Raise on missing keys in `agent_bridge._normalize_results`. Delete the `communicate()` branch and the tuple-padding wrapper, test the real `Popen` path with a fake script, and remove the `precision`, `recall`, `mrr` and `primary_hit` aliases from answer rows.

*What is and is not established: Latent: it needs the logger switched to JSON output or a protocol change. Read from code; no affected run was observed.*

Where: `packages/pipeline/src/pipeline/eval/levels/answer.py:88`, `packages/pipeline/src/pipeline/eval/levels/answer.py:199`, `packages/agent/src/logger.ts:9`, `packages/pipeline/src/pipeline/retrieval/agent_bridge.py:58`

### EVAL-16 · Unknown model identifiers route to Anthropic, and the advertised Claude path cannot run

**medium** · effort M · reliability, needless complexity, documentation, dependency

`createModel` routes every identifier not starting with `gpt-`, `o1`, `o3` or `o4` to Anthropic (`packages/agent/src/model.ts:34-44`), and five other sites derive the provider separately. Startup checks only whether a Claude `AGENT_MODEL` has a key (`packages/agent/src/runtime-config.ts:113`), so a mistyped `VERIFIER_MODEL` boots and every answer is withheld while health checks stay green. `RUNBOOK.md`, `README.md` and `.env.example` advertise Claude for the agent, but step 0 forces a tool choice (`packages/agent/src/processors/answer-frame-prefetch.ts:15`) that Anthropic documents as an error on Sonnet 5.5 and Opus 5.5. These failures need a non-default setting and were not observed live.

**Impact.** The operator can take chat down or silently disable the scope gate with one mistyped variable during the planned model migration. No unverified answer is released.

**Fix.** Decide whether Claude is a supported generator. If not, remove the Anthropic branch, dependency, health probe, price rows and documentation from the agent. Add one `resolveModel` function that throws on an unknown identifier and is used by every site. In `loadRuntimeConfig`, validate `AGENT_MODEL`, `DEEP_RESEARCH_MODEL`, `VERIFIER_MODEL` and `SCOPE_GATE_MODEL`, keeping the last two OpenAI-only. Add a table-driven resolver test and a startup test that rejects a Claude `VERIFIER_MODEL`.

*What is and is not established: Latent: each failure needs a non-default or mistyped setting, and none was observed live. The Claude tool-choice error is from Anthropic's documentation.*

Where: `packages/agent/src/model.ts:34`, `packages/agent/src/runtime-config.ts:113`, `packages/agent/src/processors/answer-frame-prefetch.ts:15`, `packages/agent/src/health.ts:128`

### EVAL-17 · Chat cost reporting omits the verifier and classifiers and cannot price cache writes

**medium** · effort M · cost

The chat route records only the main agent's token usage (`packages/agent/src/chat-route.ts:79-94`). The verifier call at `packages/agent/src/processors/verifier/processor.ts:83` passes no `onUsage`, although deep research does, and the scope gate and injection detector record nothing. In a six-question command-line sample with the agent on `gpt-5.4`, the verifier was 37% of model cost; the production share is unmeasured. `packages/agent/src/usage/pricing.ts` has no cache-write rate, although OpenAI bills cache writes at 1.25 times the input rate from GPT-5.6 onward, and its prefix match prices `gpt-5.4-nano` at the `gpt-5.4` rate without a warning.

**Impact.** The owner's cost-per-query figure and any per-seat price derived from the monthly usage report would be too low. The provider invoice remains the only accurate number.

**Fix.** Set a usage recorder on the request context in `chat-route.ts`; have the verifier pass it as `onUsage` and the scope gate record its usage under new phases, and count runs in `packages/agent/scripts/usage-report.ts` only where the phase is empty. Add a test asserting a verifier usage row. Refresh `@ai-sdk/openai` within its declared range, add a cache-write token column and rate, match exact identifiers or dated snapshots in `pricingFor`, and drop the unused `estimated_cost_usd` column.

*What is and is not established: The 37% verifier share comes from a six-question command-line sample; the production share is unmeasured. The cache-write rate is from OpenAI's published pricing.*

Where: `packages/agent/src/processors/verifier/processor.ts:83`, `packages/agent/src/chat-route.ts:82`, `packages/agent/src/usage/pricing.ts:38`, `packages/agent/src/usage/repository.ts:83`

### EVAL-18 · Jev experiment gates cannot answer the questions they are meant to decide

**medium** · effort M · needless complexity, evaluation validity, cost

The Jev frame gate passes on any strict improvement, which one of 55 golden questions can supply (`packages/pipeline/src/pipeline/jev/benchmarks.py:291`). A role qualifies on ten predictions at 0.9 precision (`packages/pipeline/src/pipeline/jev/reports.py:183`), which a role with true precision 0.75 passes 24% of the time. `compare_answers` (`reports.py:256-263`) applies the release floors to each run and fails on any hallucination decline; it rejects 1,497 of 1,700 unchanged splits of stored July runs. The harness is about 3,400 lines hooked into release stamping, and its readiness record is no-go.

**Impact.** The owner carries maintenance and release coupling for a feature that is switched off. A paid study under these gates could qualify a role by chance, or reject every candidate after six paid runs.

**Fix.** Make one keep-or-delete decision. Remove the scope and routing experiments now. For section roles, first check that whole-corpus labelling fits the budget ledger and that an independent reviewer exists; if either fails, delete every Jev hook, including `compare_answers` and its command, and record why in `docs/development/gotchas.md`. If the study proceeds, require a 95% lower precision bound of 0.90 and reuse the paired comparison adopted for model comparisons on three-run means.

*What is and is not established: Failure rates were computed on 22 stored July runs of the held-out set on the legacy graph. The feature is off, so nothing reaches users.*

Where: `packages/pipeline/src/pipeline/jev/benchmarks.py:291`, `packages/pipeline/src/pipeline/jev/reports.py:183`, `packages/pipeline/src/pipeline/jev/reports.py:256`, `docs/development/jev.md:46`

## Low severity

### EVAL-19 · Model documentation and two comparison-script gates have drifted from code defaults

**low** · effort S · documentation, needless complexity

`RUNBOOK.md:18` and `:23` give the verifier default as `gpt-5.4-mini`; the code default is `gpt-5.6-terra`. `RUNBOOK.md:55` and `packages/agent/src/model.ts:26` claim price parity that no longer holds. In `scripts/eval-ab.sh`, the embeddings baseline cannot run and the verifier gate has no verdict.

**Impact.** An operator following the runbook budgets the verifier at about a third of its real price, and the embeddings comparison fails at its first arm before any paid call.

**Fix.** Correct the two runbook lines and the price wording, record why production overrides `AGENT_MODEL` or remove the override, and list the seven undocumented model variables in `.env.example`. Delete the embeddings and verifier gates from `scripts/eval-ab.sh` together with `docker-compose.ab.yml`, or re-baseline them on current defaults and require an explicit candidate.

*What is and is not established: The runbook lines were read directly. The comparison-script failures were read from code, not run.*

Where: `RUNBOOK.md:23`, `scripts/eval-ab.sh:173`, `packages/agent/src/model.ts:26`, `packages/pipeline/src/pipeline/embeddings/tokenizer.py:10`
