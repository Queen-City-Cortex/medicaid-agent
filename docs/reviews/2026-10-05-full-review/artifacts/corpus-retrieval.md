# Working artifact from the corpus-retrieval reviewer

## A. Retrieval as implemented

`searchSectionsDetailed` = `analyzeQuery` → `selectRetrievalProfile` → `embedQuery` → `collectHybridHitMap` → `finalizeHybridHits`.

- perGroupK = clamp(topK × 4, 25, 100); with explicit document types clamp(topK × 3, 15, 100).
- scanK = min(200, 8 × perGroupK), so it is 200 for every topK ≥ 7.
- Type groups: base = [clinical_policy] [dhhs_policy] [federal_regulation] [federal_statute] [bulletin, state_plan_amendment, waiver, provider_manual]; operational adds [fee_schedule] [billing_guidance] [managed_care_guidance, managed_care_contract]; federal = [federal_regulation] [federal_statute] [SPA, dhhs_policy, clinical_policy, waiver, provider_manual (+ managed_care_contract)].

| Stage | Backend | Type filter | Loops groups | Rows | Raw score | Tie-break | On error |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | section_vector | yes | yes | perGroupK from global top scanK | cosine (0–1) | none | propagates |
| 1 | chunk_vector | yes | yes | perGroupK chunk rows, no aggregation | chunk cosine | none | swallowed per group |
| 1 | concept | only if explicit types | no | 2 concepts, min(topK, 5) sections | constant 0.7 | content length | swallowed |
| 1 | section_keyword | yes | yes | perGroupK | 0.35 + 0.015 × Σ(3 title, 1 body, 2 doc title, 3 policy no.) | content length | swallowed per group |
| 1 | document_keyword | yes | yes | top 6 documents, perGroupK sections | 0.45 + 0.03 × doc + 0.015 × section | docs: date, id; sections: none | swallowed per group |
| 1 | policy_scoped | yes + policy number | yes | vector from top scanK; lexical perGroupK | cosine; 0.55 + 0.02 × section | content length | swallowed per group |
| 1 | amendment_context | amend or base type | yes | top 5 documents, perGroupK | 0.82 + 0.03 × doc + 0.04 × section | none | swallowed per group |
| 2 | fulltext | yes | yes | perGroupK, no index limit | BM25 discarded: +0.05 to known hits; new hits mid − 0.02 × position, floor 0.01 | – | whole stage returns [] |
| 3 | amendment-title expansion | none (title) | no | first 5 change-notice titles | 0.82 + 0.04 × section | content length | swallowed |
| 4 | document expansion | none (title) | no | top 8 titles by summed score | 0.58 + 0.02 × Σ(3 title, 1 body) | content length | swallowed |
| 5 | change-notice header expansion | none (title) | no | perGroupK | 1.04 + 0.06 × {2, 3, 4} | date, score, id | swallowed |

Finalize: 20 additive scorers → stable sort by score → slice(0, topK).

## B. Routing probes (real `analyzeQuery` / `selectRetrievalProfile`)

| Query | Result | Trigger |
| --- | --- | --- |
| What is the income limit as a percentage of the federal poverty level for pregnant women? | federal_authority, federal_hybrid, 3 groups | `'federal'` substring |
| Does Medicaid cover services at a federally qualified health center? | federal_authority | `'federal'` substring |
| What information must be documented for personal care services? | operational_hybrid, 8 groups | `'form'` in "information" |
| Who performs the independent assessment for PCS? | operational_hybrid, 8 groups | `'form'` in "performs" |
| Is this drug on the preferred formulary? | operational_hybrid | `'form'` in "formulary" |
| What does the state plan amendment require for PCS rates? | amendment | `'amendment'` substring |
| What is the current contract amendment for Healthy Blue? | amendment, deterministic latest-revision lane | `'amendment'` + `'current'` |
| How do I apply for the CAP/DA waiver? What is the application process? | federal_authority, CAP/DA alias dropped | waiver + application |
| What does EPSDT require? / What does EPSDT cover? | federal_authority / coverage | exact-sentence regex |
| Do childless adults qualify for Medicaid? | isPediatricQuery | `'child'` substring |
| Do NC Medicaid plans cover dental? | not a yes/no coverage query | must start with does/is/can/are/will/under |
| What does section 1915(c) allow states to waive? | general; requestedYears ['1915'] | year regex; no federal vocabulary |
| What is the difference between Medicaid and Medicare? | policy_variant | `'difference between'` |
| Does policy 1-H cover telehealth for speech therapy? | explicitPolicyNumbers ['10A'] | alias rule; 1-H not extracted |

Held-out paraphrases (50 pairs): questionType differs in 12, profile in 2, policy numbers in 1, at least one flag in 33.

## C. `lookupPolicy` prefix collisions (176 clinical policy numbers, local crawler registry)

- 9 → 9, 9A, 9B, 9D, 9E
- 3L → 3L, 3L-1
- 1A-2 → 1A-2, 1A-20 … 1A-28
- 1A-3 → 1A-3, 1A-31, 1A-32, 1A-33, 1A-34, 1A-36, 1A-38, 1A-39
- 1A-4 → 1A-4, 1A-40, 1A-42
- 1S-1 → 1S-1, 1S-10 … 1S-13
- 11A-1 → 11A-1, 11A-10, 11A-11, 11A-14 … 11A-17
- 8A → 8A, 8A-1, 8A-2, 8A-5 … 8A-13
- 8A-1 → 8A-1, 8A-10 … 8A-13

Not extracted from "Does policy N cover this service?": 1-I, 1-O-1, 1-O-2, 1-O-3, 1-O-5, 7, 9, 15. Inputs returning no candidates beyond the raw string: `1-H`, `8-P`, `Policy 8C`, `MA 2180`, `SSA Title XIX`, `3K2`.

## D. Programme-specific rules against the 55 golden questions

| Rule in code | Golden questions matched |
| --- | --- |
| `cap/da` → 3K-2 | q-001, q-008, q-010, q-011, q-038, q-044, q-046 |
| `outpatient behavioral health` → 8C | q-003, q-028, q-043 |
| pharmacy phrases → 9 | q-018, q-030, q-032, q-040 |
| `outpatient therap*` → 10A | q-004, q-007 |
| telehealth + speech/audiology → 10A | q-019 |
| `ambulance` → 15 | q-017 |
| `hcwd` → MA-2180, `scoreHcwdIncomePremium` (5 literals) | q-009 |
| `cap/c` → 3K-1 | none |
| MDT + home modification scorer, `mdt` term expansion | q-011 |
| congregate PCS predicate | q-005 |
| `scoreWaiverApplication` (7 literals, hard-coded 42 CFR 441/440 sections, 431.408) | q-010, q-045 |
| MLR predicates and term lists | q-021, q-048 |
| quantity-limit / episodic-drug prior-auth lane | q-018 |
| `isEpsdtOverviewQuery` exact sentences | none (matches the production smoke question) |

Golden evidence by document type: clinical_policy 75, federal_regulation 21, beneficiary_guidance 11, dhhs_policy 6, federal_statute 2; none in fee_schedule, managed-care, bulletin, SPA, waiver or provider_manual.

## E. Brief questions, short answers

- Injection: none found. Lucene: special characters escaped; operator words are not.
- ReDoS: none found in scope.
- Determinism: deterministic for a fixed graph state and embedding; ties are resolved by Neo4j row order in several queries.
- Backend failure: swallowed silently except section_vector; no deadline.
- Duplicates: de-duplicated by sectionId only; chunk rows and twin documents are not collapsed.
- Embedding call: 15 s timeout, one retry, no cache, length check only, no model identity (finding 11).
- Superseded documents: CFR stubs have no sections; only `lookupPolicy` returns the supersession note.
- Reference cycles: harmless, primitives are single-hop.
- API design: a clean seam at construction, shallow behind it. Ten methods map one-to-one to Cypher statements; `searchSectionsDetailed` leaks ranking internals and whole bodies; three parallel flag structures exist (QueryFlags, RerankQueryFlags, frame flags).

## F. Scratch artefacts

`<review scratch directory, not kept>/corpus-retrieval/`: `probe1.mts` … `probe6.mts` (pure functions and a fake session, run with `node node_modules/tsx/dist/cli.mjs`), `crawler-copy.db`, `registry-policy-numbers.json`, saved Neo4j documentation pages.
