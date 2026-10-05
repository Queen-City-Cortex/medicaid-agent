# Working artifact from the round-two critic-stored-run-incidence review

I replayed every stored answer run offline (no paid calls, no Neo4j). Six tracked milestone files are byte-identical copies of local files, so the usable set is 129 runs and 2,510 answers (1,697 with verifier evidence, 2,178 with a recorded route, 107 under server-enforced withholding), not 135 and 2,778. Every run describes a legacy-ID graph.

Truncation markers sit in 47% of evidence sets, but the runs show no harm: no score drop within the same question and commit, no citation of text beyond the 6,000-character window, and only 2 of 50 base questions whose reference fact lies beyond it. The benchmark cannot exercise that defect, the sibling-lookup defect or the clinical-token defect. Both proposed citation validators would fail correct released answers in the enforced runs (3 and 1 of 90) and catch nothing there; across all eras they find 21 wrong pins in 8 answers among 155 and 77 flags. The web resolver puts 15% of footnotes on the wrong section row. The first authoritative document differs from every golden document in 27% of rows, with low-accuracy answers 3.7 times more frequent, all before July. Route flips are score-neutral. The identifier count is confirmed: 19 of 2,702 (15 of 2,434 unique) and 0 of 100 questions.

Fine: no delivered answer lacked a section body, no fee-schedule source was used, and no answer adopted a proposed amendment's figure.

All counts are from stored eval files and describe **legacy-ID graphs** (local April, June and July 2026 builds; production `legacy-20260725-ae8595c` for the two five-question production runs). "Unique" means after removing six tracked milestone files that are byte-identical to local files (268 rows). The agent model is not recorded in the run files.

## A. Runs and denominators

| | Files | Rows | Non-empty answers | Evidence key | Non-empty evidence | Route | Verifier telemetry | Enforced outcome |
|---|---|---|---|---|---|---|---|---|
| As briefed (all files) | 135 | 2,778 | 2,702 | 51 runs / 1,984 | 1,965 | 118 runs / 2,446 | 116 runs / 2,562 | 4 runs / 107 |
| Unique | 129 | 2,510 | 2,434 | 45 runs / 1,716 | 1,697 | 112 runs / 2,178 | 110 runs / 2,294 | 4 runs / 107 |

| Era | Runs | Rows | With evidence | Commits | Verifier design |
|---|---|---|---|---|---|
| April, no verifier | 18 | 140 | 0 | cc6cae1, a1936f7, c1257a0 | none recorded |
| April advisory | 72 | 807 | 150 (all d1ee2eb) | c1257a0 to ca0024c (13 commits) | advisory marker/rewrite, gpt-5.4-mini, no gate |
| June advisory | 11 | 301 | 286 | 08b490e, 71ef5a0, b12daf8, 9340fdb, e5c5a52, 109a15d, 2a63421 | advisory, gpt-5.4-mini |
| July advisory | 22 | 1,100 | 1,099 | eb6bcde, 262fcbd, 8dcea40, 797e779, 210ced2 | advisory, gpt-5.4-mini (949 rows), gpt-5.6-luna (150) |
| Sept baseline | 1 | 50 | 50 | 93d9b34 | advisory rewrite, no gate |
| Sept initial gate | 1 | 50 | 50 | fce8923 | enforced, gpt-5.4-mini; 15 withheld |
| Sept final gate | 1 | 50 | 50 | 1d93d60 (recorded at 81558df) | enforced, gpt-5.6-terra low; 2 withheld |
| Sept production baseline / candidate | 1 / 1 | 5 / 5 | 5 / 5 | 93d9b34 / bbc3a67 | advisory / enforced; production legacy graph |
| Sept quote repair | 1 | 2 | 2 | d52b284 | enforced |

## B. Truncation (1,697 answers with evidence)

| Era | Answers | With a truncated source | Golden primary section truncated in evidence |
|---|---|---|---|
| April advisory | 150 | 73 (48.7%) | 18 |
| June | 286 | 157 (54.9%) | 30 |
| July | 1,099 | 506 (46.0%) | 129 |
| Sept baseline / initial / final | 50 each | 21 / 20 / 21 | 6 / 6 / 6 |
| Sept production and quote repair | 12 | 7 | 0 |
| **All** | **1,697** | **805 (47.4%); 796 with the 6,000-character marker** | **195** |

Answers with at least one truncated source, by tool and document family (an answer counts once per cell):

| Tool | clinical policy | federal regulation | federal statute | managed-care contract | DHHS policy | bulletin | waiver | Any |
|---|---|---|---|---|---|---|---|---|
| Frame section, inline body (pre-September format) | 296 | 285 | 151 | 37 | 33 | 6 | 2 | 734 |
| getSection | 101 | 161 | 82 | 10 | 1 | 0 | 3 | 306 |
| Frame corpusSection (September format) | 9 | 10 | 9 | 2 | 1 | 0 | 1 | 24 |
| Any tool | 349 | 298 | 189 | 39 | 35 | 6 | 3 | 805 |

Same-question comparison, truncated minus not truncated (scored, not withheld):

| Strata | Mixed strata | Rows T / U | Completeness | Factual accuracy | Overall |
|---|---|---|---|---|---|
| Question + commit | 17 | 42 / 44 | +0.04 (p 0.47) | +0.04 (p 0.56) | +0.04 (p 0.67) |
| Question + era | 29 | 157 / 181 | 0.00 (p 1.0) | -0.05 (p 0.43) | -0.03 (p 0.70) |
| Question, all runs (confounded by commit) | 34 | 257 / 386 | -0.07 (p 0.07) | -0.11 (p 0.002) | -0.13 (p 0.002) |

Final gate: 20 of 50 answers carry the marker; mean overall 2.40 against 2.73 (briefed figures confirmed).

Golden primary sections: 66 distinct legacy ids; 6 longer than 6,000 characters; 51 read whole at least once; 9 never read (4 known short, 5 template sections of unknown length).

| Base question | Golden primary section | Length | Reference fact at | Verdict | Rows (mean overall) |
|---|---|---|---|---|---|
| 010 | 42 CFR 441.301; SSA 1915 (unsplit) | 26,744; 143,149 | (b)(3) to (b)(6) at 1,903 to 2,639; 1915(c)(1) inside the window | within | 53 (2.90) |
| 015 | 42 CFR 440.70 | 9,782 | (a)(1) 116, (a)(2) 199, (c) 4,017 | within | 48 (2.91) |
| 021 | 42 CFR 438.8 | 18,416 | (c) 2,385, (d) 2,742, (e) 3,087; (f) 7,619, (k) 15,412 | partly beyond | 49 (2.88) |
| 048 | 42 CFR 438.8 | 18,416 | (c) 85% at 2,385 | within | 48 (2.74) |
| 043 | Policy 8C revision table | 100,986 | last row; window ends at 01/01/2011 | beyond; reachable via getAmendments | 69 (1.99; June onward 2.6) |
| 045 | 42 CFR 441.301 | 26,744 | amendment history line at 26,552 | beyond; date also in Last revised metadata | 52 (1.82) |
| 046 | 42 CFR 441.301 / 441.302 | 26,744 / 20,028 | section identity only | within | 52 (2.39) |

Citing beyond the window: 298 CFR labels carry a paragraph pinpoint; 204 are on sections read truncated in the same answer; 0 name a paragraph starting past character 6,000. 1,214 sentences in 186 answers cite a truncated CFR section; 0 carry a number found only in the unseen tail; 3 sentences (2 answers) carry a six-word sequence found only there, both correct statements about the MLR denominator. SSA: 5 labels (h-049) cite § 1902(a)(43), which no stored window of § 1902 or § 1902(a) contains.

## C. Wrong document (2,178 rows with a recorded authoritative document)

| Era | Rows | Differs from every golden document |
|---|---|---|
| April (both) | 630 | 185 |
| June | 286 | 63 |
| July | 1,100 | 298 |
| Sept baseline / initial / final | 50 each | 11 / 11 / 11 |
| Sept production and quote repair | 12 | 7 |
| **All** | **2,178** | **586 (26.9%), 38 of 100 questions** |

| Class of mismatch | Rows | Questions | Factual accuracy of 1 or less |
|---|---|---|---|
| Synthetic revision row of the golden policy | 67 | 3 | 2 of 67 |
| Golden document is an unnumbered change notice | 49 | 2 | 0 of 48 |
| Authoritative is an unnumbered form, checklist or notice | 96 | 7 | 0 of 94 |
| Statute where the golden document is the regulation | 90 | 5 | 1 of 89 |
| Different CFR part | 77 | 8 | 14 of 76 |
| Federal document for a state-policy question | 46 | 3 | 0 of 46 |
| Different state policy | 151 | 13 | 18 of 151 |
| Other | 10 | 1 | 1 of 9 |

Low accuracy overall: 36 of 576 mismatch rows against 26 of 1,575 matching rows. By era for mismatch rows: April 31 of 181, June 5 of 63, July 0 of 296, September 0 of 36.

Patterns: prefix sibling as first document 0 rows. Frames listing a prefix-related pair among authoritative documents: 55 of 1,651 (1A-2 with 1A-27 in 31, with 1A-21 in 28, with 1A-20 in 3; 3L with 3L-1 in 21; 9 with 9A and 9B in 3). Digit-plus-letter tokens: 22 questions contain one and every one is a real policy number.

## D. Citation labels

Label shapes among 13,725 citations: `Policy X § n.n` 7,102; CFR 2,663 (2,268 with a section number); change notice 862; document title or other 830; `Policy X § <words>` 712; other Policy-prefixed 414; other § labels 409 (174 dotted); SSA or USC 291 (257 SSA sections); Attachment or Appendix 247; bare `Policy X` 129; MA manual § 66.

Labels flagged (answers), by rule and era:

| Era | Parsable labels | A literal | A | B | A + container children | + title numbers |
|---|---|---|---|---|---|---|
| April advisory | 688 | 21 (13) | 21 (13) | not evaluable | 21 (13) | 19 (13) |
| June | 1,312 | 33 (17) | 23 (16) | 12 (9) | 7 (7) | 6 (6) |
| July | 4,685 | 185 (76) | 105 (61) | 63 (39) | 55 (37) | 51 (34) |
| Sept baseline | 135 | 5 (2) | 2 (1) | 0 | 0 | 0 |
| Sept initial gate | 100 | 1 (1) | 1 (1) | 0 | 0 | 0 |
| Sept final gate | 150 | 3 (2) | 3 (2) | 2 (1) | 0 | 0 |
| Sept production candidate | 16 | 4 (1) | 0 | 0 | 0 | 0 |
| Sept quote repair | 5 | 5 (1) | 0 | 0 | 0 | 0 |
| **All** | **7,102** | **257 (113)** | **155 (94)** | **77 (49) of 6,414** | **83 (57)** | **76 (53)** |

Hand-check composition:

| Rule | Wrong pin | Unseen section, claim consistent | Verifier-authored | Noise |
|---|---|---|---|---|
| A literal | 21 | 14 | 26 | 196 |
| A | 21 | 14 | 26 | 94 |
| B | 21 | 8 | 21 | 27 |
| A + container children | 21 | 14 | 26 | 22 |
| + title numbers | 21 | 14 | 26 | 15 |

Enforced runs (90 released answers): released answers that would newly fail: A literal 5, A 3, B 1, container variants 0; all noise.

Shapes neither parser covers (extended check: cited section must be a content-bearing source):

| Shape | Labels | Flagged (answers) | Hand check |
|---|---|---|---|
| CFR section | 2,268 | 27 (12) | 2 wrong (430.16 given as 60-day; a 90-day deemed-approval rule pinned to 441.304), 24 consistent with the cited section, 1 verifier-authored |
| SSA section | 257 | 34 (13) | 12 where the retrieved parent held the text, 21 unseen but correct law, 1 verifier-authored |
| Attachment or Appendix | 247 | 161 (44) | scanned only; appendix sections carry no section field |
| Dotted, not starting with "Policy" | 174 | 3 (3) | 2 verifier-authored, 1 unseen |

## E. Web footnotes (emulated; June to September, 12,359 citations in 1,547 answers)

| Label kind | Citations | Exact row | Ancestor row | Document row | Same section via URL | Wrong section row | Arbitrary section row |
|---|---|---|---|---|---|---|---|
| Policy § | 6,414 | 6,171 | 57 | 3 | 25 | 158 | 0 |
| CFR | 1,968 | 0 | 0 | 0 | 929 | 1,036 | 0 |
| SSA | 249 | 0 | 0 | 2 | 99 | 148 | 0 |
| Other dotted | 493 | 0 | 0 | 0 | 190 | 303 | 0 |
| Attachment or Appendix | 277 | 0 | 0 | 21 | 0 | 256 | 0 |
| Names no section | 2,958 | 304 | 0 | 940 | 0 | 0 | 1,714 |
| **All** | **12,359** | 6,475 | 57 | 966 | 1,243 | **1,901 (525 answers)** | **1,714 (775 answers)** |

Final gate: 39 wrong-section footnotes of 274, in 11 of 50 answers (CFR 26 of 45, Appendix 8 of 9, SSA 3 of 3, Policy § 2 of 150). April rows are excluded: their evidence stored no section URLs.

## F. Authority of evidence (1,697 answers; 1,680 delivered)

- Proposal or public-notice body in evidence: 35 (June 7, July 25, one in each September local run). Listed as an authoritative document: 37. Cited by the answer: 1, as a caution.
- First authoritative document is a synthetic change-notice row: 63. Frame lists at least one synthetic row: 408. getAmendments authority is synthetic: 715 of 1,577; same-date sibling present in 455 of 727 such results.
- Fee-schedule sources: 0.
- Frame with a content-less primary section: 75; content-less supporting: 73; either: 118. September local runs: 9 of 50 each. July 66 of 1,099; June 16 of 286; April 6 of 150.
- Delivered answers with no section body in evidence: 0 of 1,680. Answers written from frame bodies alone, with no getSection read: 549.

## G. Routes (2,178 rows)

- Recorded route differs from the commit's own router: 672 (30.9%). April 154 of 630; June 91 of 286; July 395 of 1,100; September 32 of 162.
- Same-commit groups with two or more runs: 331; flips: 20; with both arms: 15 (44 against 40 rows); diverging minus agreeing overall -0.04 (3 lower, 2 higher, 10 equal).
- Always-diverging questions (20): h-005, h-023, h-024, h-026, h-029, h-030, h-034, h-035, h-037, h-038, h-042, h-047, q-012, q-016, q-024, q-025, q-035, q-042, q-045, q-047.
- Diverging rows by change: general to coverage 430; amendment history to federal 49; general to amendment history 44; latest revision to federal 42; coverage to general 34; general to policy variant 28; other 37.

## H. Identifier screen

| Scope | Answers | Trip the screen | Rule |
|---|---|---|---|
| All files | 2,702 | 19 | member_id only |
| Unique | 2,434 | 15 (April 1, June 4, July 10, September 0) | member_id only |
| Questions asked | 100 | 0 | |
| Current golden questions and reference answers | 55 | 0 | |

## I. Verifier against judge, from stored telemetry (context only)

Advisory gpt-5.4-mini runs: 202 delivered answers judged bad (factual accuracy or hallucination of 1 or less); the verifier raised nothing on 53 (26%). Final gate: 4 of 48 released answers judged hallucination 1, all first-pass passes. The judge scored the rewritten text in advisory runs, so these are not clean miss rates.

## J. Scripts

All in the scratch directory `…/review/gaps/critic-stored-run-incidence`: `lib.mjs` (loader, de-duplication, per-commit golden data), `s0` denominators, `s1*` truncation, `cfr_text.py` (standalone copy of the eCFR text assembly), `s2*` wrong document, `s3*` citation rules, hand check and web emulation, `s4*` authority, `s5` routes, `s6*` identifier screen, `s7` and `s8` replay inventory. Outputs are the `out_*.json` files; `results_key_numbers.json` holds the headline counts.
