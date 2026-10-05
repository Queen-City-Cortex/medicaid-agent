# Working artifact from the corpus-frames reviewer

## A. How a frame is built (as implemented)

| Step | Where | What happens |
|---|---|---|
| 0 | agent prefetch processor | Step 0 forces one resolveAnswerFrame call; the model types `query` and may add `questionType` |
| 1 | frame/service.ts:28-47 | Scope interceptor: refuse (notice) or return one dated document's sections as a `general` frame; pipelines skipped |
| 2 | internal/query-intent.ts:426-441 | Type = model hint if present (except exact EPSDT-overview phrases), else change notice, federal, prior auth, variant, coverage, general |
| 3 | internal/answer-routing.ts:37-104 | Lane, widening and hints from question text only |
| 4 | frame/pipelines/*.ts | 1-4 hybrid searches; routing documents = explicit or aliased policy numbers, else numbers inferred from hits and looked up again by prefix |
| 5 | coverage-sections/candidates.ts, pipelines | Candidates = document title-substring profile sections first, then hits; avoid = top leftover hits |
| 6 | frame/context/finalize.ts:72-107 | Hydrate first 4 primary, 4 supporting, 3 avoid positionally; strip avoid text; latestRevision; top 3 documents |
| 7 | frame/rebalance/*.ts | Re-score only the 11 or fewer hydrated sections (avoid included); apply family anchors |

| Type | Searches | Special logic |
|---|---|---|
| coverage | base plus focus-term search | 16 profile rules, 5-stage rebalance, anchors for yes/no, telehealth, eligibility, congregate PCS, ambulance, HCWD |
| prior_authorization | 1 | criteria vs process vs quantity; pharmacy special case |
| amendment | 1 | revision-header title heuristic, getAmendments, latest marker |
| federal_authority | 2-4 | waiver and MLR branches, CHIP tiebreak, statute pairing in three places, four rebalance hints |
| policy_variant | 0-1 | scope sections of preferred vs sibling documents |
| general | 1 | top hits re-ordered by term matches (33 lines) |

## B. Routing measurements

| Measure | Result |
|---|---|
| Router on 55 golden questions | coverage 29, general 11, federal 8, amendment 5, prior auth 2, variant 0 |
| Same type as golden original, 50 held-out paraphrases | 38 (76%) |
| Same type as golden original, 50 fresh paraphrases | 25 (50%); 31 fall to general |
| Negative-answer questions on the yes/no coverage path | golden 13 of 17; held-out 2 of 15; fresh 1 of 15 |
| Recorded route differs from router, commit 210ced2 (250 question-runs) | 99 (39.6%), 20 of 50 questions |
| Same, commits 8dcea40 and eb6bcde | 37.7% and 32.4% |
| Questions that flip pipeline between runs on one commit | 2, 6 and 4 |
| Frame tests forcing a type | 28 of 29; 17 inputs are verbatim golden questions, 2 verbatim held-out |

## C. Frame quality in saved runs (commit 210ced2, five full runs, held-out paraphrases)

| Measure | Result |
|---|---|
| Golden primary in frame primary (48 observable questions, 240 frames) | 35.0% |
| In supporting only / avoid only / absent | 7.5% / 0.8% / 56.7% |
| First primary section is golden | 18.3% |
| Questions never containing it in five runs | 27 of 48 |
| Plain search top 6 / top 10, same questions (June, b60efd7) | 39.6% / 50-52% |
| Score 3 of 3 when golden in primary / absent | 89% / 74% |
| Golden primary fetched by another tool when absent | 77 of 148 |
| Same question routed both ways: general vs specialised frame contains golden primary | 17 of 26 (65%) vs 14 of 34 (41%); mean score 2.96 vs 2.97 |
| Primary or supporting sections with avoid reason and no text | 15 across 250 frames (h-009, h-023, h-026, every run) |
| Avoid sections that matched no avoid term | 25 of 241 |

Caveats: labels are sparse, samples are small, the corpus is the July graph, and search and frame figures come from different commits.

## D. Probes at HEAD (scratch vitest, repo fixtures, no network)

| Probe | Outcome |
|---|---|
| "Does NC Medicaid cover 3D mammograms?" | Authoritative: 3D Hospice; primary: Hospice 2.1.1 and 4.1; mammography section in avoid, no text |
| Hits from 1A-2, lookup order [1A-27, 1A-2] | Authoritative: 1A-27 Electrodiagnostic Studies; 1A-2 sections in avoid, no text |
| Yes/no on template policy, top hit "5.8 Therapeutic Leave" | Primary: 1.0 and 4.1; 5.8 in supporting with content null and avoid reason |
| Waiver application, 441.304 body mentions public notice | 441.304 in primary with content null |
| Zero hits, four question types | Empty frames with unchanged lane and hints; plan says do not widen |
| Pregnant-women income limit "of the federal poverty level" | federal_authority; only 42 CFR 435.116; NC section absent |
| Hearing aids and eyeglasses | One policy only |
| Blank "4.1" section | Anchored as primary with empty text |
| Newest change notice for 8C plus unrelated notice hit | Marker = unrelated tribal-membership notice |
| Cost, 9-section document, yes/no coverage | 82 session queries, 2 embedding calls, 25 getSection calls for 9 sections |

## E. Hard-coded policy knowledge

| Topic | Where |
|---|---|
| Aliases to policy numbers (CAP/DA, CAP/C, outpatient therapy, telehealth speech, behavioral health, ambulance, pharmacy, HCWD) | internal/query-intent.ts:451-496 |
| HCWD | frame/context/routing.ts:61-98; internal/document-selection.ts:133-181; selection/scoring.ts:75-105; selection/initial-selection.ts:83-95; pipelines/coverage.ts:56-66 |
| CAP/DA eligibility (section numbers 2.1.1, 3.1, 3.2.1 and five body phrases) | selection/groups.ts:86-107 |
| Congregate PCS (3.2.1, 3.3, 4.2.1.2, 4.1, 4.2, 4.2.1) and setting terms | selection/groups.ts:175-229; internal/term-lists.ts:94-111 and :395-420 |
| Ambulance (4.2.1.4, air ambulance) | selection/anchors.ts:146-173 |
| Telehealth and Policy 10A tables | internal/term-lists.ts:122-143; internal/section-predicates.ts:113-119 |
| Pharmacy prior approval (Attachment K, 3.2.3, 5.1) | internal/term-lists.ts:198-234; internal/section-predicates.ts:48-51; rebalance/prior-auth.ts:48 and :63 |
| Federal (42-CFR-441, SSA-TITLE-19, 42-CFR-430, 441.50-62, waiver section numbers, MLR, CHIP part 457) | frame/federal-authority.ts:199-204 and :273-292; internal/term-lists.ts:273-337; rebalance/federal-authority.ts:84-112; internal/focus-ranking.ts:50-58 |
| EPSDT overview exact phrases | internal/query-intent.ts:359-361 |
| MAGI, DHB-5097, Gujarati form, COVID tests | scope/policy.json; scope/coverage.ts |
| Agent-side copies | packages/agent/src/processors/answer-frame-planning.ts:132-197, :414-439, :499-526 |

## F. Order dependence

- Router precedence (change notice before federal before prior auth).
- Profile rule order in candidates.ts, with first-wins de-duplication.
- Concatenation order of candidate lists, then positional hydration of the first 4/4/3 before any scoring.
- First matching federal hint wins; fixed precedence in the coverage primary ternary.
- Stable-sort ties fall back to hit order and to Neo4j's unordered section listing.
- Lookup result order decides the inferred document.

## G. Scope ownership and staleness

policy.json names a review document but no owner or schedule. It holds exact URLs, content hashes, two dated table windows and eight acceptance case ids. It goes stale in three ways: the calendar window ends (2026-12-31); a source is re-posted, changing a hash or URL, which invalidates approvals by design; or a new table is published and must be added by hand. Only the second is detected automatically.

## H. Jev section roles

- Flag: JEV_SECTION_ROLES_ENABLED is read at call time in six places in policy-corpus.
- Allowlist: JEV_SECTION_ROLE_ALLOWLIST is parsed per call and validated at agent startup; an unknown role throws.
- Fallbacks: a missing, stale or unstamped label gives no roles and a bonus of 0; disabled behaviour is identical to before.
- Effect: +1 on coverage primary and support scores over the 11 or fewer hydrated sections; in prior auth, reordering within a same-document group against 0.25 positional steps.
- Evidence of benefit: none yet. The readiness record says no frame or answer improvement has been shown and 232 of 71,695 sections are labelled.
- Assessment: safe by default, but it adds a small bonus to a pipeline whose candidate lists are cut before scoring. Role tags would be more useful as ingest-time structure in a simpler frame.
