# Working artifact from the round-two critic-policy-number-bakeoff review

I ran the extraction and lookup rules side by side: pure functions over the 155 benchmark questions and 62 look-alike questions I wrote, read-only Cypher for all 674 stored numbers on the legacy local graph, and 310 real answer-frame replays in the product's own lexical-degraded mode (no embedding or model calls). Neither round-one patch is enough alone. Cue-only extraction removes the look-alike false positives but still misses "Policy 1-H" and "policy 9". Widened extraction fixes those but keeps every false positive and adds "3-D mammography". The exact-first ORDER BY from corpus-frames-02 crashes the pinned Neo4j 2026.05 and still returns prefix rows for stems. The hyphen-family rule needs a matchType filter at every caller, and no caller needs family rows. I recommend one combined patch (11 files, +216/-48, type-checks in a scratch copy). It returns the right policy first for 674 of 674 numbers, extracts nothing that resolves from the 62 look-alikes, loses no golden policy, and raises "first authoritative document is golden" from 92 to 98 of 150 replayed frames. What was fine: MA-2270 works under every rule, no rule depends on effective_date for the first row once matching is exact, and the "9" alias loses nothing. Database numbers describe the July 2026 local graph; hybrid retrieval and end-to-end answers were not run.

SCRATCHDIR = artifacts/policy-number-bakeoff. The patch is `SCRATCHDIR/combined.patch`; the patched source copy is `SCRATCHDIR/patched/src`. Repo HEAD c48a9d4, untouched.

## 0. Where each number comes from

| Source | What it supports |
|---|---|
| Pure functions at HEAD, no database | extraction per rule, question-type flips, rerank boosts, test-literal scan |
| Local Neo4j graph, legacy build (all `last_indexed` 2026-07-11, legacy ids, Neo4j 2026.05.0) | 674 stored numbers, every lookup count, the six misroutes, 55 shared numbers, 4,267 synthetic rows, every frame replay, the scoped-backend and tool A/B, every "resolves to a document" column |
| Saved runs in `packages/pipeline/data/eval-results/milestones/2026-09-22-verified-release/` (hybrid mode, same local graph) | q-031, q-043, q-044, q-034, q-037 frames and lookup evidence |
| Registry copy `packages/crawler/data/crawler.db` (last checked 2026-10-01) | 176 clinical numbers, identical to the graph's 176; 9 are a string prefix of another (11A-1, 1A-2, 1A-3, 1A-4, 1S-1, 3L, 8A, 8A-1, 9); only 3L and 8A have a hyphen-boundary family; SPA shapes |

The collision structure is therefore current. Which sibling wins under the current rule depends on the dates in the legacy build.

## 1. Extraction rules

Rules: HEAD; cue-only (corpus-frames-01); widened (corpus-retrieval-04: optional hyphen before the letter, numeric suffixes, numerals after a cue); combined (finding 1). The 62 look-alike questions are mine (imaging, staging, dosing, codes, everyday, cue traps); none names a policy.

| | HEAD | cue-only | widened | combined |
|---|---|---|---|---|
| Look-alikes with any token extracted | 49 | 3 | 56 | 2 |
| ... token is a stored number | 17 | 0 | 20 | 0 |
| ... resolves under current lookup | 27 | 1 | 29 | 0 |
| ... resolves under exact-first with prefix fallback | 27 | 1 | 29 | 0 |
| ... resolves under hyphen family | 27 | 1 | 30 | 0 |
| ... resolves under exact key | 17 | 0 | 20 | 0 |

Landing documents at HEAD: 3D -> Hospice; 3B -> PACE; 3A -> Home Health; 4B -> Orthodontic; 4A -> Dental; 1B -> Physician Administered Drug Program; 9A ("Apt 9A") -> Over-The-Counter Products; 6B -> Routine Eye Examination; by prefix only: 2A -> 2A-1 (+2), 2B -> 2B-2 (+1), 1A -> 25 policies, 8H ("8h shifts") -> six 1915(i) policies. Cue-only still emits "3D-PRINTED", "8A-5P" and "2B" after "number". Widened adds "3-D" -> 3D, "1095-B", "1099-R", and "policy 15 day limit" -> 15. Combined emits only "MA-2025" and "MA-2501" from two contrived questions; neither is a stored number (MA-2000 is the only year-like stored manual number).

Clinical numbers (176) recovered, HEAD / cue-only / widened / combined:

| Phrasing | Result |
|---|---|
| Policy N; CCP N; Clinical Coverage Policy No. N | 168 / 168 / 176 / 176 |
| the N policy | 168 / 134 / 173 / 173 |
| Under N, ... | 168 / 134 / 173 / 173 |
| N alone, no cue | 168 / 134 / 173 / 138 |
| Policy N with the letter hyphen flipped (1H <-> 1-H), n=173 | 5 / 5 / 173 / 173; the lookup reaches the policy 0 / 0 / 173 / 173 (needs the key) |
| MA-2180 as stored, n=251 | 251 for every rule |
| "MA 2180" or "MA2180", n=251 | 0 / 0 / 0 / 251 |

HEAD misses 1-I, 1-O-1/2/3/5, 7, 9, 15. Combined drops the 34 unsuffixed clinical numbers when there is no cue, by design. No rule extracts SPA, CFR, SSA or waiver numbers.

## 2. The 155 benchmark questions

HEAD emits a typed number in 33 questions and an alias in 47 (70 have either).

| Rule | Changed vs HEAD | Golden policy lost | Question-type flips |
|---|---|---|---|
| cue-only | 2: h-043 ("the 8C outpatient behavioral health policy"), j-007 ("Under 10A, ..."); the alias keeps both | 0 | 0 |
| widened | 6: gains 9 (q-032, h-032, j-032) and 1-H (q-036, h-036, j-036) | 0 | 0 |
| widened, both forms emitted | 21 | 0 | 18 to policy_variant (for example q-027, q-031, q-035, q-039, q-042) |
| combined | 7: the six gains, and h-043 loses the typed 8C (alias keeps it) | 0 | 0 |

Lookup level, HEAD extraction: the golden document is in the lookup set for 67 of 70 questions under every lookup rule (the other three are the HCWD questions, whose golden document has no number). First row is golden: 64 current, 67 otherwise. A non-golden policy is included for 11 questions under the current rule (1A-2 three times, the "9" alias eight times, which pulls 9A, 9B, 9D, 9E) and for 0 otherwise. The four pharmacy questions and their paraphrases have their golden evidence in Policy 9 itself.

## 3. Lookup rules over all 674 stored numbers

Each rule ran as real read-only Cypher; a simulator matched on 8 rules x 679 inputs with 0 mismatches.

| Rule | Different policy first | More than one policy | Nothing | Hit LIMIT 25 | Rows (synthetic) |
|---|---|---|---|---|---|
| current | 6 | 10 | 0 | 57 | 3,127 (2,279) |
| current, synthetic rows excluded | 6 | 10 | 0 | 0 | 848 |
| exact-first, exact-only rows (corpus-frames-02) | 0 | 0 | 0 | 54 | 3,071 (2,272) |
| same, synthetic rows excluded | 0 | 0 | 0 | 0 | 799 |
| hyphen family + matchType, excluded (corpus-retrieval-04) | 0 | 2 (3L, 8A) | 0 | 0 | 811 |
| hyphen family + matchType, kept | 0 | 1 (3L) | 0 | 54 | 3,072 |
| exact key only, excluded (combined) | 0 | 0 | 0 | 0 | 799 |

The six: 11A-1 -> 11A-10, 1A-2 -> 1A-27, 1A-3 -> 1A-33, 1A-4 -> 1A-40, 1S-1 -> 1S-11, 8A-1 -> 8A-12. With synthetic rows kept, 8A's family is cut entirely by LIMIT 25 (1 policy row, 24 revision rows, 0 family rows). The hyphen boundary is not a family boundary for short inputs: "1" -> 1-I and 1-O-1/2/3/5; "1-O" works and "1O" does not; "21" -> six bare SPA numbers; "42" and "MA" -> 25 truncated rows.

MA-2270: every rule returns the same three documents in the same order; row 0 is "MA-2270 LONG TERM CARE NEED AND BUDGETING". All three have null dates; title length decides. The documented behaviour holds as long as routing.ts:140 keeps taking row 0.

Tool path, real `corpus.lookupPolicy`, HEAD -> combined: "1-H", "1I", "1O-1", "Policy 3L", "CCP 8A-1", "Clinical Coverage Policy No. 1E-7", "policy 9", "MA 2180", "ma2180", "DHB-5125B", "SSA Title XIX": nothing -> the exact policy. "1A-2": 25 rows with 1A-27 first -> 1 row. Stems "1A", "8D", "2A", "MA": 25 rows -> nothing (intended).

## 4. Callers

| Caller | Needs family rows? | What changes |
|---|---|---|
| collectLookupDocuments (routing.ts:39-45; coverage, prior-auth, policy-variant, amendment) | No. It flattens every row into lookup documents, and more than one row triggers the variant frame | Benchmark: 1,060 rows, 925 synthetic -> 80 rows. Under hyphen family each pipeline would have to filter matchType or "1A" becomes 25 lookup documents. Exact-first keeps the synthetic rows and the stem fallback |
| collectImplementationLookupDocuments (routing.ts:47-54) | No | Same |
| collectPolicyDocumentsFromHits (routing.ts:140) | Never; it wants the hit's own document | 6 of 430 routing numbers give another policy today; 0 under any exact rule |
| Agent lookupPolicy tool and verifier evidence | No prompt relies on a family listing | Saved gate: 319 rows, 275 synthetic -> one row per clinical policy; cue words and hyphen variants resolve |
| policy_scoped backend (policy-scoped.ts:29, 57) | n/a, no lookup | Unaffected by lookup-only fixes. Key compare plus cue gating: "3D mammograms" 35 Hospice hits -> 0; "Policy 1-H" 0 -> 40 |
| Rerank boost (rerank.ts:251-259) | n/a | 22 false boosts on the look-alikes -> 0, including "age 9", "15 visit limit", "age 7"; 5 benchmark pairs change (1H three times and 9 gain, h-043's 8C keeps the alias boost only) |

## 5. effective_date

- Current rule: the winner among prefix siblings is decided by `effective_date DESC` in all six misroutes. The date fixes in pipeline-parse-graph-01 would change which sibling wins (11A-10's 2105-09-01 typo wins for 11A-1) but cannot remove collisions.
- Any exact rule: row 0 is independent of effective_date for all 674 numbers. 619 have one non-synthetic document. Of the 55 numbers shared by several documents (180 documents), none has a dated document: title length decides 50 and id decides 5. HEAD's loader dates only clinical policies and DHHS change notices, and DHHS change notices carry no policy number, so this is not a legacy-graph accident.
- With synthetic rows kept, rows 2 to 25 are ordered by the synthetic rows' dates with title length breaking ties. The saved q-001 frame shows "2025-09-01 (6.5.12e)" ahead of the same-date "(All sections and attachments)" row.
- The combined patch takes the newest revision from getAmendments (date, then id), so that one row depends on revision-table dates and will benefit from the row-date validation proposed in pipeline-parse-graph-01.

## 6. Frame replay, HEAD vs combined patch

155 benchmark questions, local graph, lexical-degraded mode (`embedQuery` returns [], the path `hybrid.ts:31` takes when Voyage fails). The replay is deterministic.

- Identical: 125. Only the tail of the authoritative list differs (synthetic rows or siblings removed): 17. First authoritative document differs: 7 (q-036 1M-5 -> 1H; q-044 and h-044 revision rows -> 3K-2; h-043 and j-043 revision rows -> 8C; j-032 42 CFR 435 -> Policy 9; q-051, out of corpus). Question type differs: 0.
- Of 150 questions with a golden document in this graph: first authoritative is golden 92 -> 98; any authoritative is golden 107 -> 113; a golden primary section in frame primary 50 -> 50; in primary or supporting 62 -> 61 (j-036: same document 1H, a different supporting section).
- Frames listing a synthetic revision row as authoritative 20 -> 5; frames with variant reasoning "Exact policy-number match from the query." 17 -> 0; lookup rows 1,069 -> 89.
- Probes at HEAD: 3D mammograms -> Hospice 1.0 and 4.1; stage 3b -> PACE; stage 4B -> Orthodontic; annual preventive assessment (no number) -> 1A-27; Assertive Community Treatment -> 8A-12; type 1A diabetes -> 25 lookup rows; 8h shifts -> 8H-3. Patched: 1A-2, 8A-1, 1A-34 Dialysis Services, 3G-1 Private Duty Nursing. For "3D mammograms" in lexical mode the patched frame is MA-3540 Medicaid Covered Services: no longer Hospice, not yet 1K-1; hybrid mode was not available.

## 7. The combined patch and the tests each reviewer asked for

Core of the patch:

```ts
// internal/policy-number.ts
export function policyNumberKey(value) { return (value ?? '').toUpperCase().replace(/[\s-]/g, ''); }
const CLINICAL = String.raw`\d{1,2}-?[A-Za-z](?:-\d{1,2})*`;          // 3L, 1-H, 8A-1, 1-O-1
const CLINICAL_SUFFIXED = String.raw`\d{1,2}-?[A-Za-z](?:-\d{1,2})+`;  // no cue needed
const CUE = String.raw`\b(?:polic(?:y|ies)|ccps?)(?:\s+(?:no\.?|numbers?))?\s*[(:#]?\s*`;
const MANUAL_RE = /(?<![\w-])(MA|DMA|DHB|DSS)[- ]?(\d{4})(?!\d)/gi;   // -> PREFIX-NNNN
// also: "under <clinical>", "<clinical> policy", and a join to a qualified number

// primitives/policy-lookup.ts
WHERE coalesce(d.document_type, '') <> 'change_notice'
  AND any(pn IN $pns WHERE key(d.policy_number) = key(pn))

// internal/rerank.ts
const mentioned = context.typedPolicyNumberKeys.has(key) ||
  (!isAmbiguousPolicyToken(hit.policyNumber) && queryMentionsPolicyNumber(context.queryLower, hit.policyNumber));

// internal/document-selection.ts
const topFamily = policyFamilyKey(documents[0]?.policyNumber);
const family = topFamily ? documents.filter((d) => policyFamilyKey(d.policyNumber) === topFamily) : [];
return family.length > 1 ? family : documents.slice(0, 1);
```

| Reviewer request | Status |
|---|---|
| frames-01: extract nothing from "3D mammogram", "stage 3b kidney disease", "stage 4B cancer", "2x daily", "90d supply", "policy on 3D mammograms" | Satisfied |
| frames-01: extract "policy 3D", "Clinical Coverage Policy No. 8C", "policy (5B)", "policies 8C and 8A", "1A-15", "MA-2180" | Satisfied |
| frames-01: held-out 8C question still yields 8C through the alias | Satisfied |
| frames-01: frame for "Does NC Medicaid cover 3D mammograms?" does not anchor on 3D | Satisfied in the replay |
| frames-01: no rerank boost for uncued bare tokens | Satisfied, and extended to numerals ("age 9") |
| frames-02: mocked session returns [1A-27, 1A-2] and only 1A-2 comes back | Not as written: exactness is in the query and there is no TypeScript filter. Replace with an assertion on the Cypher and an integration fixture; real lookupPolicy('1A-2') returns one row |
| frames-02: hits from 1A-2 give authoritativeDocuments[0] = 1A-2 | Satisfied in the replay; meaningful only against a real database |
| frames-02: the ORDER BY key | Rejected (finding 2) |
| frames-02 step 2: documentId on hits | Not included; unaffected |
| retrieval-04: replace the tests that pin 'MA' with a table of real numbers | Not adopted; the key is unchanged and the existing tests hold. Three narrowing tests added instead |
| retrieval-04: re-run q-036 and the pharmacy questions | Frame level, lexical mode: q-036 and paraphrases anchor on 1H; pharmacy frames keep Policy 9 first with the same sections. The paid hybrid eval is still to run |
| retrieval-04: candidatePolicyNumbers handles "Policy 8C", "MA 2180", "SSA Title XIX" | Satisfied |
| retrieval-04: matchType, alias split, both-forms emission | Not adopted |
| neo4j-live-11: relabel synthetic rows | Compatible; the lookup filter then becomes redundant, the amendment guard stays |

Existing expectations checked against the patched copy (54 spot checks, all pass): `query-analysis.test.ts` 3K-2 case; every `candidatePolicyNumbers` case; `policyFamilyKey('MA-2180') === 'MA'`; the three narrowing cases; the five `queryMentionsPolicyNumber` cases. The lookup matcher text `any(pn IN $pns WHERE` and `LIMIT 25` are kept.
