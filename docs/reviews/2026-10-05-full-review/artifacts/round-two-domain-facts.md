# Working artifact from the round-two domain-facts review

I listed every North Carolina Medicaid fact hard-coded in the system prompt, the planner, the scope policy, the routing term lists, the answer-frame code and the concept seed (about 110 rows in the appendix). Each was checked against the local graph (July 2026 build), live eCFR and NC DHHS pages, the saved 2026-09-22 release answers, and read-only probes of the real frame resolver with embeddings disabled.

Most facts hold: the aliases for CAP/DA, CAP/C, 10A, 8C, 15 and MA-2180; the EPSDT, state-plan-amendment and medical-loss-ratio citations; both MAGI tables and their April 1 dates; the September 2024 COVID bulletin wording; the English DHB-5097; and the section numbers and quoted conditions for Policies 9, 10A, 15 and 3L-1.

Seven do not. Over-the-counter questions are pinned to Policy 9 and its exclusion list, so Policy 9A never enters the frame. The abbreviation 'ach' matches inside 'each' and forces the congregate personal-care policy. Territory-only 42 CFR Part 436 and Medicare parts rank level with the applicable Medicaid rules. Waiver scoring favours the age-65 waiver subpart over the 1915(c) sections. A '60-day review cycle' label appears in released answers to unrelated questions. The HCWD lane can serve a superseded premium chart. The concept seed mislabels plan of care.

Known expiry dates: 2027-01-01 (MAGI window, already reported) and about 2027-04-01 (next MAGI table and HCWD chart).

## A. How each fact was checked

Basis codes: **G** = local Neo4j graph, read-only (older build: legacy ids, last indexed July 2026; numbers describe that build). **W** = official page fetched live on 2026-10-05 (ecfr.gov "up to date as of 10/01/2026", medicaid.ncdhhs.gov, policies.ncdhhs.gov). **P** = throwaway read-only probe that calls the real `createNeo4jPolicyCorpus` and `AnswerFramePlanningProcessor` with `embedQuery => []` (the library's own lexical-degraded mode; no Voyage, OpenAI or TypeSafe call). **R** = answers saved in `packages/pipeline/data/eval-results/milestones/2026-09-22-verified-release/` (hybrid retrieval, production models). **C** = code reading. Round-one ids are given where a row is already covered there.

Probe scripts and outputs: `<review scratch directory, not kept>/gaps/domain-facts/` (`probe.mts`, `probe-search.mts`, `probe-*.txt`).

## B. Embedded domain facts

### packages/agent/src/prompt.ts

| Line | Fact as written | Verdict |
|---|---|---|
| 5, 99 | Examples `[Policy 8C § 3.2.1]`, `[42 CFR § 441.301]` | Correct. Both exist (G). |
| 13 | `lastRevised` example `2024-05-10`; FR cite `46 FR 48541, Oct. 1, 1981 ... 89 FR 40863, May 10, 2024` | Correct. Matches the stored source note of § 441.301 (G). |
| 19 | Policies carry an "EPSDT / under-21 special-provision section" | Correct for the clinical-policy template: 174 of 177 policies have § 2.2.1 with that heading (G). Evidence-gated. |
| 21 | "scope/description section (typically 2.1.x)" and "general not-covered section (typically 4.1)" | Wrong label: 2.1.1 is the generic eligibility provision; the description is § 1.0. Covered by rag-design-06. |
| 22 | Personal cases: "route them to local DSS or qualified legal/benefits help" | Partial. County DSS decides eligibility; not checked against an official page for service denials (plan appeal, OAH). Low confidence. |
| 56, 102 | Example `[SSA § 1902(a)(10)]` | Correct. Node 1902(a) exists (G). |
| 62 | Graph holds "DHHS policies, clinical policies, federal regulations, and change notices" | Partial. The graph has 13 document types; Title XIX is `federal_statute` (G). Covered by agent-processors-tools-11. |
| 80 | lookupPolicy examples `"8C", "1A-1"` | `1A-1` does not exist: the physician series starts at 1A-2 (G, W). Prefix lookup returns eight policies, 1A-11 to 1A-19. Low impact. |
| 83 | dhhs_policy = "MA-series manual sections" | Partial. 168 of 1,237 dhhs_policy documents carry an MA- number; 203 are DHB/DMA/DSS forms; 866 have no number (administrative letters, change notices, income tables) (G). |
| 85 | federal_regulation = "42 CFR and other federal rules that NC policies implement" | Partial. 29% of loaded federal-regulation sections are Medicaid parts; the rest are Medicare, Title 45, PACE and provider standards, CHIP and Part 436 (G). See finding 3. |
| 86 | change_notice = "Amendments and revision notices" | Misleading. All 4,267 change_notice documents have zero sections; real change-notice text is typed dhhs_policy (G). Covered by neo4j-live-11. |
| 87 | beneficiary_guidance family | Not present in the local graph. Covered by corpus-retrieval-01. |

### packages/agent/src/processors/answer-frame-planning.ts

| Line | Fact as written | Verdict |
|---|---|---|
| 143-152, 176 | Speech-language, audiology and telehealth-table vocabulary | Policy 10A vocabulary. Covered by agent-processors-tools-07. |
| 184 | '18 years of age', 'adult with disabilities', 'risk of institutionalization' | CAP/DA text: 'adult with disabilities' occurs only in 3K-2; 'risk of institutionalization' only in 3K-1 and 3K-2 (G). Fitting covered by architecture-01. |
| 186-193 | Six telehealth condition phrases | Correct: verbatim from 10A "e. Telehealth" (also in 10B, 10C, 10D) (G). |
| 268 | "then the CAP/DA- or service-specific criteria from § 3.2.1" | Names CAP/DA for every policy. Rendered for a hospice question (frame on 8A) and a private-duty-nursing question (3G-1, where § 3.2.1 is "None Apply.") (P). Extends agent-processors-tools-07. |
| 307 | Telehealth must be medically necessary, adjunct to in-person care, not for therapist convenience or productivity | Correct for 10A (G); fires when any one of six phrases is present. The saved q-019 answer is accurate (R). |
| 314 | "the ordinary speech-language therapy criteria still apply" | True only for 10A. Rendered for an outpatient-psychotherapy question framed on 8C (P): live-frame confirmation of agent-processors-tools-07. |
| 324 | "selected speech-language services may be eligible" | True only for 10A. |
| 373 | Air-ambulance sections explain "the narrow situations where air ambulance remains covered" | Partial. § 3.2.1.1 lists covered situations, but the phrase match also catches § 4.2.1.3 (air ambulance to a non-acute facility is not covered) and § 1.0 (G). |
| 378 | Congregate PCS: beneficiary and facility criteria, PCS scope, room-and-board exclusion | Correct for 3L-1 (§ 3.2.1, § 3.3, § 4.2.1.2) (G). In 3L the room-and-board text is § 4.2.2. |
| 393-400 | Premium terms; "current monthly dollar amounts"; "say the premium structure is verified" | HCWD premiums are monthly and the enrollment fee is $50 per year (G). The sentence scripts a verification claim. |
| 421-426, 467 | "Attachment K / the pharmacy prior-approval criteria contains the detailed list" | Correct for Policy 9 amended July 15, 2024 (G; amended date confirmed W). The live listing sends readers to the Pharmacy Portal for current criteria (W). |
| 522 | '431.408' is the public-notice section for waiver applications | Partial. § 431.408 is in Part 431 Subpart G "Section 1115 Demonstrations"; the 1915(c) public-input rule is § 441.304(f) (W, G). See finding 4. |
| 530-538 | 'ordering practitioner requirements', 'written plan of care', '60-day review cycle' | True only for § 440.70(a)(2) services. See finding 5. |
| 575 | Showings "such as level of care, target group, services, safeguards, or supporting documentation" | Correct topics of §§ 441.301 to 441.303 (G). |
| 592 | MLR: unconditional calculate-and-report duty versus conditional minimum | Correct: § 438.8 contains "calculate and report", "If a State elects" and "85 percent" (G). |
| 600 | Place-of-residence rule | Correct and evidence-gated (§ 440.70) (G). |

### coverage-boundary.ts and scope-gate.ts

| Line | Fact | Verdict |
|---|---|---|
| coverage-boundary.ts:15 | `policy N`, `MA-NNNN`, `hcwd`, `cap/da`, `epsdt` mark a new subject | No factual claim. |
| scope-gate.ts:98 | Refusal text | No factual claim. |

### packages/policy-corpus/src/scope/policy.json and coverage.ts

| Line | Fact as written | Verdict |
|---|---|---|
| policy.json:16 | Gujarati DHB-5097 original unavailable | Consistent with the live DHB forms page: the GU row links only to a wrapper page (W). |
| policy.json:24, 32 | Two 2025 MAGI wrapper pages unavailable | The wrapper pages are listed as archived on the live site (W, search excerpt). Contents not checked. |
| policy.json:41, 75-76 | MA-3321-1.pdf, effective 2025-04-01, supported to 2026-03-31 | Correct. Text reads "Effective: APRIL 1, 2025" (G). |
| policy.json:45, 49 | MA-2300.pdf and ma-3200-1.pdf required | Present, both titled "APPLICATION" (G). Content not reviewed. |
| policy.json:53 | DHB-5097-_4.1.26-6.pdf is the English form | Correct: it is the file linked from the live DHB forms page (W). |
| policy.json:57 | DHB-5097-_1.5.26_SP.pdf is the Spanish form | In the graph (G); currency not verified. |
| policy.json:61, 79-80 | MA-3321-MAGI-Income-2.pdf, effective 2026-04-01 | Correct: "Effective: APRIL 1, 2026 ... REVISED 4/1/2026" (W). Not in the local graph. |
| policy.json:81 | supported_until 2026-12-31 | A review bound, not a legal date. Stale on 2027-01-01. Covered by corpus-frames-06. |
| policy.json:66-70 | Bulletin URL; "Over-the-Counter Tests for Home Use Coverage for COVID-19"; "ends Sept. 30, 2024" | Correct: both strings are on the live page (W). |
| policy.json:8 | Standing-order URL | Not verified. |
| coverage.ts:27-28 | A year-only request means that year's April table | Consistent with DHHS naming (the "2025" table is effective April 1, 2025) (G, W). |
| coverage.ts:64 | "medicaid expansion" plus income wording selects the MAGI table | Correct: the table has a "133% MXP-N" row (W). Over-broad matching covered by corpus-frames-07. |
| coverage.ts:69 | "the available April 2025 and April 2026 tables" | Correct today; the hard-coded text needs editing when a 2027 table is added. |
| coverage.ts:72 | "distinguish the listed percentage from the five-percent disregard" | Correct: the table has a "5% Disregard" row (W). |
| coverage.ts:83-87 | September 25, 2024 bulletin; change effective October 1, 2024 | Correct (W). Refusing undated questions is a documented decision (docs/operations/answer-coverage-scope.md). |
| coverage.ts:109, 111 | Regexes for "ends Sept. 30, 2024" and "effective ... April 1, YYYY" | Match the live wording (W). |

### packages/policy-corpus/src/internal/term-lists.ts

| Line | Fact as written | Verdict |
|---|---|---|
| 62-71 | '2.1.1', '1.0', 'description of the procedure, product, or service' | Correct template headings (G); 2.1.1 is not a scope section (rag-design-06). |
| 100-111 | '3.2.1', '3.3', '4.2.1.2' for congregate PCS | Correct for 3L-1 only (G). Covered by rag-design-03. |
| 198-234 | 'quantity and episodic drugs', 'attachment k', exception phrases | Correct for Policy 9 (§ 5.4.3, Attachment K, § 3.2.3) (G). |
| 295-302 | Avoid terms 'public notice', 'comment period', 'disallowance' mark procedural sections | Wrong in effect: the phrases occur inside §§ 441.301, 441.302 and 441.304 (G). See finding 4. |
| 303-315 | §§ 441.350 to 441.355 are waiver-application primary sections | Wrong for NC: Subpart H is the age-65-or-older waiver (W). See finding 4. |
| 373-382 | EPSDT special-provision heading phrases | Correct (G). |
| 389-393 | EPSDT, HCBS, MLR expansions | Correct (W, G). |
| 397 | 'ach' means adult care home | Correct abbreviation, matched as a substring. See finding 2. |
| 402-403 | In-home documents are titled 'state plan pcs', 'in-home' or 'in home' | Wrong: Policy 3L is titled "State Plan Personal Care Services (PCS)" (G, W). See finding 2. |
| 411-412 | 'skilled nursing' means a nursing-facility setting | Partial: it is also a home-health and private-duty-nursing service. No misroute observed (P). |
| 416-417 | Residential treatment | Correct (8D-2) (G). |

### packages/policy-corpus/src/internal/query-intent.ts and answer-routing.ts

| Line | Fact as written | Verdict |
|---|---|---|
| 215-221 | HCWD = "Health Coverage for Workers with Disabilities" | Correct (G, W). |
| 223-250, 487-488 | Outpatient pharmacy and OTC questions are governed by Policy 9 | Wrong for OTC: Policy 9A governs covered OTC products. See finding 1. |
| 339-340 | 1915(c) rules are "42 CFR Part 441 Subpart G (§§ 441.300–441.310)" | Stale: Subpart G now runs to § 441.313 (W, G). |
| 454-455 | CAP/DA is Policy 3K-2 | Correct (G, W). |
| 458-459 | CAP/C is Policy 3K-1 | Correct (G, W). |
| 462-463 | Outpatient therapy is Policy 10A | Correct as the umbrella policy; 10C (schools) and 10D (independent respiratory therapy) are separate; 10B is in the graph but not on the live listing (G, W). |
| 466-477 | Telehealth speech or audiology therapy is Policy 10A | Partial: 10A § 3.1.1 makes Policy 1H mandatory. Covered in part by corpus-retrieval-04. |
| 479-480 | Outpatient behavioral health is Policy 8C | Correct (G, W). |
| 483-484 | Ambulance (not NEMT) is Policy 15 | Correct (G, W). |
| 491-492 | HCWD is MA-2180 | Correct number, but it resolves to three "current" documents. See finding 6. |
| 505-513 | 'waiver' plus 'application' is a federal-authority question | True for the State's application only. Covered by corpus-frames-05. |
| answer-routing.ts | Lanes and hints | No domain facts. |

### packages/policy-corpus/src/frame/** and helpers it calls

| Line | Fact as written | Verdict |
|---|---|---|
| federal-authority.ts:199-205 | Graph ids 'SSA-TITLE-19', '42-CFR-441' | Correct (stored as "SSA-Title-19", compared upper-cased) (G). |
| federal-authority.ts:256-261 | § 440.345 is benchmark-benefit context for EPSDT | Correct: "EPSDT and other required benefits" (G). |
| federal-authority.ts:289-294; rebalance/federal-authority.ts:60 | § 431.408 is the waiver public-notice section | Partial: section 1115 demonstrations only (W). |
| rebalance/federal-authority.ts:65-70 | Subpart G is §§ 441.300 to 441.310; § 430.25 is a cross-reference | Range stale (now to .313); § 430.25 is "Waivers of State plan requirements" (G). |
| rebalance/federal-authority.ts:84-95 | State-plan-amendment rules are in 42 CFR Part 430 | Correct: §§ 430.12, 430.16, 430.20 (G). |
| rebalance/federal-authority.ts:97-112 | EPSDT rules are Subpart B, §§ 441.50 to 441.62; Subpart K is Community First Choice | Correct (W). |
| rebalance/federal-authority.ts:114-119 | § 438.8 MLR standards, § 438.74 oversight, § 438.510 QRS | Correct (G). |
| section-predicates.ts:49 | '3.2.3' is the drug-criteria exception section | Correct for Policy 9 only (G). |
| section-predicates.ts:168-171 | Subpart H is the 1915(d) age-65+ waiver, "which NC does not operate" | Correct description (W); contradicted by term-lists.ts:309-314 and gotchas.md:111. |
| section-predicates.ts:201-205, 211-213 | Numeric range and prefix tests for Subpart G | Both also accept § 441.30 "Optometric services"; the stated range omits §§ 441.311 to 441.313 (G, W). |
| focus-ranking.ts:50 | Part 436 is a base-Medicaid part | Wrong for NC: territories only (W). See finding 3. |
| coverage-sections/selection/anchors.ts:152 | '4.2.1.4' is "Other Non-covered Ambulance Services" | Correct for Policy 15 only (G). |
| coverage-sections/selection/groups.ts:86-88, 144-145, 180-206 | Template numbers and 3L-1 numbers | Correct for the template and 3L-1 (G). Fitting covered by rag-design-03. |
| coverage-sections/selection/scoring.ts:79; document-selection.ts:137 | 'MA-2180' is the HCWD document | Correct number; no recency key. See finding 6. |
| rebalance/prior-auth.ts:48, 63 | '5.1 prior authorization', '5.0 requirements for and limitations on coverage' | Correct template headings (G). |

### packages/pipeline/src/pipeline/concepts/seed.py

| Line | Concept and aliases | Verdict |
|---|---|---|
| 14-18 | CAP/DA, CAP/C, NC Innovations (1915(c)), TBI Waiver, PACE | Correct names (G, W). |
| 21-30 | PCS, PDN, Home Health, DME, Home Modifications, Assistive Technology, Respite, CLS | Correct names. |
| 33 | Prior Authorization: "prior approval", "PA", "pre-authorization" | Correct synonyms; "PA" collisions covered by corpus-retrieval-09. |
| 36 | Individual Support Plan: "ISP", "plan of care", "POC", "service plan" | Wrong: the ISP is the Innovations plan. Only 94 of 1,944 linked sections are in Policy 8P (G). See finding 7. |
| 37 | EPSDT: "Health Check" | Correct NC usage: the September 2024 bulletin still cites the Health Check Program Guide (W). |
| 38 | Fair Hearing: "appeal", "due process" | Acceptable. |
| 46 | HCWD names | Correct. |
| 47-49 | "Medicaid to the Aged/Blind/Disabled" | Variant wording: NC manuals more often say "Medicaid for the Aged" (10 against 2 dhhs_policy sections) (G). The aliases MAA, MAB and MAD carry the matching. |
| 51 | Spend-Down: "spenddown", "medically needy spend-down" | Missing the NC term: "deductible" appears in 867 dhhs_policy sections, a spend-down spelling in 63 (G). See finding 7. |
| 52 | Special Assistance: S-AA, S-AD | Correct. |
| 55-56 | LME-MCO; MCO = "Managed Care Organization" | Missing NC terms: "prepaid health plan" appears in 327 clinical-policy sections against 11 for "managed care organization"; "Tailored Plan" appears in 2,533 non-federal sections with no concept (G). |
| 57-58 | DHHS, CMS | Correct. |

## C. Facts that go stale on a known date

| Date | Item | What happens |
|---|---|---|
| 2027-01-01 | policy.json:81 `supported_until: 2026-12-31` | Undated MAGI income questions are refused although the April 2026 table is still the latest (corpus-frames-06). |
| About 2027-04-01 | Next MA-3321 table (the 2025 and 2026 tables are both effective April 1) | Needs a new `magi_tables` entry, source hash and review; the coverage.ts:69 notice names "April 2025 and April 2026". |
| Each April | MA-2180 premium chart (Change Notice 05-26: "The HWCD premium chart was effective April 1, 2026") | A new manual version appears at a new URL and the old one stays `current` in the graph (finding 6). |
| Next form revision (date unknown) | DHB-5097 URLs stamped `_4.1.26` and `_1.5.26_SP` | Hash-pinned required sources stop matching. |
| Stale since 2024 | "§§ 441.300–441.310" in query-intent.ts:340, section-predicates.ts:168 and 199-204, rebalance/federal-authority.ts:68 | Subpart G gained §§ 441.311 to 441.313 (last revised 2024-05-10 and 2024-06-27 in the graph). |
| Already wrong | prompt.ts:80 `"1A-1"`; gotchas.md:111 "newer parallel sections (441.351-441.355)" | No such policy; Subpart H is a different waiver authority. |

## D. Probe results referred to in the findings (embeddings disabled, local graph)

| Question | Result |
|---|---|
| Does NC Medicaid cover over-the-counter medications? | Authoritative: Policy 9 plus two synthetic Policy 9 revision rows. Primary § 1.0, § 4.1. Supporting § 4.0, § 4.2, § 4.2.1, § 4.2.2. No 9A section and no § 3.2.1. Same for the Claritin/Prilosec and nicotine-patch phrasings. |
| How many hours of personal care services ... each month for someone living in their own home? | Authoritative: 3L-1 only. Reason: "Preferred because the query asks about a congregate or facility-based setting." |
| ... a beneficiary who needs help reaching the bathroom? | Same: 3L-1 only, same reason. |
| Does NC Medicaid cover in-home personal care services for adults? | 3L-1 leads; all six sections are from 3L-1; no in-home preference applied. |
| Search: "federal definition of disability for Medicaid eligibility" | § 435.540 and § 436.540 tied at 1.075 (ranks 1 and 2); § 436.541 at rank 10. |
| Search (federal_regulation): "medically needy income standard federal regulation" | Five of the top ten are Part 436. |
| Search (federal_regulation): "What supporting documentation must a state include in a 1915(c) waiver application?" | 1 § 441.303; 2 § 441.353; 3 § 441.351; 4 § 441.464; 5 § 441.352; 8 § 441.301. § 441.302 is not in the top ten. |
| Golden q-045 wording (most recent revision to Part 441 for HCBS waiver applications) | Primary: § 441.355, § 441.351, § 441.353, § 441.303. |
| What supporting documentation and assurances must a state include ... for the Innovations waiver? | Primary § 441.301, § 441.303. Supporting § 441.570, § 441.352, § 441.464. No § 441.302. |
| What is the federal regulatory definition of disability for Medicaid eligibility? | Checklist: "Include the core conditions in that same section: written plan of care, 60-day review cycle." |
| Under the federal regulations, what is the state residence requirement ...? | Checklist: "Include the core conditions in that same section: 60-day review cycle." |
| Golden q-009 wording (HCWD earned income and premiums) | Primary "F.  Income" (April 2026 manual) and "I. Premiums" (February 2025 manual); the April 2026 "B.  Premiums" section is in supporting with no content. |
| Under what conditions can speech therapy be provided via telehealth? | Supporting includes 42 CFR § 410.32 (Medicare Part B); checklist: "Start with the governing coverage rule from § 410.32 Diagnostic x-ray tests ...". |
| Can outpatient behavioral health psychotherapy be provided via telehealth? | Frame on 8C; checklist: "... only to explain that the ordinary speech-language therapy criteria still apply". |
