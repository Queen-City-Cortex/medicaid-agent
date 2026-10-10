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

## v3.1 — 2026-10-06

Review EVAL-1b (issue #554): key repair. **`benchmarkHash` changed again; scores on 3.0
and 3.1 are not comparable**, and issue #188 must name the version that is frozen.

- 10 of 56 entries are validated. q-001 and q-016 join the eight from 3.0: their answer
  text is unchanged, and the facts the cited sections lacked were found in other sections
  of the same policy (the CAP/DA age rule and ADL requirement; the definition of
  terminally ill in Policy 3D section 1.1.4).
- 40 entries carry a **reworded** key: q-002, q-003, q-006 to q-010, q-015, q-017 to
  q-024, q-026 to q-041 and q-043 to q-050. Each new key asserts only what its cited
  sections say, has a verbatim `supporting_quotes` span for every fact, and cites the
  sections that hold the text instead of empty headings and the generic 2.1.1, 3.1 and
  4.1 template sections. They stay `needs_validation`: a reworded key is a statement of
  what Medicaid policy says, so the owner or an attorney approves the wording before it
  is scored. `validation_note` lists what changed; `key-review-3.1.md` (replaced in 3.2 by `key-review-3.2.md`) pairs each
  claim with the text it rests on, for the owner's review. Approving a key is a change of `status` and
  a version bump.
- Where a policy never mentions the thing asked about (chiropractic care in 5B,
  acupuncture in 8C, massage in 10A, gym fees in 1A-2, whitening in 4A), the key now
  says the policy does not address it and rests on the policy's own scope and
  exclusions.
- q-028 and q-029 state the under-21 EPSDT provision as a caveat, quoted with its
  limits. q-026 to q-032 no longer call section 2.1.1 the scope section; scope is
  section 1.0.
- q-032 and q-040 rest on Policy 9 alone. Policy 9A (Over-The-Counter Products) holds
  the criteria, but its parse is flagged `parse_exception` and it does not load, so it
  is not cited.
- q-042 cannot be validated as the corpus is parsed: the MA-3550 revision marker exists
  only as the title of an empty section, and quotes are checked against section bodies.
- q-051 to q-055 are unchanged: their beneficiary-guidance pages are not in the local
  parsed corpus.
- Method: every quote was found in the local parsed corpus and the eCFR cache through an
  offline index, with no model-written quote accepted unchecked; each proposal was read
  against the corpus by a second, independent pass, and three that it found defective
  (q-021, q-033, q-049) were corrected. Social Security Act text is not in the local
  corpus, so no key rests on statute text alone.

## v3.2 — 2026-10-07

Review EVAL-1b (issue #554): approvals. **`benchmarkHash` changed; scores on 3.1 and 3.2
are not comparable**, and issue #188 must name the version that is frozen.

- 44 of 56 entries are validated. 34 of the keys reworded in 3.1 join the ten: q-002,
  q-003, q-006, q-007, q-009, q-010, q-015, q-017 to q-020, q-022 to q-024, q-026 to
  q-028, q-030 to q-032, q-034 to q-041, q-043, q-044, q-046 to q-048 and q-050.
- Approval rule, by the owner's decision of 2026-10-07: the owner is not a lawyer and
  has no access to one, so a reworded key is marked validated when a strict, independent
  read of its final text against the corpus returns no findings. 23 keys passed that
  read as they stood in 3.1. 14 had one small finding each (a dropped qualifier, a
  missing quote for a true claim, or a one-sided omission); each was fixed and read
  again, and 11 then passed. Their text differs from 3.1 by those fixes. The owner
  spot-checks a sample; `key-review-3.2.md` (replaced in 3.3 by `key-review-3.3.md`) pairs each claim with the text it rests on
  and puts a suggested sample first.
- q-008, q-029 and q-045 stay `needs_validation` with the open finding from that last
  read in `validation_note`. Their text carries the 3.2 fixes.
- q-021, q-033 and q-049 stay `needs_validation`: they depend on legal judgment (which
  contract amendment is operative; appeal routes and deadlines for agency and plan
  denials; the federal authority for EPSDT).
- q-042 and q-051 to q-055 are unchanged from 3.1.
- q-044 is the first of the three former instruction-only keys to be scored: its answer
  is quoted from the CAP/DA policy's revision table.

## v3.3 — 2026-10-07

Review EVAL-1b (issue #554). **`benchmarkHash` changed; scores on 3.2 and 3.3 are not
comparable.**

- 47 of 56 entries are validated. q-008, q-029 and q-045 join them: the open finding on
  each was fixed (an Appendix B caveat on transfers between case management entities; a
  section 4.1 quote for the not-covered conclusion; "Federal Register citation" for an
  entry the source note does not call an amendment) and each then passed a strict,
  independent read.
- q-038, version 4, from the owner's spot-check. The key said "community transition and
  community integration services do not cover room and board", which rested on reading
  "These services" in section 5.8.6 as both services; it may mean community integration
  services alone. The key now states what each service's own text says, and its first
  caveat names the two exceptions in 42 CFR 441.310 as having their own conditions and
  adds that Policy 3K-2's coordinated caregiving rate does not include room and board.
  It passed a strict read after two further corrections to that caveat.
- No other validated key has a pair that only sets context for another quote; quotes that
  open with a pronoun were checked for what they refer to.
- Still `needs_validation`: q-021, q-033 and q-049 (legal judgment), q-042 (revision
  marker is only a section title) and q-051 to q-055 (wait for the corpus release).

## v3.4 — 2026-10-09

Section ids re-pointed after the production corpus was re-crawled (issues #259, #554).
**`benchmarkHash` changed; scores on 3.3 and 3.4 are not comparable.** Still 47 of 56
validated.

- The first production measurement found golden section ids the built graph did not
  hold. Two causes: the agency republished MA-2420, MA-3430 and MA-3550 at new
  addresses (new document ids; the loader leaves the de-listed old copies out), and the
  production parse numbers unnumbered sections differently from the workstation copy
  the keys were quoted from. `eval-relocate-golden`, run on the production corpus,
  found each quote verbatim in the section now cited.
- Re-pointed with no change to answer text: q-007 (one section), q-019 (five), q-037
  (three; its definitions quote now comes from MA-2910, the only loadable manual that
  holds it), q-041 (one; the 45 C.F.R. § 74.53 sentence, now cited from Standard Plan
  Amendment 21/22) and q-056 (both).
- q-020, version 4: five sections re-pointed, and one clause removed. The key said the
  MA-2910 manual carries the header 'REVISED 03/16/2026 -CHANGE NO. 04-26'; no loadable
  section holds that text now. Nothing else in the key rested on it.
- q-033 (awaiting review): three sections re-pointed. Its Tailored Plan contract quotes
  and one of q-021's base-contract quotes were not found in any loadable document; both
  notes say so.
- These ids could not be checked against the workstation corpus, which holds the older
  copies. The check is the production trace, and `eval-relocate-golden` after the change.
- `key-review-3.3.md` still describes the keys; only q-020's removed clause was edited in it.

