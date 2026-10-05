# Retrieval and answer frames: all issues

What works: Cypher is parameterised, dependencies are injected, the collector is an explicit staged pipeline, and the verifier accepts only section text as evidence. What does not: which policy and which sections reach the model is decided by substring rules, alias tables and template-title matches tuned on the 55 questions that also gate releases. Round two reproduced wrong-policy frames for over-the-counter drugs, outpatient therapy and in-home personal care, and showed that coverage frames rarely carry the answering section's text. The main risk is a correctly cited answer built on the wrong policy, which a grounding check cannot detect. No model was run, so every wrong-answer impact is inferred. I would first make section ordering deterministic and the policy lookup exact, since both change frames and must precede any baseline comparison, then fix the alias rules, then apply the settled coverage-selection design.

## What is working

- Cypher is parameterised throughout; the only interpolations are numeric constants, fixed aliases and an allow-listed relationship type, with an injection test (`packages/policy-corpus/src/primitives/concepts.ts:25-32`, `packages/policy-corpus/tests/primitives.test.ts:372`).
- The library has no runtime dependencies and takes its Neo4j session and embedder by injection (`packages/policy-corpus/src/types.ts:269-273`), so retrieval and frames are testable without a driver or network.
- The graph test helper is strict: undeclared record fields throw, unexpected queries throw, and unused handlers are flagged (`packages/policy-corpus/tests/helpers/graph-fixtures.ts:49-60`).
- The hybrid collector is an explicit staged pipeline with documented merge order, and each parallel branch takes its own session (`packages/policy-corpus/src/retrieval/collector.ts:34-58`), which made statement-by-statement profiling possible.
- A Voyage failure disables only the vector backends, and the search tool reports the retrieval mode to the model (`packages/policy-corpus/src/retrieval/hybrid.ts:30-35`, `packages/agent/src/tools/search.ts:30`).
- The verifier takes only section bodies as evidence and treats the frame as a routing hint (`packages/agent/src/processors/verifier/evidence.ts:324-339`), so a frame label alone cannot support a claim.

## High severity

### RETR-1 · Policy numbers are extracted and looked up loosely, anchoring frames on the wrong policy

**high** · effort M · wrong-answer risk, test gap

`extractExplicitPolicyNumbers` (`packages/policy-corpus/src/internal/query-intent.ts:445`) treats any digit-plus-letter token as a policy number, and `lookupPolicy` (`packages/policy-corpus/src/primitives/policy-lookup.ts:62`) matches by prefix while routing keeps the first row. On the local July 2026 graph with embeddings stubbed, "3D mammograms" anchors a coverage frame on Policy 3D, Hospice, and 27 of 62 look-alike questions resolve to a document. Six policies resolve to a sibling, such as 1A-2 to 1A-27. Stored numbers such as 1-I, 7 and 15 are missed, and a suffixed form number such as DHB-5125B is read as two numbers and finds nothing.

**Impact.** A beneficiary asking whether a service is covered can get an answer plan built on an unrelated policy. The verifier checks grounding only, so a cited answer about the wrong policy could pass.

**Fix.** Adopt the round-two combined patch: make the `lookupPolicy` WHERE clause an exact case-insensitive match, exclude revision rows, and accept a bare token only beside a cue word. Do not add an exact-first `any()` ORDER BY key; it crashes the pinned Neo4j 2026.05. Tighten the "under" cue and resolve form numbers to the stored prefix-and-digits key, preferring the typed suffix. Ship the 54 scratch checks as a table test and add sibling fixtures to the existing Neo4j integration test.

*What is and is not established: Measured on the local July 2026 graph with embeddings stubbed and on fixtures; no agent answer was run. The combined patch was checked only on the reviewer's 217 questions.*

Where: `packages/policy-corpus/src/internal/query-intent.ts:445`, `packages/policy-corpus/src/primitives/policy-lookup.ts:62`, `packages/policy-corpus/src/frame/context/routing.ts:140`, `packages/agent/tests/integration/neo4j-tools.integration.test.ts`

### RETR-2 · Alias rules force the wrong policy for over-the-counter, outpatient therapy and CAP/Choice questions

**high** · effort S · wrong-answer risk, live failure, test gap

`extractAliasedPolicyNumbers` (`packages/policy-corpus/src/internal/query-intent.ts:450-495`) maps bare substrings to policy numbers that are then treated as typed by the user. Over-the-counter medication wording forces Policy 9, whose exclusion list begins with over-the-counter products; Policy 9A, which covers them, never enters the frame. "Outpatient therapy" forces Policy 10A although the corpus uses the phrase only in behavioural-health policies, and "cap/c" also matches the Community Alternatives Program options CAP/Choice and CAP/CD, which belong to Policy 3K-2. In a fixture probe the Policy 8C psychotherapy section, the top hit at 0.97, was absent from the frame.

**Impact.** A case manager asking whether prescribed Claritin, or outpatient therapy for depression, is covered is steered toward a cited "no" from the wrong policy, which a grounding check would accept.

**Fix.** Split the pharmacy alias so the eight over-the-counter phrases map to 9A only and pharmacy wording keeps 9. Replace the "outpatient therapy" rule with "outpatient specialized therap", bound "cap/c" so it matches only CAP/C and CAP/Children, and map "cap/choice" to 3K-2. Leave `scoreVariantDocument` unchanged. Flip the over-the-counter assertion in `packages/policy-corpus/tests/internal/query-intent.test.ts`, add the negative cases, and check golden questions q-004 and q-032 on the next evaluation run.

*What is and is not established: Frames were reproduced on fixtures and on the local July 2026 graph with embeddings disabled. The wrong final answers are inferred; no model was run.*

Where: `packages/policy-corpus/src/internal/query-intent.ts:462`, `packages/policy-corpus/src/internal/query-intent.ts:488`, `packages/policy-corpus/src/internal/document-selection.ts:108`, `packages/policy-corpus/src/query/analysis.ts:54`

### RETR-3 · Coverage frames fill slots with template sections and strip the answering section's text

**high** · effort M · wrong-answer risk, evaluation validity, test gap

For yes/no questions, `packages/policy-corpus/src/frame/pipelines/coverage.ts:220` lists title-matched template sections ahead of search hits. The scope slot is chosen by substring over section bodies (`packages/policy-corpus/src/frame/coverage-sections/selection/groups.ts:146`), leftover hits become avoid entries with their text stripped, and rebalance promotes them back without text. Given the right section as the top hit, 218 synthetic probes returned it with text in 4 to 11% of cases. Nine of 50 frames in each stored September run held a text-less primary or supporting section. Prompts and tests assert a 2.1.1 plus 4.1 pair that recorded frames never contain.

**Impact.** For a service that is covered, the plan leads with boilerplate and the not-covered template and holds no text about the service. A beneficiary may get a hedged, withheld or mis-anchored answer.

**Fix.** Choose the first primary structurally: section 1.0, then its first non-empty child, with no body-text matching. Hydrate the top in-policy search hits next and move 4.1, 4.2.1 and 3.2.1 to supporting. Nominate avoid sections only on a title match, strip avoid content after rebalance, and never select an empty-body section. Reword the pair rule in `packages/agent/src/prompt.ts:20-21`, `packages/agent/src/processors/verifier/verify.ts:66` and the planner. Replace the retitled fixtures with real section lists, then add the content invariant test and the oracle probe as acceptance.

*What is and is not established: Probes are synthetic and put the section title in the question; stored-run counts come from the legacy local graph. No score harm was visible and no model was run.*

Where: `packages/policy-corpus/src/frame/pipelines/coverage.ts:220`, `packages/policy-corpus/src/frame/coverage-sections/selection/groups.ts:146`, `packages/policy-corpus/src/frame/rebalance/coverage.ts:21`, `packages/policy-corpus/tests/frames-coverage.test.ts:295`

### RETR-4 · Substring intent and care-setting rules misroute common questions and are unstable under paraphrase

**high** · effort M · wrong-answer risk, test gap

Question type, document-type groups and care-setting preferences come from bare substring checks (`packages/policy-corpus/src/internal/query-intent.ts:508`, `packages/policy-corpus/src/internal/term-lists.ts:397`). The adult-care-home term 'ach' matches inside "each" and "reach"; on the local July 2026 graph a question about personal care "each month" in the person's own home lost Policy 3L and kept only the congregate policy 3L-1. An income-limit question mentioning the federal poverty level routes to federal authority, and "state plan amendment" routes to the amendment pipeline. The bare router keeps the original type for 38 of 50 held-out paraphrases.

**Impact.** A family member asking about in-home personal care, or a case manager asking an income limit, can get an accurately cited answer from the wrong policy or one that omits the state rule.

**Fix.** Match query-side terms with the existing `matchesToken` in `packages/policy-corpus/src/internal/document-selection.ts:118` and `:196` and for single-word intent triggers, adding the plural forms that token matching drops. Give the setting entries an exact `policyNumbers` field (3L-1 congregate, 3L in-home). Exclude "federal poverty" in `isFederalAuthorityQuery`, strip "state plan amendment" before the change-notice test, and make federal type groups additive. Add a free test that runs `analyzeQuery` over each golden and paraphrase pair, with a shrinking allow-list.

*What is and is not established: Measured on the bare router and the local graph, embeddings disabled. Production frames come from a model-written tool call that often overrides the router; the live misroute rate is unknown.*

Where: `packages/policy-corpus/src/internal/query-intent.ts:508`, `packages/policy-corpus/src/internal/term-lists.ts:397`, `packages/policy-corpus/src/internal/document-selection.ts:196`, `packages/policy-corpus/src/internal/retrieval-planning.ts:32`

### RETR-5 · Section text beyond the first 6,000 characters cannot be read by any tool

**high** · effort M · wrong-answer risk, live failure, test gap

`getSection` truncates content at 6,000 characters (`packages/policy-corpus/src/internal/record-mapping.ts:144`) while its tool description promises the complete text (`packages/agent/src/tools/read.ts:12`). The truncation note points to sub-sections, but nearly all over-length sections are leaves. On the local July 2026 graph about 5,300 sections exceed the cap, including 82% of fee-schedule sections, 36% of federal statute sections and 15% of federal regulation sections. Frame hydration and verifier evidence use the same call, so the model, the frame and the verifier all see only the head.

**Impact.** An attorney asking about a later paragraph of a long regulation, such as remittance in 42 CFR 438.8, can get a partial or withheld answer, or a negative claim from an incomplete read.

**Fix.** Add `offset` and a bounded length to `PolicyCorpus.getSection` and the tool, slicing in Cypher with `substring` and returning the total length and next offset. Make the truncation note state the range shown and how to continue, correct the tool description, and label verifier evidence with the window. Test continuation and the container-children path. Cap spreadsheet section size in the pipeline.

*What is and is not established: The truncation is in current code; the counts come from the local July 2026 graph. No partial or wrong answer was observed end to end.*

Where: `packages/policy-corpus/src/internal/record-mapping.ts:144`, `packages/agent/src/tools/read.ts:12`, `packages/policy-corpus/src/primitives/sections.ts:134`, `packages/policy-corpus/src/frame/context/hydration.ts:35`

### RETR-6 · Amendment recency is unreliable: synthetic dates tie and markers are parsed from unrelated titles

**high** · effort M · wrong-answer risk, data quality, test gap

The loader dates every `dhhs_policy` change notice January 1 of its year (`packages/pipeline/src/pipeline/graph/loader.py:291`). `getAmendments` sorts on that date, breaks ties by id and labels the first row `authoritativeDocument`. On the local July 2026 graph 56 of 209 amended base documents tie at the newest date; MA-3550 returns notice 02-26 ahead of 04-26. The marker parser (`packages/policy-corpus/src/internal/change-markers.ts:15`) reads false markers from 836 section occurrences and 658 real document titles. Because only notices carry dates, the document keyword backend gives all six slots to notices ahead of tied manuals.

**Impact.** An attorney asking what is current for a manual can be told an older notice is the latest. Tool output supports the claim, so the verifier would not catch it.

**Fix.** Return the queried manual as the current document from `getAmendments` (two of three reviews preferred this), report notices as history, and update `packages/agent/src/prompt.ts:93`. Replace both marker regexes with the single measured pattern anchored on "change", reject years beyond next year, and pin a table test per header family. Sort status before date at `packages/policy-corpus/src/retrieval/backends/keyword.ts:105`. Stop writing synthetic dates; the owner must choose a null date with stored year and sequence, or the notice's parsed header date. Test three same-year notices.

*What is and is not established: Counts come from the legacy local graph, and the new pattern's 1,182 of 1,182 result is in-sample. The effect on final answers was not measured.*

Where: `packages/policy-corpus/src/primitives/amendments.ts:30`, `packages/pipeline/src/pipeline/graph/loader.py:291`, `packages/policy-corpus/src/internal/change-markers.ts:15`, `packages/policy-corpus/src/retrieval/backends/keyword.ts:105`

### RETR-7 · Retrieval and frame heuristics are tuned to the same questions that gate releases

**high** · effort L · evaluation validity, release gate, needless complexity

Predicates in `packages/policy-corpus/src/internal/query-intent.ts` and term lists in `packages/policy-corpus/src/internal/term-lists.ts:100` carry vocabulary and section numbers matching single golden questions, and `isEpsdtOverviewQuery` (line 359) matches the production smoke question verbatim. `release-validate` scores only the 55 golden questions (`packages/pipeline/src/pipeline/cli/release.py:283`). The only other sets are one-to-one paraphrases of the same questions. Golden evidence covers 33 documents: 21 of 177 clinical policies and no fee schedule, state plan amendment, contract, bulletin, waiver or provider manual. A verifier's count found topic predicates firing on 15 of 55 golden questions and 1 of 25 fresh ones.

**Impact.** Release scores describe tuned topics, and the project's records mark this problem as fixed since June 2026. A question about dental, estate recovery or another unbenchmarked policy takes an unmeasured generic path.

**Fix.** Author one frozen set of 20 to 40 questions on document families and policies the golden evidence does not touch, score it at retrieval level first, and never tune on it. Add an environment flag that bypasses the single-policy branches, compare repeated runs through `scripts/eval-ab.sh`, and delete branches that do not beat the ablated arm. The reviews disagree on whether the paraphrase set belongs inside `release-validate`; the owner must choose, and should not add it before a release has completed.

*What is and is not established: Tuning is inferred from vocabulary overlap and from predicates firing on 15 of 55 golden questions against 1 of 25 fresh ones. Quality on untested topics was not measured.*

Where: `packages/policy-corpus/src/internal/query-intent.ts:359`, `packages/policy-corpus/src/internal/term-lists.ts:100`, `packages/pipeline/src/pipeline/cli/release.py:283`, `packages/pipeline/src/pipeline/evaluation_evidence.py:80`

## Medium severity

### RETR-8 · Hit-inferred coverage routing keeps one policy, dropping a second service or the top-ranked document

**medium** · effort S · wrong-answer risk, test gap

When a coverage question names no policy number, `narrowInferredCoverageDocuments` (`packages/policy-corpus/src/internal/document-selection.ts:222-238`) keeps one document unless two share a policy family, and then keeps the largest family regardless of rank. On HEAD the ranked list 1H, 1T-1, 1M-5, 1M-4 returns the two 1M policies. In fixture probes "hearing aids and eyeglasses for adults" produced a frame holding only the hearing-aid policy, with hits at 0.97 and 0.96, and the plan gave a yes/no directive without saying a service had been dropped.

**Impact.** A beneficiary asking about two services gets a plan for one. The likely result is a partial or withheld answer; a wrong verdict for the second service is possible.

**Fix.** Return the family of the top-ranked document from `narrowInferredCoverageDocuments`, or that document alone, and leave `policyFamilyKey` unchanged. Record dropped documents on the frame, have the planner name the uncovered service and tell the model to search for it, and suppress the yes/no directives in that case. Run one two-service question through the agent before building a second-document rule. Add unit cases for the three ranked lists and frame tests for the two probe questions.

*What is and is not established: Reproduced as a pure function on HEAD and on synthetic fixtures with hand-set scores. Frequency under live hybrid retrieval is unmeasured and the agent was not run.*

Where: `packages/policy-corpus/src/internal/document-selection.ts:232`, `packages/policy-corpus/src/frame/context/routing.ts:160`, `packages/policy-corpus/src/frame/pipelines/coverage.ts:71`, `packages/agent/src/processors/answer-frame-planning.ts:711`

### RETR-9 · Prior-authorisation frames fill with tied template headings and demote the Prior Approval section

**medium** · effort S · wrong-answer risk, test gap

`resolvePriorAuthFrame` places title-matched sections ahead of search hits, and the title terms include the bare word 'criteria' (`packages/policy-corpus/src/internal/term-lists.ts:192`), so headings such as "4.1 General Criteria Not Covered" tie with "5.1 Prior Approval". A median of 11 tied headings per policy compete for 8 slots, and leftover hits become avoid entries without text. In the September final gate the golden section for question q-014, Policy 3L-1 section 5.6, shipped as a text-less avoid entry. Rebalance also demotes any section whose body mentions "requesting prior authorization".

**Impact.** An attorney asking whether prior approval is required may get a plan built on not-covered headings, with the governing section missing or without text. The stored q-014 answer was still correct.

**Fix.** Rank 'prior approval' and 'prior authorization' headings above bare 'criteria' headings, and stop 'not covered' headings qualifying as primary. Require a title match for avoid nomination in `buildSectionCandidates` and scope hit-derived candidates to the routing documents, in the same change as the coverage fix. Classify process sections by title only. Add a frame test built from a real policy's section list asserting section 5.1 or 5.2 is primary with text under more than one listing order.

*What is and is not established: The q-014 frame is from the stored September gate on the legacy graph; corpus-wide counts come from an in-memory harness with supplied hits. No wrong answer was observed.*

Where: `packages/policy-corpus/src/internal/term-lists.ts:192`, `packages/policy-corpus/src/frame/pipelines/prior-auth.ts:50`, `packages/policy-corpus/src/frame/rebalance/prior-auth.ts`, `packages/policy-corpus/src/internal/section-views.ts:101`

### RETR-10 · Waiver scoring ranks age-65 waiver regulations above the governing 1915(c) sections

**medium** · effort S · wrong-answer risk, evaluation validity, documentation, test gap

North Carolina's waivers are governed by 42 CFR 441 Subpart G (441.300 to 441.313), but `packages/policy-corpus/src/internal/term-lists.ts:303-314` lists Subpart H sections 441.350 to 441.355, the separate age-65 waiver, as equal primaries. Avoid terms such as 'public notice' are matched against section bodies and, on the local July 2026 graph, occur only in 441.301, 441.302 and 441.304. A keyword-only probe about Innovations waiver assurances returned 441.352 and omitted 441.302. `docs/development/gotchas.md:111` and the answer key for golden question q-045 call Subpart H a newer numbering of the same rules.

**Impact.** An attorney asking which assurances the state owes for a 1915(c) waiver can get an answer citing the wrong subpart, and the benchmark key marks a correct answer down.

**Fix.** Remove 441.350 to 441.355 from `WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS` and the anchor regex, and add 441.304. Match avoid terms and the '1915(b)' penalty on section titles only. Apply this in `packages/policy-corpus/src/internal/rerank.ts`, the duplicated scorer and hard filter in `packages/policy-corpus/src/frame/federal-authority.ts`, and the rebalance hint, collapsing the two scorers into one function. Correct the gotcha, the q-045 answer text and its evidence label. Add a regression test: an assurances question yields 441.301 and 441.302 as primary and no 441.35x section.

*What is and is not established: Probe outputs were measured with embeddings disabled on the local graph and not re-run; behaviour under hybrid retrieval on the deployed corpus is unmeasured.*

Where: `packages/policy-corpus/src/internal/term-lists.ts:309`, `packages/policy-corpus/src/internal/rerank.ts:397`, `packages/policy-corpus/src/frame/federal-authority.ts:412`, `docs/development/gotchas.md:111`

### RETR-11 · Archived and companion fee schedules stay searchable; `retrieval_ready` is only a rerank penalty

**medium** · effort M · wrong-answer risk, data quality, cost

No retrieval backend filters on `Document.retrieval_ready`; by design it is only a score penalty in `packages/policy-corpus/src/internal/rerank.ts:287`, about 0.46 to 0.48 below a primary schedule on reimbursement questions. On the local July 2026 graph 681 not-ready fee-schedule documents, archive and companion copies, hold about 2.43 GB of text against 245 MB in 262 ready documents, and all their non-empty sections are reachable by vector search. Search hits carry no bucket or date. A reported top-ten with three not-ready hits used a stand-in query vector and was not reproduced.

**Impact.** A case manager asking for a current rate can get an archived one, and the stale rate would pass the verifier. These copies are also about 90% of the fee-schedule text scanned.

**Fix.** Add one shared Cypher condition, `coalesce(d.retrieval_ready, true)`, to every backend that returns sections, applying it to the base document only in `amendment_context`. Stop writing vectors, and preferably bodies, for not-ready documents in the pipeline. Decide archive explicitly: exclude it, or admit it only when the requested year matches the variant date. Add `corpusBucket` and `variantDate` to the search tool result, and an integration assertion for whichever rule is chosen.

*What is and is not established: Sizes are from the local July 2026 graph. The reported top-ten with three not-ready hits used a stand-in query vector and was not reproduced.*

Where: `packages/policy-corpus/src/internal/rerank.ts:287`, `packages/policy-corpus/src/internal/scoring-constants.ts:90`, `packages/policy-corpus/src/retrieval/backends/keyword.ts:24`, `packages/policy-corpus/src/internal/record-mapping.ts:20`

### RETR-12 · Frame composition depends on Neo4j's unordered section listing

**medium** · effort S · evaluation validity, reliability, release gate, test gap

`lookupPolicy` (`packages/policy-corpus/src/primitives/policy-lookup.ts:70`) and `getDocument` collect a document's sections with no ORDER BY, and `pickDocumentSectionsByTitle` sorts on score alone, so tied title matches are resolved by the database's relationship order. On the local graph that order is arbitrary but repeatable within one build. In a harness with supplied hits, reversing the listing changed the primary sections for 26 of 177 policies and put "5.1 Prior Approval" in primary for 162 of 175 frames instead of none.

**Impact.** A graph rebuild can change frames with no change to code or corpus text, so the owner could attribute the shift to a candidate release in the comparison issue #188 requires.

**Fix.** Sort sections in `mapDocumentSections` (`packages/policy-corpus/src/internal/record-mapping.ts:72`) with a natural section-number comparator and id as the last key, and give `pickDocumentSectionsByTitle` the same explicit tie-break. Add a property test that shuffling a document's section listing changes neither the picked ids nor the resolved frame. Expect golden frames to shift, and re-baseline them once, deliberately, before any baseline comparison.

*What is and is not established: Effect sizes come from a harness with supplied hits on the local legacy graph. The production listing order was not inspected.*

Where: `packages/policy-corpus/src/primitives/policy-lookup.ts:70`, `packages/policy-corpus/src/primitives/sections.ts:146`, `packages/policy-corpus/src/internal/record-mapping.ts:72`, `packages/policy-corpus/src/internal/section-views.ts:101`

### RETR-13 · Spanish questions bypass the English-only coverage boundary, determinism hints and tokeniser

**medium** · effort M · wrong-answer risk, accessibility, test gap

Spanish questions are anticipated (30 of 200 scope fixture items contain Spanish), but `resolveCoverageScope` (`packages/policy-corpus/src/scope/coverage.ts:64`) matches English words only and returns null for Spanish wordings of the dated income-table and at-home COVID test questions. The input block and the verifier's dated-source obligation are both computed from the user's own text, so neither fires. The keyword router gives no numeric or yes/no hint, and the tokeniser at `packages/policy-corpus/src/internal/search.ts:86` keeps ASCII letters only, turning accented words into fragments. The model-based verifier still checks support and citations.

**Impact.** A Spanish-speaking beneficiary asking an income limit is answered without the dated-table check and strict numeric check that English speakers get, and sees every notice in English.

**Fix.** Run `resolveCoverageScope` in the verifier on the `resolveAnswerFrame` query as well, or reuse the frame's returned scope, and apply the stricter result. Change the prefetch instruction at `packages/agent/src/processors/answer-frame-prefetch.ts:21` to pass the question in faithful English, keeping dates, form numbers and program names. Add one prompt line: answer in the user's language and quote policy text in the original English. Add the paired Spanish cases to `packages/policy-corpus/tests/answer-scope.test.ts`.

*What is and is not established: Reproduced with a probe of the real functions. Whether the model passes Spanish text verbatim, which language it answers in, and live retrieval quality were not measured.*

Where: `packages/policy-corpus/src/scope/coverage.ts:64`, `packages/policy-corpus/src/internal/search.ts:86`, `packages/agent/src/processors/answer-frame-prefetch.ts:21`, `packages/agent/src/prompt.ts:68`

### RETR-14 · Policy-variant frames contain only template boilerplate and no search evidence

**medium** · effort S · wrong-answer risk, test gap

`resolvePolicyVariantFrame` (`packages/policy-corpus/src/frame/pipelines/policy-variant.ts:39`) selects sections by substring against six terms such as 'general' and 'policy', uses search hits only to find documents, and never checks section text. Section 1.0, the description that distinguishes sibling policies, matches none of the terms; on the local July 2026 graph it was selected for 0 of 177 policies. The recorded September frame for golden question q-008 held four boilerplate primaries and omitted the golden section. The planner tells the model to lead with one variant and use the sibling only as comparison.

**Impact.** An attorney asking how two sibling policies differ, such as in-home and congregate personal care, gets near-identical boilerplate from each and a plan that names a winner.

**Fix.** Stop selecting by `SCOPE_SECTION_TERMS` in the standalone pipeline. For each resolved document return its description section, chosen structurally, plus that document's top search hits with text, built through `finalizeFrame` with the limit split per document. When the question names two policies or the top scores tie, clear `variantReasoning` and replace the planner's "lead with" and "only as comparison" rules with a compare-both instruction. Keep the document-ranking helper the coverage pipeline uses. Add one frame test comparing 3L and 3L-1.

*What is and is not established: Counts were measured on the local July 2026 graph and not re-run. The router sends none of the 55 golden questions here, so real usage depends on the model's hint.*

Where: `packages/policy-corpus/src/frame/pipelines/policy-variant.ts:39`, `packages/policy-corpus/src/internal/term-lists.ts:14`, `packages/policy-corpus/src/internal/query-intent.ts:299`, `packages/agent/src/processors/answer-frame-planning.ts`

### RETR-15 · Amendment frames list synthetic revision rows as authoritative and omit the named policy

**medium** · effort S · data quality, cost, test gap

`resolveAmendmentFrame` calls `getAmendments` for every document `lookupPolicy` returns (`packages/policy-corpus/src/frame/pipelines/amendment.ts:67`). For a clinical policy that is the policy plus up to 24 synthetic, section-less revision rows. The rows take all three authoritative slots, and the guard at lines 102-104 denies the real policy its explicit-lookup score. On the legacy local graph a question about Policy 8C made 25 `getAmendments` calls and 77 Cypher statements. The stored gate frame for question q-044 named three revision rows and no policy. On the latest-revision route the newest row arrives only through lookup.

**Impact.** The model and the verifier see three text-less rows as the authoritative documents, and each such frame costs about fifteen times the usual queries. Saved answers were still correct.

**Fix.** Change `packages/policy-corpus/src/frame/pipelines/amendment.ts` in the same change that removes revision rows from `lookupPolicy` and reshapes `getAmendments`: push lookup documents first at the explicit-lookup score, add amendment-view documents only when absent, and on the latest-revision route add the newest clinical revision row from the view. Call `getAmendments` only for non-amendment lookup documents, capped at about three. Add a frame test with 30 derived rows on both routes asserting the policy is first and the newest revision is present.

*What is and is not established: Reproduced on current source against the legacy local graph with search stubbed. Interactions with the planned fixes were traced in code, not executed.*

Where: `packages/policy-corpus/src/frame/pipelines/amendment.ts:67`, `packages/policy-corpus/src/frame/pipelines/amendment.ts:102`, `packages/policy-corpus/src/primitives/policy-lookup.ts:62`, `packages/pipeline/src/pipeline/references/amendments.py:262`

### RETR-16 · The beneficiary_guidance document family is unreachable by default search and every answer frame

**medium** · effort S · deadline 2027-01-01 · wrong-answer risk, release gate, test gap

`beneficiary_guidance` is a manifest source family described to the model in `packages/agent/src/prompt.ts:87`, but it appears in no type group in `packages/policy-corpus/src/internal/scoring-constants.ts:20-31`, and every primary backend filters on those groups. The family holds the evidence for golden questions q-051 to q-055, including the work requirements that the golden reference answer dates from January 1, 2027. The defect is latent: the family is absent from the local graph and from the configured production release, and takes effect when a corpus containing it is promoted. No release gate has exercised those questions.

**Impact.** Once the family is loaded, a beneficiary asking about the new work rules or a termination notice gets an answer drawn from the wrong document family, or a withheld answer.

**Fix.** Add `['beneficiary_guidance']` as its own entry in `BASE_TYPE_GROUPS`. Add a policy-corpus unit test that reads `corpus-manifest.json` and fails when any source type is in neither type-group list nor a named exclusion list, and a profile test asserting the default profile includes the family. Name the family in the `searchSections` description. Run the q-051 to q-055 retrieval evaluation once the family is loaded, as part of the issue #188 qualification work.

*What is and is not established: Latent: the family is absent from the local graph and the configured production release. Rated medium because nothing is affected until such a corpus is promoted.*

Where: `packages/policy-corpus/src/internal/scoring-constants.ts:20`, `packages/policy-corpus/src/retrieval/backends/section-vector.ts:17`, `corpus-manifest.json:174`, `packages/agent/src/prompt.ts:87`

### RETR-17 · Keyword backends scan every section body per search and return whole bodies

**medium** · effort M · reliability, cost

`section_keyword` lower-cases and substring-matches every section body once per term and per document-type group (`packages/policy-corpus/src/retrieval/backends/keyword.ts:37`), breaks ties toward the longest body (line 60), and every backend returns `s.content_text` in full. On the local July 2026 graph, fee schedules hold 2.68 GB of the 2.78 GB of body text, with sections up to 38.5 MB; the fee-schedule scan took 43.8 seconds, above the 30-second statement timeout whose failure the empty catch at line 70 swallows. Base groups took under a second each. Production graph size was not checked.

**Impact.** Billing and reimbursement questions, which add the fee-schedule group, can stall for the full timeout and silently lose keyword evidence, while multi-megabyte hits block the Node event loop for every concurrent chat.

**Fix.** Profile `section_keyword` and `document_keyword` per type group on a graph with compacted fee schedules before changing anything. Then skip the body match for sections above about 200,000 characters, drop the `content_length DESC` tie-break and log the swallowed errors. The reviews disagree on deleting the body-match arm and bounding returned content with `left()`, because the reranker reads whole bodies; the owner must decide after one full retrieval evaluation.

*What is and is not established: Timings are from the uncompacted legacy graph; the repository's 2026-10-04 record puts compacted fee-schedule text at 368 MB, so a production timeout is unconfirmed. Rated medium for that reason.*

Where: `packages/policy-corpus/src/retrieval/backends/keyword.ts:37`, `packages/policy-corpus/src/retrieval/backends/keyword.ts:60`, `packages/policy-corpus/src/retrieval/backends/chunk-vector.ts:13`, `packages/agent/src/neo4j.ts:17`

### RETR-18 · Four lookup tools return unbounded results, up to about 260,000 tokens

**medium** · effort S · cost, reliability

`findConceptSections`, `getSectionContext`, `lookupPolicy` and `getDocument` have no row limit. Measured on the local July 2026 graph, `findConceptSections('Prior Authorization')`, one of the tool's own examples, returns 2,573 rows, roughly 173,000 tokens by character count, and 'CMS' about 260,000; `getSectionContext` under a 2,364-child parent returns about 79,000 tokens in 4.5 seconds through a quadratic sibling query (`packages/policy-corpus/src/primitives/sections.ts:199`). The chat agent's 128,000-token limiter drops an oversized result whole; deep-research agents have no limiter. The concept tool also advertises two relationship types the pipeline never writes, which return an empty list.

**Impact.** A single tool call can evict earlier evidence or vanish from the model's context in chat, and can exhaust context or dominate cost in deep research. The user gets a wasted or degraded turn.

**Fix.** Cap `getDocument` and `lookupPolicy` section lists in the agent tool wrappers, return a count and a truncated flag, and show the total in verifier evidence. Bound `findConceptSections` in the primitive with an ORDER BY, a LIMIT of 25 to 50 and a total. Replace the `NEXT_SIBLING*0..` expansion with a bounded walk, which ran in 38 ms on the largest family. Restrict `relationshipType` to the three written types, and add a cap test per tool.

*What is and is not established: Sizes were measured on the legacy local graph. In chat the token limiter drops an oversized result instead of overflowing, so this is rated medium, not high.*

Where: `packages/policy-corpus/src/primitives/concepts.ts:47`, `packages/policy-corpus/src/primitives/sections.ts:199`, `packages/policy-corpus/src/primitives/policy-lookup.ts:70`, `packages/agent/src/tools/concepts.ts:17`

### RETR-19 · Hits carry no document id, so expansion and boosts key on non-unique titles

**medium** · effort M · wrong-answer risk, data quality

`CorpusRetrievalHit` has no document id. The collector picks dominant documents by title and all three expansion statements match `d.title IN $titles` (`packages/policy-corpus/src/retrieval/backends/document-expansion.ts:31`). On the local July 2026 graph 309 titles are shared by 748 of 7,589 documents, 231 of them with sections; a bulletin titled "here" expands into 8 unrelated bulletins. Separately, hits are merged by maximum raw score across unrelated scales (`packages/policy-corpus/src/retrieval/collector.ts:28`): lexical scores grow with question length, and a per-document boost of up to 0.16 rewards hit count, which a test pins.

**Impact.** A hit in one bulletin can pull sections from older or unrelated bulletins with the same title into the results, and citations carry an ambiguous title. No wrong released answer was traced.

**Fix.** Add `d.id AS documentId` to the shared hit projection and `CorpusRetrievalHit`, key `documentKeyForHit` and the expansion queries on it, and add a test with two same-title documents asserting only the hit document expands. Then divide lexical term scores by their maximum so the ceiling stops depending on question length, and compute the document coverage boost once, before expansion. Gate each step on the retrieval evaluation and trace whether the new order reaches frame selection.

*What is and is not established: Title collisions were counted on the local July 2026 graph. No wrong released answer was traced.*

Where: `packages/policy-corpus/src/retrieval/backends/document-expansion.ts:31`, `packages/policy-corpus/src/internal/document-selection.ts:78`, `packages/policy-corpus/src/retrieval/collector.ts:28`, `packages/policy-corpus/src/internal/record-mapping.ts:20`

### RETR-20 · Vector search per group draws from one global top-200 pool, starving federal groups

**medium** · effort M · dependency, cost

The section, chunk and policy-scoped vector backends query a global top 200 and then filter by document type (`packages/policy-corpus/src/retrieval/backends/section-vector.ts:14`), so each type group re-runs the same scan and keeps its slice. On the local July 2026 graph (56,102 embedded sections; 233 federal statute, 3,106 federal regulation), clinical-policy sections used as query vectors returned 198 to 199 clinical sections and no federal ones. That proxy probably overstates the effect; four real pipeline runs pointed the same way. The "cannot pre-filter" comment at `packages/policy-corpus/src/internal/scoring-constants.ts:10` is outdated for the pinned Neo4j 2026.05.

**Impact.** An attorney asking for the federal basis of a state rule depends on keyword matching to surface the statute or regulation, because semantic search rarely returns federal sections.

**Fix.** Score any type group under about 4,000 vectors with an exact cosine scan instead of the index, and make the vector half of `packages/policy-corpus/src/retrieval/backends/policy-scoped.ts` an exact scan over the named policy's documents; no schema change or reload is needed. Re-run the retrieval evaluation before and after, checking that the added low-similarity federal candidates do not displace better evidence in frame selection. Later, denormalise `document_type` onto Section and Chunk and move to filtered `SEARCH`.

*What is and is not established: Measured with clinical sections as stand-in query vectors on the local graph, which probably overstates the effect; four real pipeline runs pointed the same way.*

Where: `packages/policy-corpus/src/internal/scoring-constants.ts:10`, `packages/policy-corpus/src/retrieval/backends/section-vector.ts:14`, `packages/policy-corpus/src/retrieval/backends/chunk-vector.ts:13`, `packages/policy-corpus/src/retrieval/backends/policy-scoped.ts:28`

### RETR-21 · Full-text recovery favours the first type group and passes operators through to Lucene

**medium** · effort S · test gap, reliability

`mergeFulltextHits` scores new full-text hits by their position in a list concatenated group by group (`packages/policy-corpus/src/retrieval/collector.ts:184`). In a fake-session probe with five groups, the best first-group hit was inserted at 0.79 and the best hit of every later group at about 0.01, although its raw score was five times higher. The stage is described as exact-phrase recovery, but quotes are escaped, so no phrase query is ever sent. Upper-case AND, OR and NOT pass through as operators, and a trailing operator is a parse error that returns nothing.

**Impact.** An exact wording match in an eligibility manual or federal regulation that the other channels missed is unlikely to reach the top results; an attorney quoting policy language may not get the section back.

**Fix.** Sort full-text hits by raw score before the positional loop in `mergeFulltextHits`. Lower-case the query before `escapeLucene` to neutralise operators, and append each user-quoted phrase as a quoted clause; then correct the "exact-phrase" comments. Add a collector test where a later-positioned hit has the higher raw score, and backend tests for an upper-case NOT and a quoted phrase.

*What is and is not established: Shown in a fake-session probe. The effect on final ranking under live retrieval was not measured.*

Where: `packages/policy-corpus/src/retrieval/collector.ts:184`, `packages/policy-corpus/src/retrieval/backends/fulltext.ts:12`, `packages/policy-corpus/src/retrieval/backends/fulltext.ts:42`, `packages/policy-corpus/src/internal/base.ts:1`

### RETR-22 · Ten retrieval catch blocks turn any Neo4j error into an empty result without logging

**medium** · effort S · reliability

Every retrieval query site except `section_vector` sits in a bare catch that returns nothing and logs nothing: ten blocks across seven backend files, for example `packages/policy-corpus/src/retrieval/backends/keyword.ts:70` and `packages/policy-corpus/src/retrieval/backends/fulltext.ts:42`. A timeout, dropped connection or missing index is indistinguishable from no hits, and `retrievalMode` still reports "hybrid" because it tracks only the embedding call. Backends with a per-group catch continue through every type group after a failure, so the arithmetic worst case is eight groups times the 30-second timeout. Readiness does not check index presence.

**Impact.** The operator has no signal when answers are built on partial retrieval; a user may see a thinner answer or be told the corpus does not address the question.

**Fix.** Delete the in-backend catch blocks and catch once per best-effort backend in `packages/policy-corpus/src/retrieval/collector.ts`, keeping `section_vector` required. Log each failure with the backend name and error code, and return the failed-backend list beside `retrievalMode` in the search tool output. Throw when every attempted backend failed. Update the chunk-failure test in `packages/policy-corpus/tests/primitives.test.ts` to assert the failure is reported, and add a test where all best-effort backends fail in lexical mode.

*What is and is not established: The catch blocks are in current code. No production retrieval failure was observed, and the worst-case stall is arithmetic, not measured.*

Where: `packages/policy-corpus/src/retrieval/backends/keyword.ts:70`, `packages/policy-corpus/src/retrieval/backends/fulltext.ts:42`, `packages/policy-corpus/src/retrieval/backends/chunk-vector.ts:34`, `packages/agent/src/neo4j.ts:17`

### RETR-23 · The agent's planning processor re-derives question intent and injects policy-specific directives

**medium** · effort L · needless complexity, evaluation validity, test gap

`packages/agent/src/processors/answer-frame-planning.ts` (841 lines) classifies the question again with its own regexes and phrase lists and injects 57 checklist rules, about 44 of them policy-family-specific, against the boundary in `docs/architecture/README.md:17`. Its yes/no test (line 20) misses "Is X covered" phrasings that the corpus predicate accepts. Section buckets match substrings such as "therapy", so with a hand-built frame a psychotherapy telehealth question received speech-language therapy directives (line 314). Ten of fifteen unit-test questions are verbatim golden questions. The June 2026 remediation plan recorded this cleanup as done.

**Impact.** The model can be told to assert content from an unrelated policy, which it either repeats for the verifier to catch or ignores. Each rule change must be made in two packages.

**Fix.** Replace the local yes/no test with the frame's `cite_scope_and_not_covered` hint now. Expose the corpus `QueryFlags` on `AnswerFrame` and the tool output schema, and delete the planner's own question predicates. The reviews disagree on the family rule tables: the owner must choose between deleting the prior-authorization, federal and most coverage tables, restoring rules in PolicyCorpus only where repeated runs show a loss, and leaving them in place. Add a negative test for the psychotherapy case.

*What is and is not established: The psychotherapy misdirection was shown with a hand-built frame. No model run confirmed an effect on an answer.*

Where: `packages/agent/src/processors/answer-frame-planning.ts:20`, `packages/agent/src/processors/answer-frame-planning.ts:314`, `packages/policy-corpus/src/internal/query-intent.ts:286`, `docs/architecture/README.md:17`

### RETR-24 · The model's optional question-type hint overrides the router, and frame tests bypass it

**medium** · effort M · evaluation validity, test gap

`analyzeQuery` returns any `questionType` the agent model passes to `resolveAnswerFrame` (`packages/policy-corpus/src/frame/evidence-plan.ts:15`; `packages/agent/src/tools/answer-frame.ts:79`). Across 2,178 stored rows the recorded route differs from the keyword router in 672 (30.9%), and 20 of 100 questions diverge in every run. Where the route flipped between same-commit runs, scores showed no clear difference, but that comparison is underpowered. 28 of 29 frame-test resolutions force a type, so the path from router to pipeline is largely untested on the frame fixtures.

**Impact.** The owner's routing benchmark measures a router that the model overrides at run time, and pipeline flips add an unrecorded source of run-to-run variance in evaluations.

**Fix.** Fix the router first so questions the hint rescues do not regress. Re-run `analyzeQuery` offline on the 20 always-diverging questions to see which now route as the model chose. Then remove `questionType` from the tool's input schema and compare those questions over at least three runs each, acting only on a mean shift of about 0.3 with the same sign. Add a table-driven test asserting the unforced `analyzeQuery` type for every frame-fixture and golden query.

*What is and is not established: Stored scores are integers from legacy graph builds, and the recorded route also reflects the model's reworded query, so the hint's own effect is not isolated.*

Where: `packages/policy-corpus/src/frame/evidence-plan.ts:15`, `packages/policy-corpus/src/internal/query-intent.ts:432`, `packages/agent/src/tools/answer-frame.ts:79`

### RETR-25 · The concept backend matches aliases as substrings and returns the five longest tagged sections

**medium** · effort M · needless complexity, cost

On every search the concept backend picks up to two of 33 concepts by substring match on the question (`packages/policy-corpus/src/retrieval/backends/concept.ts:11`) and returns up to five of the longest linked sections at a fixed 0.7 (line 31). The alias "PA" matches inside "outpatient", "pharmacy" and "participant"; a simulation over the 55 golden questions found 13 selecting Prior Authorization that way. On the local July 2026 graph it returned five sections of 119,000 to 155,000 characters unrelated to the question. The 15,169 cross-reference edges are used by no retrieval backend.

**Impact.** Irrelevant, very long sections enter the candidate set for ordinary questions, distort document hit counts and waste context. Whether they reach a final answer frame was not measured.

**Fix.** Remove `'concept'` from `BASE_BACKENDS`, run the retrieval evaluation with and without it on isolated observability storage, and delete the backend if scores hold, recording the result beside the reranker-removal note. One review would also remove the `findConceptSections` tool. If the backend earns its place, match aliases with word boundaries and case-sensitive acronyms, as the pipeline linker does, and rank linked sections by full-text relevance. Prototype reference expansion only as a guarded, measured collector stage.

*What is and is not established: Measured on the local July 2026 graph and by simulation over the golden questions. Whether these sections reach a final frame was not measured.*

Where: `packages/policy-corpus/src/retrieval/backends/concept.ts:11`, `packages/policy-corpus/src/retrieval/backends/concept.ts:31`, `packages/policy-corpus/src/profiles/retrieval-signals.ts:8`, `packages/policy-corpus/src/primitives/references.ts:7`

### RETR-26 · Nothing checks that the agent's query embeddings match the corpus model and dimensions

**medium** · effort M · reliability, release gate, evaluation validity

The pipeline embeds under `EMBEDDING_MODEL` and sends `output_dimension`; the agent queries under `VOYAGE_MODEL` and sends none (`packages/agent/src/policy-corpus.ts:40`). `CorpusRelease` is not stamped with the model or dimensions held in the manifest, so `/readyz` cannot compare them. This is latent: both sides default to voyage-4 at 1024. A cross-family model mismatch at equal width produces no error; a non-default dimension degrades every search to flagged lexical-only. Vector indexes are created `IF NOT EXISTS` and never dropped, so a dimension change leaves the old index. `SchemaVersion` is never read by the agent.

**Impact.** After an embedding-model migration or rollback, the agent could rank sections with meaningless similarities behind a green readiness check, and a comparison run at another dimension would score the candidate without vectors.

**Fix.** Stamp `embedding_model` and `embedding_dimensions` on `CorpusRelease` in `mark_graph_release`, and compare both in the `/readyz` probe in `packages/agent/src/readiness.ts`, failing on a mismatch. Ship the stamp and re-stamp the current graph before enabling the check, since `/readyz` is the Railway healthcheck. Send `output_dimension` from one shared Voyage request builder used by the query path and the health probe. Check index dimensions in the pipeline and drop the vector indexes on reset. Remove `SchemaVersion` with its callers.

*What is and is not established: Latent: both sides default to voyage-4 at 1024 dimensions today, so nothing is wrong until a model or dimension changes.*

Where: `packages/agent/src/policy-corpus.ts:40`, `packages/pipeline/src/pipeline/release.py:298`, `packages/agent/src/readiness.ts:20`, `packages/pipeline/src/pipeline/graph/schema_version.py:5`

### RETR-27 · Specialised frame selection is not shown to surface the right section better than search

**medium** · effort L · needless complexity, evaluation validity

In five saved July 2026 runs (240 frames) the roughly 4,000 lines under `packages/policy-corpus/src/frame/` placed the labelled primary section in primary or supporting 42.5% of the time. Plain hybrid search at a June commit had it in the top six for 39.6% and the top ten for 50 to 52%; the two figures are not a controlled comparison. For seven questions routed both ways, the 33-line general pipeline held the labelled section in 17 of 26 runs against 14 of 34 for specialised pipelines, with equal mean scores.

**Impact.** The owner maintains thousands of lines of question-family rules without evidence that they put better evidence in front of the model; the agent fetched the missing section itself in about half of the cases.

**Fix.** Measure before rewriting: write a standalone script that calls the evaluation worker's `frames` mode twice per question, as routed and with `questionType: 'general'`, and report labelled-section placement per question type. It needs Voyage query embeddings, a small cost. Only if the general pipeline matches or beats the specialised ones, delete specialised selection pipeline by pipeline, coverage first, keeping statute-and-regulation pairing and amendment lookup, with named regression checks and three answer runs per arm.

*What is and is not established: From stored July 2026 runs and a June commit; the two figures are not a controlled comparison.*

Where: `packages/policy-corpus/src/frame/pipelines/coverage.ts:132`, `packages/policy-corpus/src/frame/pipelines/general.ts:24`, `packages/policy-corpus/src/frame/coverage-sections/selection/groups.ts:101`

## Low severity

### RETR-28 · An empty frame still tells the model to finalize from existing evidence

**low** · effort S · reliability, test gap

With no candidates, every pipeline returns a normal frame with empty arrays and a route computed from the question alone. The planning processor then emits "Do not widen... Finalize from the verified evidence you already have" (`packages/agent/src/processors/answer-frame-planning.ts:744`).

**Impact.** A zero-candidate frame is close to unreachable in production; the likely result is an avoidable non-answer on numeric or latest-revision questions, not a wrong one.

**Fix.** Detect an empty frame in `buildPlanMessage` and replace the outline line with an instruction to run `searchSections` or `lookupPolicy` and to say the corpus lacks the answer if those find nothing. Guard the "Finalize" and "Answer directly" rules on having primary sections. Keep the numeric and latest-revision strictness hints. Add zero-hit tests per route lane and per pipeline.

*What is and is not established: Inferred from code; a zero-candidate frame was not reproduced end to end.*

Where: `packages/agent/src/processors/answer-frame-planning.ts:744`, `packages/agent/src/processors/answer-frame-planning.ts:711`, `packages/policy-corpus/src/frame/context/finalize.ts:98`, `packages/policy-corpus/src/internal/answer-routing.ts:82`

### RETR-29 · The frame layer carries unread flags, unreachable branches and repeated section fetches

**low** · effort M · needless complexity, cost

Of 29 `QueryFlags`, 24 have no production reader; flags and signals are recomputed per pipeline; both arms of the ternary at `packages/policy-corpus/src/frame/federal-authority.ts:316` are identical; three lane branches are unreachable. A reviewer measured 25 `getSection` calls for nine sections.

**Impact.** No user-facing error was shown. The owner must change each rule in several places, and every frame pays for redundant queries.

**Fix.** Delete the behaviour-neutral parts first: collapse the identical ternary, remove the unreachable branches and unread profile fields, pass the built coverage flags into rebalance, and remove unread flags after confirming which the Jev routing evaluation scores and which the planner needs. Then, gated on the frame tests and an answer-evaluation comparison, add a per-frame `getSection` memo in `createFrameContext` and merge the duplicate flag sets into one analysis object.

*What is and is not established: No user-facing error was shown; the 25-call count is one reviewer's measurement.*

Where: `packages/policy-corpus/src/frame/federal-authority.ts:316`, `packages/policy-corpus/src/frame/evidence-plan.ts:12`, `packages/policy-corpus/src/frame/rebalance/coverage.ts:26`, `packages/policy-corpus/src/frame/pipelines/coverage.ts:137`
