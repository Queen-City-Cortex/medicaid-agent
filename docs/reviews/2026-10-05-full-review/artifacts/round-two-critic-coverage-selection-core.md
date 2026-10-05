# Working artifact from the round-two critic-coverage-selection-core review

I read the coverage-section selection modules, all six pipelines, the three rebalancers, the frame context, the term lists and predicates, the planner, the prompt and the verifier prompt. I then tested them three ways: (1) the repo's own predicates over 13,228 sections rebuilt from the 177 locally parsed clinical policies; (2) the real pipelines run in memory over those sections with supplied hits; (3) the frames recorded in 178 saved eval files (145 yes/no coverage frames, 16 distinct questions, live graph).

The pair dispute is settled: neither round-one position describes the code. Recorded frames lead with section 4.1 (138 of 145) plus a 'scope' section that is 1.0 for 9 of 16 questions, an exclusions container for 8C and EPSDT boilerplate for three Policy 9 / 1A-2 questions. Section 2.1.1 is primary for none. Two defects nobody reported: the EPSDT under-21 provision usually does not reach adult yes/no frames, and both selection and the planner take a 129-character cross-reference banner for it; and the prior-authorisation and policy-variant pipelines fill frames with tied template headings.

What held up: 4.1 is chosen reliably (174 of 177 policies); the ambulance anchors match only Policy 15; the prior-auth process demotion is wrong for only 13 of 560 PA-titled sections; the amendment pipeline's inferred path resolves documents by id, not by prefix lookup.

## A. Evidence bases

| Base | What it is | Where |
|---|---|---|
| Recorded | 178 saved eval files, 1,915 recorded resolveAnswerFrame blocks; 172 carry the yes/no hint, 145 of those are on clinical policies, 16 distinct questions. Live graph and Voyage retrieval, April to September 2026 | `saved_frames.py`, `saved_yesno.py`, `saved_epsdt.py` |
| Harness | The real pipelines, context, finalize, rebalance and planner run in memory over 13,228 sections rebuilt from the 177 locally parsed clinical policies (June 2026 parse). Hits supplied by each probe. Two section-listing orders | `build_sections.py`, `lib.mts` |
| Census | The repo's own predicates over the same sections, hydrated as getSection returns them | `census.mts`, `census.out` |

All files are in the scratch directory named in each finding's verified_by. The harness reproduces the recorded primary sections for 7 of 11 golden yes/no questions under each listing order, not the same seven (`r_saved_compare.out`).

## B. Question 2: substring predicates over the parsed corpus (13,228 sections, 177 policies)

| Predicate (file:line) | Matches | Intended | Wrong reason | Changes a frame? |
|---|---|---|---|---|
| Coverage scope group (groups.ts:136-158) | 1,834 | 349 numbered 1.0 or 2.1.1 | 1,458 body only ('scope' 635, 'description' 560, '2.1.1' 182, '1.0' 121); 15 number substring (3.2.1.x, 4.2.1.x, 7.2.1.x); 12 title | Yes. First primary for 5 of 16 recorded questions; 14-40 of 177 harness frames |
| EPSDT exception group (groups.ts:52-63) | 1,014 | 174 section 2.2.1 | 703 body mention (3.0, 4.0, 5.0, 7.0 banners in 168-172 policies each); 137 the 2.2 container | Yes. Banner injected into supporting in 131-147 of 177 harness frames; 91 of 145 recorded |
| General limitation anchor (anchors.ts:42-76) | 1,694 | 175 section 4.1 | 1,516 depth 2 or less with 'limitation' somewhere (4.2 ×177, 4.0 ×173, 5.0 ×173, 3.0 ×172, 7.0 ×172, 294 unnumbered) | Rarely: 4.1 sorts first and wins in 174 of 177. The rest matter only when 4.1 is missing |
| Specific limitation anchor (anchors.ts:77-109) | 869 | 521 numbered 4.x | 174 section 2.2.1 (heading contains 'Limitations'), 123 in 5.x, 32 in 3.x | Only for 'not covered' questions |
| isCoverageLimitationText (section-predicates.ts:60) | 2,390 | 993 contain 'not covered' | 1,350 match only 'limitation(s)', mostly the EPSDT cross-reference note | Bars these from primary for non-yes/no coverage questions (initial-selection.ts:51); 8C 5.3.1.4 was demoted to supporting in a probe |
| Yes/no admission (initial-selection.ts:68-70) | 3,992 of 12,187 with text | n/a | 'general' alone matches 1,627 | Filter is nearly inert |
| Eligibility anchors (groups.ts:77-96) | 722 | 530 numbered 2.1.1, 3.1, 3.2.1 | 20 body only | Eligibility questions only |
| Eligibility 'context' (groups.ts:98-111) | 462 in 176 policies | CAP/DA 1.0 | 'enrolled in the nc medicaid program' and 'service restrictions…' are 2.1.1 boilerplate (174 policies); 'adult with disabilities' matches 1 section in the corpus | No primary change (2.1.1 is already an anchor) |
| Eligibility limitation to avoid (groups.ts:117-122) | 2,390 | 869 in 4.x | 174 EPSDT 2.2.1, 208 in 3.x, 12 section 1.0 | Moves them to avoid for eligibility questions; not measured in frames |
| Congregate criteria / service / room-and-board (groups.ts:175-212) | 517 / 240 / 84 | 176 / 20 / 5 by number | 341 / 220 / 79 substring; inside 3L-1: 1 / 15 / 0 | Yes for q-005: recorded primary is 3.2.1 and 1.0; golden 3.3 is pushed to supporting |
| Ambulance specific / general (anchors.ts:146-173) | 1 / 176 | 1 / 175 | 0 / 1 | No |
| Prior-auth process (section-predicates.ts:44) | 233 in 54 policies | 4 by title | 'phone' in body 192 (149 are 'telephone'), 'fax' 43 | 13 of 560 PA-titled sections demoted, 11 by a body word |
| Prior-auth criteria (section-predicates.ts:40) | 7 in 3 policies | 2 in Policy 9 | 'attachment k' in other policies | Recorded: 2B-1 Attachment K 'Nursing Facility Quality Initiatives' labelled a criteria section (q-033) |
| Prior-auth exception, number 3.2.3 (section-predicates.ts:49) | 47 | 1 (Policy 9's 3.2.3) | 41 other policies' 3.2.3 ('Admission Criteria' ×8, 'Medicaid Additional Criteria Covered' ×7, 'Policy Guidelines' ×5, …) | Only with a pharmacy quantity question, which routes to Policy 9 |
| '5.1 prior authorization' (rebalance/prior-auth.ts:48, :63) | 1 title | Policy 9 | 176 policies title it '5.1 Prior Approval' | Phrase is keyed to one policy |
| Title profile, scope terms (candidates.ts:226-232) | 2-5 per policy | 1.0, 2.1.1 | 29 picks by number substring or stray 'description'/'scope' in a heading | Mislabels 10A 3.2.1.1 and 8C 4.2.1.1 as 'Scope or description section' |
| Title profile, variant terms (policy-variant.ts:39-44) | 4 per policy | description | 2.1.1 ×176, 2.2.1 ×173, 3.1 ×166, 4.1 ×138; 1.0 ×0 | Yes, every variant frame |

Note: the title profiles in candidates.ts match number and title only (section-views.ts:93). Body substrings apply in groups.ts, anchors.ts, scoring.ts, section-predicates.ts and the planner, over hydrated sections.

Template facts measured: 2.1.1 is titled 'General' in 176 of 177 and holds the enrolment sentence in 175; all 177 section 4.1 bodies hold the 'does not meet the eligibility requirements listed in Section 2.0' sentence (21 distinct bodies, at most 548 characters); 1.0 exists in 172, is blank in 18; 4.2.1 is 'None Apply' or blank in 38 of 168; 3.2.1 in 45 of 176.

## C. Question 5: where the pair is enforced

| Layer | Location | What it says |
|---|---|---|
| Route hint | internal/answer-routing.ts:38 | cite_scope_and_not_covered = coverage type and yes/no wording |
| Title profiles | candidates.ts:224-240; term-lists.ts:62-69 | scope terms include '2.1.1' and '1.0'; yes/no terms rank 4.1 highest |
| Hit promotion | pipelines/coverage.ts:208-219 | two limitation hits promoted when the hint is set (they sit after the profile sections, so they are not hydrated) |
| Scope group | selection/groups.ts:144-153 | number 1.0 or 2.1.1, or the substrings |
| Limitation anchor | selection/anchors.ts:53-55, :61-64, :141-145 | title 'general' or number 4.1 sorts first; a yes/no question gets one anchor, general before specific. The supportScore sort at :131 is a no-op (all scores are 0) |
| Primary limit | selection/initial-selection.ts:42-47 | 2 whenever focus terms exist, which is always ('cover' is one) |
| Assembly | selection/assembly.ts:187-196 | scope anchor, limitation anchor, then initial primaries, cut to the limit |
| System prompt | agent prompt.ts:12 (c), :20, :21 | 'typically 2.1.x' and 'typically 4.1' as 'the primary pair' |
| Planner | answer-frame-planning.ts:276-284, :714-716 | 'cite both the scope section … and the not-covered section …'; the scope label follows text ('epsdt' is in GENERAL_COVERAGE_PHRASES), not number |
| Verifier | verifier/verify.ts:66 | missing either citation is a 'minor' relevance issue, so it does not block release |
| Gotcha | docs/development/gotchas.md:114 | '(2.1.1) paired with the general not-covered section (4.1)' |
| Tests | frames-coverage.test.ts:294-296, :358, :386-387; coverage-rebalance.test.ts:27-28, :150-151; agent answer-frame-planning.test.ts:499-500 | fixtures title 2.1.1 'Description…' and give 4.1 a service-specific body |
| Golden keys | dataset.json q-026 to q-032, q-036 | 2.1.1 and/or 4.1 as primary evidence; q-026 note: 'Negative-answer template … scope (2.1.1) + not-covered (4.1) pair' |

## D. Question 5: the ten negative yes/no golden questions

Recorded = primary sections in the September final-gate frame; the first primary was the same in every recorded run of each question except q-036. Fix A = corpus-frames-03's fix; fix B = a structural reading of rag-design-06's; both prototyped on scratch copies and run in the harness (document order / reverse where they differ).

| Question | Policy | Golden primary | Section whose text answers | Recorded primary | Fix A primary | Fix B primary |
|---|---|---|---|---|---|---|
| q-026 chiropractic | 5B | 2.1.1, 4.1 | 1.0 (nothing names chiropractic) | 1.0, 4.1 | 1.0, 4.1, 3.2.1 | 1.0 |
| q-027 cosmetic bariatric | 1A-15 | 2.1.1, 4.1 | 4.2.1 ('solely cosmetic purposes is not covered') | 1.0, 4.1 | 1.0, 4.1, 4.2.1 | 1.0, 3.2.1 (keyword test chose 3.2.1 over 4.2.1) |
| q-028 acupuncture | 8C | 2.1.1, 4.1 | 1.0 | 4.2.1 container, 4.1 | 4.2.1, 4.1, 4.2.1.1 | 1.0 |
| q-029 massage | 10A | 2.1.1, 4.1 | 1.0 | 1.0, 4.1 | 1.0, 4.1, 4.2 or 4.2.1 | 1.0 |
| q-030 experimental drugs | 9 | 4.1 | 4.1 ('experimental, investigational') | 1.0, 4.1 | 1.0 or 2.2.1, 4.1, 4.2 | 1.0, 3.2.1 or 4.2.1 (keyword test missed 4.1) |
| q-031 gym membership | 1A-2 | 2.1.1, 4.1 | 1.0 | 2.2.1 EPSDT, 4.1 | 1.0, 4.1, 4.2 | 1.0, 4.2.2 (noise) |
| q-032 OTC fertility | 9 | 2.1.1, 4.1 | 4.2.1 ('OTC products', 'Fertility drugs'); 3.2.1 for the 9A exception | 2.2.1 EPSDT, 4.1 | 1.0 or 2.2.1, 4.1, 4.2 | 1.0, 4.2.1 |
| q-034 teeth whitening | 4A | 4.1 | 4.2.1 ('cosmetic procedures') | MA-3540: 'A. EPSDT for Recipients under 21', a revision header | 1.0, 4.1, 4.2.1 | 1.0, 4.2.1 |
| q-036 wellness telehealth | 1H | 2.1.1 | unnumbered Description; 3.2.1 | two unnumbered 1H headings | 1.1.1, Description, 4.1 | Description |
| q-038 room and board | 3K-2 | 4.1 | 5.8.6, 5.8.13 ('do not cover room and board') | 1.0, 4.1 | 1.0, 4.1, 4.2 | 1.0, 3.2.1 or 4.2.1 (noise) |

Reading: 2.1.1 answers none; 4.1 answers one. Fix A leaves the wrong scope section where it occurs and its third slot is often the 4.2 container. Fix B's structural half is right in all ten; its keyword half is unreliable. Neither puts 5.8.6 or 5.8.13 in front of the model for q-038 without hit pass-through.

## E. Question 4: the other pipelines

| Defect | coverage | prior-auth | amendment | policy-variant |
|---|---|---|---|---|
| Avoid list = top leftover hits, no match filter | yes (corpus-frames-03) | yes, prior-auth.ts:50-56; recorded q-014 | yes, amendment.ts:134-148 (same construction; empty when the question asks for latest or history) | no avoid list |
| Fallback label on unmatched hits | 'Primary coverage evidence.' | 'Primary prior-authorization criteria section.' | 'Revision header or amendment section.' and 'Older amendment context requested by the question.' on any hit (probe: 8C 3.2.1, 5.1, 4.1) | n/a |
| First-row prefix lookup (routing.ts:140) | yes when inferred (corpus-frames-02) | yes when no explicit number | no: documents come from getSection then getDocument by id (amendment.ts:55-66) | yes when no explicit number |
| All prefix siblings become routing documents | yes | yes; the title profile then fills from the first sibling | yes; getAmendments is called for each | scored, exact match wins |
| Hit candidates scoped to the resolved document | yes (h-012 fix) | no; recorded avoid entries from 3L, 3G-1 and non-policy documents | no; recorded q-043 primary is MA-3420's change notice for an 8C question, q-044 primary includes SSA 1915(f) and 3K-1 8.0 for a 3K-2 question (mechanism of corpus-frames-09) | n/a (no hit sections) |
| Title-term ties decided by listing order | yes | yes, median 11 tied | no title profile | yes |

The federal-authority pipeline builds its avoid list the same way, from leftover NC implementation hits (frame/federal-authority.ts:653-671).

## F. Question 3: selection keys that mirror golden labels

| Key in code | Location | Golden item it mirrors | Elsewhere in the corpus |
|---|---|---|---|
| Section numbers 2.1.1, 3.1, 3.2.1 as eligibility anchors | groups.ts:86-88, :242-244 | q-001 labels (primary 2.1.1, 3.1; supporting 3.2.1) | every policy |
| '18 years of age', 'adult with disabilities', 'risk of institutionalization' | groups.ts:102-104 | wording of 3K-2 section 1.0, the text behind q-001's answer | 'adult with disabilities' occurs in 1 section |
| 3.2.1, 3.3, 4.2.1.2 as congregate groups | groups.ts:180, :193, :206; term-lists.ts:100-111 | q-005 labels (primary 3.2.1, 3.3; supporting 4.2.1.2) | 3.3 exists in 20 policies with unrelated titles; 4.2.1.2 in 5 |
| 4.2.1.4, 'other non-covered ambulance services', 'air medical ambulance' | anchors.ts:151-152, :161 | q-017 labels (4.2.1.4; supporting 3.2.1.1) | only Policy 15 |
| 4.1 and title 'general' first | anchors.ts:53-64 | q-002, q-006, q-026 to q-038 labels | every policy |
| 3.2.3, 'attachment k', '5.1 prior authorization' | section-predicates.ts:49; term-lists.ts:212, :219; rebalance/prior-auth.ts:48, :63 | q-018 (Policy 9) | 3.2.3 in 42 policies; Attachment K in 2B-1 |
| policyNumber === 'MA-2180' bonus | scoring.ts:79 | q-009 | n/a |
| Title contains 'requesting ' | initial-selection.ts:60, :142; scoring.ts:89 | 5B 'Attachment E: Requesting Unlisted Orthotics…' (q-006, q-026) | n/a |
| 'speech -language therapy' (with the stray space) | term-lists.ts:83, :132 | a parse artifact of 10A heading 3.2.1.3 (q-004, q-019) | n/a |
| Yes/no starters 'will' and 'under' | query-intent.ts:287 | 0 golden questions start with 'will'; the held-out paraphrase set has 4 'Will…' and 4 'Under…' | h-002 ('Under … which DME items … exclude from coverage') is thereby treated as yes/no |

Round one's appendix E (scope corpus-frames) lists most of these by topic; the mapping to question ids and the corpus counts are new.

## G. Question 6: frames with a document and no section text

| Path | Condition | Plan text observed |
|---|---|---|
| Coverage | explicit or aliased policy number; search returns nothing; question enables no title profile | 'Answer directly from the current frame before widening further.' |
| Prior-auth | explicit number; search returns nothing; no title match | same, plus 'Name the governing source by policy number first: 5B.' |
| Amendment | explicit number; search returns nothing | 'Lead with the latest revision marker: <document title>.' and 'Do not widen beyond the current structured frame…' |
| Policy-variant | document has no heading with the six terms | 'Lead with the preferred policy variant: …' |
| Any | title-picked section hydrates to empty text (2.2.1 in 40 of 174 parsed policies, 1.0 in 16 of 172) | section listed under 'Cover first' or as supporting with no text |

## H. Question 1: reproductions

| Reproduction | Outcome | File |
|---|---|---|
| Golden q-026 wording, real 5B sections | primary 1.0, 4.1; supporting 4.0 banner, 4.2 container, 4.2.1, 4.2.2 'None Apply.'; 3.2.1 in avoid, content null; plan names § 4.0 as the EPSDT section | `r_epsdt_5b.out` |
| 223 oracle probes (best section is the top hit) | primary with text 1-3; any text 9-25; bare title 192-208 | `e1_oracle.json` |
| 'When is prior approval required … under Policy 1S-13?' | '5.1 Prior Approval' in avoid; plan: 'Do not lead with: § 1.0; § 5.1' | `r_pipelines.out` (P1) |
| 'Is prior approval required for orthotics under Policy 5B…?' | document order: 5.1 in avoid, content null; reverse order: 5.1 primary | `r_pipelines.out` (P2) |
| 'What is the difference between Policy 3L and Policy 3L-1…?' | eight boilerplate sections, no 1.0 | `r_pipelines.out` (V1) |
| 'What are the coverage requirements and visit limits … under Policy 8C?' (top hit '5.3.1.4 Additional Limitations') | barred from primary by initial-selection.ts:51, lands in supporting with text | `r_pipelines.out` (L1) |
