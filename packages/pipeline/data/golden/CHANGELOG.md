# Golden Dataset Changelog

## v1.0 — 2026-03-26

- Initial seed with 8 entries based on real clinical policies in the graph
- Covers: 2 simple lookup, 3 moderate multi-hop/single-lookup, 1 complex cross-document, 1 negative (edge case)
- All section IDs verified against the live Neo4j graph (758 documents, 13,490 sections)
- Policies covered: 3K-2 (CAP/DA), 5B (Orthotics & Prosthetics), 3L (Personal Care Services), 8C (Outpatient Behavioral Health), 10A (Outpatient Therapy)
- These are synthetic entries for framework validation; Jeff will replace/expand with real entries

## v2.1 — 2026-06-12

- Added `heldout-paraphrase.json`: 50 held-out paraphrases (h-001…h-050), one per
  golden question, same answers/evidence, reworded questions (varied persona and
  surface form, policy scoping preserved where it determines the answer)
- Purpose: honest re-baseline after the 2026-06-11 de-contamination — the old
  2.45 baseline partly measured retrieval code that contained golden-answer
  text, so scores on the original phrasings are not comparable
- Schema: ids now `^(q|h)-\d+$`; `source` gains `held_out_paraphrase`;
  optional `paraphrase_of` provenance field
- Run with: `python -m pipeline.cli eval --level answer --dataset data/golden/heldout-paraphrase.json`

## v3.0 — 2026-10-05

Review EVAL-1. The version is in `dataset-version.json` and covers both files in this
directory. Every run records it as `config.dataset_version`, and `eval-compare` refuses
runs on different versions. **`benchmarkHash` changed: no earlier score, baseline or
frozen identity catalog is comparable with this version.**

- Every entry has a `status`. `validated` means each fact the answer asserts is backed
  by a verbatim `supporting_quotes` span from a section the entry cites; scoring
  criteria that state no corpus fact (what a safe answer must or must not do) are
  allowed beside them. Anything else is `needs_validation` with a one-line
  `validation_note`. Quotes were found by hand in the parsed corpus and the eCFR cache
  on 2026-10-05 and are compared after whitespace is collapsed, nothing else. No answer
  key was reworded to fit its quotes.
- 8 of 56 entries are validated: q-004, q-005, q-011, q-012, q-013, q-014, q-025 and
  q-056. The other 48 wait for attorney review. Evaluations at every level
  score validated entries only and report how many they skipped.
- q-042, q-044 and q-045: the instructions to the agent moved from `answer.text` to
  `expected_behavior`, which is never sent to the judge. q-044 has no factual answer
  yet. All three stay `needs_validation`.
- q-033, version 2 (review SAFE-1): a time limit for requesting the hearing must be a
  North Carolina limit from a North Carolina source, or the federal figure stated as
  the federal maximum with the person told to check the deadline printed on their
  notice and confirm it promptly. The 2026-09-22 release answer gave the federal
  90-day ceiling as the only limit under an NC Medicaid Direct heading and the old key
  could not see it. Still `needs_validation`: its other claims are not in 42 CFR
  431.220.
- Added q-056 (review SAFE-1): county eligibility notice, 60 calendar days to request a
  hearing, 90 with good cause, quoted from MA-2420 with MA-3430 as support. Its section
  ids come from the current loader over the local parsed manuals and have not been
  checked against a live graph. It has no paraphrase.
- `heldout-paraphrase.json` rows now hold the reworded question only and take `answer`,
  `evidence`, `status` and quotes from their `paraphrase_of` parent when loaded, so the
  two files cannot diverge. This also retires the paraphrase file's pre-migration
  section ids.
- `eval-validate-golden --catalog <identity catalog>` checks every quote against frozen
  section text without a graph, and fails when a section is missing, empty or does not
  contain the quote. Evaluation runs make the same check when `EVAL_IDENTITY_CATALOG`
  is set.
- Follow-ups this version forces: the release policy's withheld-answer cap was set for
  55 questions and must be re-set for the validated count; the release baseline and the
  identity catalog must be rebuilt; the Jev routing benchmark now has 156 inputs (every
  golden question plus 100 paraphrases), so a frozen `routing-inputs.json` no longer
  matches.
