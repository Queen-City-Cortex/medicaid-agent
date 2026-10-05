# Working artifact from the pipeline-eval reviewer

## 0. Local graph identity (read before any graph-derived claim)

- Container `2026-03-26-medicaid-agent-neo4j-1`, Neo4j 2026.05.0 community. 7,589 Document, 71,695 Section, 11,477 Chunk, 33 PolicyConcept nodes. `Document.last_indexed` runs from 2026-07-11T16:47Z to 16:58Z.
- Legacy human-readable IDs (`doc:clinical_policy:10A`). No release, manifest or pipeline-version stamp on any node. No `beneficiary_guidance` family. 56,102 of 71,695 sections are embedded at 1,024 dimensions.
- These are the same counts that `milestones/2026-09-22-verified-release/manifest.json` records for the corpus its judge scored against (7589 / 71695 / 11477, `release_id` null).
- `dataset.json` (hashed IDs): 0 of 99 distinct evidence section IDs exist. `heldout-paraphrase.json` (legacy IDs): 90 of 90 exist. Section lists are identical between the two files for 49 of 50 questions (q-019 differs), so all checks used the held-out IDs.

## 1. Is 2.800 against 2.760 distinguishable from noise? No.

| Quantity | overall | hallucination |
|---|---|---|
| Baseline arm runs (gpt-5.4) | 2.760, 2.800, 2.720 | 2.520, 2.560, 2.580 |
| Candidate arm runs (gpt-5.6-terra) | 2.800, 2.780, 2.820 | 2.640, 2.700, 2.580 |
| Difference | +0.040 | +0.087 |
| Welch standard error from the 3+3 runs | 0.026 (t 1.55, 2.9 df, p 0.22) | 0.039 (t 2.23, 3.0 df, p 0.11) |
| Pooled same-configuration run SD (16 runs, 11 df) | 0.050 | 0.062 |
| Standard error of a difference of two 3-run means (pooled) | 0.041 (z 0.98, p 0.33) | 0.050 (z 1.74, p 0.08) |
| Paired by question (n = 50) | SE 0.042, t 0.95, p 0.35 | SE 0.049, t 1.76, p 0.085 |
| Bootstrap 95% interval over questions | -0.040 to +0.120 | -0.013 to +0.180 |
| Questions that differ between arms | 19 of 50 (11 up, 8 down) | 29 of 50 (20 up, 9 down) |
| Smallest difference detectable at 80% power | about 0.115 | about 0.14 |

Other dimensions, paired by question: factual +0.020 (p about 0.67), completeness +0.013 (p about 0.68), citation +0.100 (p 0.06).

Arms are identified by mtime order, as `compare_answer_arms` does; the result files do not record the agent model. Source files: `data/eval-results/2026-07-09T19:55:52` through `22:09:36_answer.json` (gitignored). The tracked milestone triple at one commit (2.86, 2.78, 2.82) gives the same run SD of 0.04.

Ceiling effect: 235 of 300 answers scored overall 3, 64 scored 2 and 1 scored 1. The mean is effectively the share of 3s, and 0.04 is two questions per run.

The run-to-run figure mixes agent and judge variance; the stored data cannot separate them because every run regenerates answers.

## 2. Spread of the 50-question mean at fixed configuration

| git sha, dataset | runs | overall mean (SD) | hallucination mean (SD) |
|---|---|---|---|
| c1257a0, golden | 3 | 2.331 (0.014) | 2.240 (0.080) |
| d1ee2eb, golden, golden-only evidence | 3 | 2.360 (0.053) | 2.053 (0.070) |
| d1ee2eb, golden, unified evidence | 3 | 2.613 (0.064) | 2.467 (0.042) |
| 109a15d, held-out | 2 | 2.800 (0.028) | 2.560 (0.057) |
| eb6bcde, held-out (reranker A/B, arms mixed) | 9 | 2.753 (0.039) | 2.522 (0.061) |
| 8dcea40, held-out (agent A/B, two models) | 6 | 2.780 (0.036) | 2.597 (0.064) |
| 210ced2, held-out | 5 | 2.788 (0.061), range 2.74 to 2.88 | 2.588 (0.081), range 2.50 to 2.72 |

- Per-question instability within one configuration: 11 of 50 and 12 of 50 questions changed overall score across 3 runs; 22 of 50 across 5 runs. No question moved by 2 or more.
- `compare_runs(threshold=0.05)` over 40 ordered pairs of identical-configuration runs: 31 flagged as regression.
- Release answer gates (overall >= 2.75 and hallucination >= 2.5) applied to the eleven July runs of three unchanged configurations: 8 pass.

## 3. Golden answer-key ledger (24 entries, purposive sample, legacy graph)

| Q | Key claims | Cited evidence (characters) | Result |
|---|---|---|---|
| q-012 | 60 days per calendar year; physician order; plan of care | 2B-1 §5.8 (2,430) | Supported, near verbatim |
| q-013 | DMA-3513 within five business days | 3G-1 §5.2.4.1 (2,072) | Supported |
| q-014 | Wait 30 days; submit on days 31 to 60; Change of Status exempt | 3L-1 §5.6 (2,310) | Supported |
| q-023 | Fluoride varnish until 3½ years | 1A-23 §7.2 (1,244) | Supported |
| q-048 | 42 CFR 438.8 MLR, 85% | 438.8 (18,416) | Broadly supported; the "85% minimum for MCOs" wording was not checked against paragraph (c) |
| q-016 | "Terminally ill" means six months or less; certification sources | 3D §5.4.1, §5.4.3, §3.2.1 | Certification supported; the definition the question asks for is in none of the three sections ("six months" absent) |
| q-047 | 430.12 sets submission timing and "the federal review timeline" | 430.12 (2,190) | Partly: no review-timeline language ("90 days" absent) |
| q-001 | Aged 18 or older; level of care; ADL need | 3K-2 §2.1.1 and §3.1 (template text), §3.2.1 | Both primaries are template text; "18" appears in none of the three sections |
| q-017 | Not medically necessary; convenience; provider's office; standby or waiting | 15 §4.2.1.4 (713) | Only "waiting fees" matches. The section lists: no treatment needed, false alarm, refused services, non-covered service, airline tickets, airstrip fees, taxes, nursing personnel charges, oxygen |
| q-019 | Medically necessary AND resides in a remote or underserved area; same clinical standards; document why | Golden: 10A §3.1.1 (385, a pointer to Policy 1-H). Held-out: "e. Telehealth" (1,148) | Text says exposure to others should be avoided OR location is remote or underserved. The adjunct-not-replacement, best-interest and productivity rules are missing from the key; "document why" is absent from the text |
| q-022 | Specific diagnoses; approved transplant center | 11A-17 §3.2.1 (743) | Text: FDA approval, use per FDA labelling, certified or authorized treatment center, REMS. "diagnos" and "transplant" absent |
| q-026 | §2.1.1 is the description and scope of 5B | 5B §2.1.1 (372), §4.1 (434) | Both template text; neither mentions orthotics, prosthetics or scope |
| q-027 | Clinical-severity criteria in §2.1.1; §4.1 confirms cosmetic exclusion | 1A-15 §2.1.1, §4.1 | Neither mentions BMI, obesity or cosmetic |
| q-028 | §2.1.1 scope; §4.1 confirms acupuncture not covered | 8C §2.1.1, §4.1 | Neither mentions behavioral health or acupuncture |
| q-031 | Scope §2.1.1; gym fees "confirmed as not-covered in section 4.1" | 1A-2 §2.1.1, §4.1 | Neither mentions the assessment or memberships; the description is §1.0 |
| q-032 | §2.1.1 requires a prescription and an OTC list; §4.1 confirms retail OTC not covered | 9 §2.1.1, §4.1 | Neither mentions prescription or OTC (that text is in §1.0 and §3.2.1) |
| q-034 | Cosmetic whitening excluded | 4A §4.1 (434) | Template text; "cosmetic" absent |
| q-035 | Replacement only after a minimum useful life or unrepairable failure under warranty | 5A-2 §3.2.1 (1,094), §4.2.1 (442) | No replacement, frequency, useful-life or warranty language in either |
| q-036 | 1-H is a modality, not a benefit | 1-H §2.1.1 (470) | Template text; "telehealth" absent |
| q-038 | Rent, utilities and groceries explicitly excluded | 3K-2 §4.1 (434) | Template text; "room and board" absent |
| q-039 | Medical-complexity criteria "in section 3.2.1" | 3G-1 §2.1.1 (470), §3.2.1 (11) | §3.2.1 body is "None Apply."; the criteria are in §3.2.2 |
| q-020, q-037, q-042 | NEMT revision header; NEMT scope | MA-3550 `_s2` (0) | Sole primary section has an empty body (title only) |

Tally: 5 supported, 3 partly, 13 with claims absent from or contradicted by the cited sections, 3 with empty sole evidence. Claims were checked against the cited sections only, not against the whole policy, so some key statements may be true of the policy while unsupported by the labelled evidence.

Template check over all 177 clinical policies in the graph: §4.1 contains the same four exclusion clauses in 177 (mean 436 characters); §2.1.1 is titled "2.1.1 General" in 176 and contains "An eligible beneficiary shall be enrolled in" in 175 (mean 466 characters); §3.1 contains the standard medical-necessity clause in 177. The description lives in §1.0 "Description of the Procedure, Product, or Service" (172 policies).

## 4. Verifier outcome against judge scores (September milestone, 50 questions each)

| Run | Verifier outcome | n | Judge overall | Judge hallucination |
|---|---|---|---|---|
| initial-gate | passed | 22 | 19 at 3, 3 at 2 | 18 at 3, 2 at 2, 2 at 1 |
| initial-gate | corrected | 13 | 7 at 3, 6 at 2 | 11 at 3, 1 at 2, 1 at 1 |
| initial-gate | withheld | 15 | 15 at 0 | 15 at 3 |
| final-gate-full | passed | 35 | 25 at 3, 10 at 2 | 24 at 3, 7 at 2, 4 at 1 |
| final-gate-full | corrected | 13 | 9 at 3, 4 at 2 | 11 at 3, 2 at 2 |
| final-gate-full | withheld | 2 | 2 at 0 | 2 at 3 |

Aggregates as the harness reports them: baseline overall 2.70 and hallucination 2.56; initial gate 1.92 and 2.82; final gate 2.60 and 2.66.

Candidate false passes in the final gate: 4 of 48 released answers with judge hallucination 1 (q-013, q-031, q-040, q-043). q-043 is the evidence-trimming artifact and q-031 traces to a wrong key, leaving 2 of 48 unexplained. Candidate false withholds in the initial gate: of 15 withheld questions, the unverified baseline answer had scored overall 3 for 9. These are different generated answers, so the figure is indicative only.

## 5. Dataset composition

| | dataset.json | heldout-paraphrase.json |
|---|---|---|
| Entries | 55 | 50 (one per q-001 to q-050) |
| reasoning_type | single_lookup 17, negative_answer 17, temporal 6, multi_hop 5, cross_document 5, federal_reference 5 | 14, 15, 6, 5, 5, 5 |
| difficulty | simple 16, moderate 32, complex 7 | 15, 29, 6 |
| source label | legal_aid 24, regression 20, lived_experience 9, edge_case 2 | held_out_paraphrase 50 |
| created | 03-26: 8; 03-28: 17; 04-16: 25; 07-28: 5 | 06-12: 50 |
| Evidence references | 80 primary + 35 supporting (2.09 per question) | 73 + 31 |
| Primary references that are template sections | 21 | 21 |
| Entries whose primaries are all template sections | 12 | 12 |
| Entries containing NEEDS_VALIDATION | 14 | 14 |
| Ordinal (`_sN`) references | 20 of 115 | not counted |
| cross_references (the whole cross-ref level) | 2 | 2 |
| ID scheme | hashed (current loader) | legacy |

Nothing in the repository records an external author or reviewer for the entries labelled legal_aid. The 2026-03-28 and 2026-06-12 additions carry AI co-author trailers, and the 2026-04-16 batch carries drafting notes such as "guessed 9".

## 6. Three gates, three definitions of pass

| Gate | Input | Pass rule | Weakness |
|---|---|---|---|
| `scripts/ops/eval-gate.sh` | 1 retrieval run, dataset.json | No aggregate metric drops more than 0.05 against the last passing run | Validation cannot fail; first run becomes the baseline; baseline ratchets |
| `scripts/eval-ab.sh` agent | 3 answer runs per arm, held-out file | Candidate mean overall >= baseline - 0.05 | No variance term; overall only; arms by mtime; legacy IDs. The verifier variant has no programmatic verdict |
| release-validate | 1 retrieval + 1 answer run, dataset.json plus identity catalog | recall >= 0.9, primary hit >= 0.95, overall >= 2.75, hallucination >= 2.5, largest drop <= 0.15, no error rows | Single run; section-level metric behind a document-level name; thresholds not measured |

Reports use yet other cut-offs: "Failures" are overall < 2 (`reports.py:147`), `primary_hit` is overall >= 2 (`answer.py:588`), and `eval-answer-stability` counts a miss at overall < 3.

## 7. Stored retrieval results (50 questions, top 10)

| Run | Graph, embedding | recall@10 | primary hit (section) | primary hit (document, recomputed) |
|---|---|---|---|---|
| 2026-06-12T17:10:22 | main, voyage-law-2, golden | 0.36 | 0.58 | not computed |
| 2026-06-14T19:32:28 | main, voyage-law-2, held-out | 0.300 | 0.48 | 46 of 50 |
| 2026-06-14T19:59:30 | main, voyage-4, held-out | 0.315 | 0.50 | 47 of 50 |
| Four runs 05:46 to 06:32 on 2026-06-14 | A/B container, both arms stamped voyage-law-2 | 0.295 to 0.305 | 0.46 to 0.48 | not computed |

For 2026-06-14T19:59:30 by category: temporal 0 of 6 primary hits; negative_answer 27%; single_lookup 71%. Questions whose primaries are all template sections: 2 of 12 hit; all others: 23 of 38. The embedding switch changed the primary hit on one question (h-028) and recall on two.

## 8. What the harness does not measure

- Abstention: no expected-withhold questions; withheld text is judged as an answer.
- Production input path: scope gate, coverage boundary, injection detector, message-length guard and memory are not in the evaluated chain.
- Adversarial, off-topic, multi-turn and out-of-corpus questions: none.
- Verifier calibration: no human-labelled claims and no seeded-error set.
- End-to-end evidence recall: computable from every stored answer run (79% in July, 86 to 88% in September) but not reported.
- Section-level citation accuracy: the citation level compares document URLs only.
- Staleness: no as-of date or content hash per key; existence is the only reference check.
- User feedback: stored by the agent, read by nothing in the pipeline.
