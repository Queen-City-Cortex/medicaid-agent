# Working artifact from the round-two critic-release-gate-attainability review

Everything was recomputed from stored result files with one script; no paid calls and no Neo4j access. All stored runs used the legacy graph. The 22 July runs predate withholding and use the held-out paraphrase set; one commit's two arms are inferred from run order, which reproduces the means quoted in model.ts. Nothing stored is the 55-question benchmark on a current graph.

The retrieval gates cannot be met. Recall is 0.30 to 0.36 and primary hit 0.46 to 0.58. Label count (ceiling 1.0) and identifier variants (no effect) do not explain it. Document-level hit tops out at 0.94 and the agent's own trail at 0.76, and at 55 questions five sit in a family the default search excludes.

Answer gates: no September run reaches 2.75 (best 2.70) under either treatment of withheld answers, and single-run floors fail 7 of 20 unchanged July runs.

The simulation supports floors on a three-run mean and the paired two-standard-error rule (4% false alarms), with no runs beyond the six #188 already requires. The −0.10 lower-bound rule, a 0.05 limit, 'hallucination ≤ 1 in two of three' and per-run floors fail 18% to 90% of unchanged comparisons.

What was fine: the retrieval metric is deterministic, run noise matches independent per-question noise, the 0.15 limit is not tripped by noise, and the hallucination floor was met in 23 of 25 runs. The one unavoidable amendment to #188 is its retrieval bullet.

Every number below reproduces with `python3 analysis.py` in the scratch directory (reads stored JSON only; writes `results.json` and `tables.md`). All stored runs used the legacy graph. The 22 July runs predate server-enforced withholding and use the 50-question held-out paraphrase set; the September runs use the 50 historical golden questions. Nothing stored is the 55-question benchmark on a current-scheme graph.

### 1. Why recall@10 is about 0.3 (ten June retrieval runs, 50 questions, k=10)

| Definition | nine held-out runs | golden-default run 06-12T17:10 | April milestone (25 q) | floor |
|---|---:|---:|---:|---:|
| Exact section recall (what the gate reads) | 0.295–0.320 | 0.360 | 0.686 | 0.9 |
| Primary section hit (what the gate reads) | 0.46–0.50 | 0.58 | 1.00 | 0.95 |
| Recall, primary labels only | 0.39–0.42 | 0.463 | 0.90 | |
| Any labelled section in top 10 | 0.50–0.54 | 0.62 | 1.00 | |
| Recall / hit after stripping `:dupN` | unchanged | unchanged | unchanged | |
| Recall / hit counting parent or child sections | unchanged | 0.365 / 0.58 | unchanged | |
| Primary document hit | 0.90–0.94 (45–47 of 50) | 0.92 | 1.00 | |
| Document recall | 0.883–0.913 | 0.893 | 0.967 | |
| Ceiling of recall@10 from label count (1–5 labels, mean 2.08) | 1.0 | 1.0 | 1.0 | |
| Questions: right document, labelled section not in top 10 | 22 | 17 | 0 | |
| Questions: primary document absent | 3–5 | 4 | 0 | |
| Top-10 slots filled from a primary document (mean) | 5.8–6.0 | 6.0 | 5.4 | |

Three repeat runs on one graph (06-14T05:06, 05:07, 19:32) are identical, so the metric is deterministic.

By reasoning type (run 06-14T19:59, held-out; the golden-default run in brackets):

| type | n | primary section hit | primary document hit |
|---|---:|---:|---:|
| negative_answer | 15 | 0.27 (0.20) | 1.00 (0.87) |
| temporal | 6 | 0.00 (0.00) in all ten runs | 0.67 (0.67) |
| single_lookup | 14 | 0.71 (0.86) | 1.00 |
| federal_reference | 5 | 0.60 (0.80) | 0.80 (1.00) |
| multi_hop | 5 | 0.60 (1.00) | 1.00 |
| cross_document | 5 | 1.00 (1.00) | 1.00 |

17 of the 23 negative-answer primary labels are the template sections 2.1.1 and 4.1. In the golden-default run the original 25 questions hit 22 of 25 and the 25 added after April (15 negative-answer, 5 temporal, 5 federal-reference) hit 7 of 25. At n=55 the 0.95 floor needs 53 hits, so at most 2 misses; q-051 to q-055 have every primary label in beneficiary_guidance, which the default search types exclude.

### 2. Agent trail, recomputed from `agent_evidence.sources[]`

| Matching rule | July ×22: recall / primary hit | Sept baseline | Sept initial gate | Sept final gate |
|---|---|---|---|---|
| Exact section id among source keys | 0.31–0.49 / 0.46–0.70 | 0.44 / 0.64 | 0.39 / 0.60 | 0.50 / 0.72 |
| Same, excluding the routing-hint entry | 0.20–0.45 / 0.28–0.64 | 0.38 / 0.56 | 0.36 / 0.54 | 0.50 / 0.72 |
| Keys plus section ids listed in the frame text | 0.44–0.55 / 0.64–0.76 | 0.55 / 0.76 | 0.53 / 0.74 | 0.54 / 0.76 |
| Any id mentioned in any tool output text | 0.63–0.81 / 0.72–0.88 | 0.78 / 0.88 | 0.79 / 0.86 | 0.77 / 0.86 |
| Primary document reached | 0.88–0.94 | 0.90 | 0.90 | 0.88 |

Question-runs with no labelled primary section among the keys that the judge still scored 3 of 3: July 333 of 473; September final 7 of 14.

### 3. Rule simulation on the July runs (unchanged configuration, so each failure is a false alarm)

Seven same-configuration groups: six of three runs and one of two. The six 8dcea40 runs are split three and three by run order, which reproduces the two arm means quoted in model.ts; the files do not record the agent model. SE is the standard error of the mean per-question difference; "1 v 1" and "3 v 3" are runs per arm; a pair or split is ordered (baseline, candidate).

| Rule | Same configuration (real runs) | Same commit, arms mixed (real runs) | Expected at the July mean (2.773 / 2.563), n=55 |
|---|---|---|---|
| Single-run floors 2.75 / 2.5 | 7 of 20 runs fail; 5 of 7 groups land on both sides; 9 of 19 pairs disagree | 7 of 22 | 36% |
| Floors on the mean of three runs | 1 of 6 triples | 40 of 114 | 19% |
| Floors on each of three runs | 4 of 6 | 93 of 114 | 73% |
| Paired per-question difference below −2·SE, 1 v 1 | 1 of 38 | 6 of 122 | 4% |
| Same, 3 v 3 | not formable | 31 of 1,700 | 4% |
| Lower bound (mean − 2·SE) below −0.10, 1 v 1 | 35 of 38 | 106 of 122 | 87% |
| Same, 3 v 3 / 4 v 4 / 5 v 5 | not formable | 863 of 1,700 (3 v 3) | 46% / 31% / 20% |
| aggregateRegression ≤ 0.15, 1 v 1 | 1 of 38 (0 of 28 among complete runs; largest drop 0.14) | 8 of 122 | 3% |
| Same, three-run means | not formable | 0 of 1,700 | 0% |
| eval-ab.sh today: three-run mean of overall only, 0.05 | not formable | 109 of 1,700 | 7% |
| aggregateRegression ≤ 0.05, 1 v 1 | 15 of 38 | 46 of 122 | 37% |
| Same, three-run means | not formable | 364 of 1,700 | 18% |
| Any question with hallucination ≤ 1 in ≥ 2 of 3 runs | 4 of 6 | 77 of 114 | 56% |
| `compare_answers` as written, answer rules only | not formable | 1,497 of 1,700 | 82% |

Three of the 22 runs contain an agent-timeout or judge-529 row and would be rejected by `require_complete_results`. None of the 22 carries the `outcome` and `pass_count` fields `verification_summary` requires, so they are a noise sample, not gate evidence.

### 4. Noise and detectable differences

| | overall | hallucination |
|---|---:|---:|
| Within-question run-to-run SD | 0.309 | 0.392 |
| SD of one run mean, n=50 observed (predicted from independent questions) | 0.044 (0.044) | 0.056 (0.055) |
| SD of a three-run mean, n=50 / n=55 | 0.025 / 0.024 | 0.033 / 0.031 |
| SE of the paired difference, 1 v 1, n=50 / n=55 | 0.062 / 0.059 | 0.078 / 0.075 |
| SE of the paired difference, 3 v 3, n=50 / n=55 | 0.036 / 0.034 | 0.045 / 0.043 |
| Drop the −2·SE rule detects 80% of the time, 1 v 1 / 3 v 3, n=55 | 0.17 / 0.10 | 0.21 / 0.12 |
| Drop the 0.15 limit detects 80% of the time, 1 v 1 / three-run means, n=55 | 0.20 / 0.18 | 0.21 / 0.19 |
| True mean needed to clear the floor in 95% of attempts, single run / three-run mean, n=55 | 2.82 / 2.79 | 2.59 / 2.55 |

Chance of clearing 2.75 by true answerScore (n=55): 2.70 → 12% single, 2% three-run mean; 2.72 → 24%, 11%; 2.77 → 68%, 80%; 2.80 → 88%, 98%.

### 5. September rows under the two treatments of withheld answers (answerScore / hallucinationScore; floors 2.75 / 2.5)

| Run | Withheld | Current (withheld = 0 and 3) | Released rows only, plus a cap | Withheld = 0 overall, skipped for hallucination |
|---|---:|---|---|---|
| baseline (no enforced gate) | 0 of 50 | 2.70 / 2.56 | 2.70 / 2.56 | 2.70 / 2.56 |
| initial gate | 15 of 50 | 1.92 / 2.82 | 2.743 / 2.743 | 1.92 / 2.743 |
| final gate | 2 of 50 | 2.60 / 2.66 | 2.708 / 2.646 | 2.60 / 2.646 |
| final plus the two quote-repair rows (composite, not a run) | 0 of 50 | 2.72 / 2.66 | 2.72 / 2.66 | 2.72 / 2.66 |

Paired difference against the baseline: initial gate −0.78 (SE 0.18, flagged) on all rows and 0.00 on released rows; final gate −0.10 (SE 0.08, not flagged) on all rows and 0.00 on released rows. With withheld = 0, the 2.75 floor allows 0, 0, 1, 2, 4 withheld answers of 55 at released means of 2.75, 2.80, 2.85, 2.90, 3.00. With released-only scoring and a cap of 5 of 55, an all-rows score of 2.50 passes; dropping the five lowest rows of the final run lifts 2.60 to 2.756. On 55 questions 2.75 needs 151.25 of 165 points: if the other 50 average 2.77 the five new questions must average 2.55; at 2.72 they would need 3.05. Of the 20 stored 50-question runs on golden questions (17 in April, 3 in September) none reaches 2.75; the maximum is 2.70.

### 6. Round-one proposals against the wording of issue #188

| Proposal (source) | Against #188 |
|---|---|
| Three paired baseline and candidate runs | Required by it |
| Floors on the mean of the three candidate runs (rag-design-05, prior-findings-01, pipeline-eval-08) | Same floors; contradicts only the comment's "first canonical" if it replaces that verdict |
| Paired per-question difference below −2·SE (rag-design-05, pipeline-eval-08) | Compatible as an addition; contradicts "aggregate regression <=0.15" only if it replaces it |
| Withheld = 0 overall, skipped for hallucination (pipeline-eval-04) | Answer score unchanged; changes what the 2.5 floor measures; must land before the freeze |
| Withholding cap (prior-findings-01, pipeline-eval-04) | Compatible addition |
| Released-only answerScore (prior-findings-01) | Contradicts "satisfy existing policy v2" as coded |
| Retrieval floors report-only, or moved to trail or document level (prior-findings-01, pipeline-eval-08) | Contradicts "recall >=0.9, primary-evidence hit >=0.95" |
| Floors re-derived as mean minus two SD; per-metric or 0.05 regression limits; policy v3 (pipeline-eval-08, pipeline-eval-07) | Contradict the listed floors and limit |
| Dataset edits: rewrite q-042 to q-045, validation status, re-anchored labels (pipeline-eval-01, rag-design-05) | Contradict "unchanged 55-question benchmark" |
| Hallucination ≤ 1 in two of three runs (rag-design-05) | Compatible, stricter; fails 4 of 6 unchanged triples |
| Paraphrase or unseen-topic sets, reported only (architecture-01, prior-findings-05, rag-design-03, pipeline-eval-02) | Compatible additions |
| A/B rule changes (model-strategy-03, pipeline-eval-03); floors in eval-gate.sh (pipeline-eval-09); `compare_answers` changes | Outside #188 |

Smallest rule set that satisfies the wording: the gate as coded, three paired runs, the first candidate run canonical. No code change is needed, and it cannot pass, because of the retrieval bullet. That bullet is the one unavoidable amendment.

### 7. Paid runs and cost

Unit costs from the repo's own scenario (assumed tokens, not measured spend): $0.62 per benchmark answer with the agent priced as gpt-5.4, $0.56 on gpt-5.6-terra; $0.10 per verifier pass; $115 for a full corpus embedding. About 28 minutes per 50-question answer run.

| Rule set or add-on | Answer runs | Benchmark answers | USD |
|---|---|---:|---:|
| Policy v2 as coded, scheduled release | 1 | 55 | 31–34 |
| Policy v2 as coded, bootstrap | 2 | 110 | 61–69 |
| Issue #188 as written | 6 | 330 | 183–206 |
| Three-run candidate mean, one baseline run | 4 (3 when scheduled) | 220 | 122–137 |
| Three-run mean floors plus paired difference of arm means | 6, none beyond #188 | 330 | 183–206 |
| Paired difference, one run per arm | 2 | 110 | 61–69 |
| Model A/B at 4 or 5 runs per arm, 50 questions | 8 or 10 | 400 or 500 | 222–312 |
| Add-on: heuristics ablation, 2 arms × 3 runs × 50 | 6 | 300 | 166–187 |
| Add-on: ablation on a 40-question disjoint set, 3 arms × 1 to 3 runs | 3 to 9 | 120–360 | 67–224 |
| Add-on: paraphrase set, once per validation or as three-run means | 1 or 3 | 50 or 150 | 28–93 |
| Add-on: unseen-topic set of 20 to 40 questions, three answer runs | 3 | 60–120 | 33–75 |
| Add-on: seeded verifier benchmark (three findings, one harness) | 0 | 0 (300–600 verifier passes) | 31–62 |

At the July rate of invalid runs (3 of 22), six consecutive runs are all complete 41% of the time; about seven runs are needed to obtain six. Scope acceptance adds 16 agent runs per validation (about $9) and each rebuild about $115 of embeddings. Adopting every add-on once alongside the #188 matrix comes to 960 to 1,260 benchmark answers ($530 to $790) against 330.

### 8. Rule set the simulation supports

1. Retrieval: no absolute floors. Gate on no regression against the baseline within one question; report exact, document-level and trail figures. This amends #188.
2. Answer floors 2.75 and 2.5, unchanged in value, applied to the mean of the three candidate runs over released answers, plus a cap on withheld answers stated as a count. This amends the #188 comment and the metric definition.
3. Regression: paired per-question difference of three-run arm means, failing below −2 standard errors on overall or hallucination, computed with withheld answers at zero on the questions both graphs can answer. Keep 0.15 as the coarse limit.
4. Not adopted: 0.05 on answer metrics; −0.10 lower-bound verdicts at five or fewer runs per arm; floors on each of three runs; zero-tolerance hallucination decline; "hallucination ≤ 1 in two of three" as a blocking rule before the judge evidence budget is fixed.
5. Cost: six answer runs for qualification, the same as #188 as written; one run for a scheduled release, compared with the previous release under rule 3.
6. Order of spend: the retrieval-only run first, then one candidate answer run, then the remaining five.
