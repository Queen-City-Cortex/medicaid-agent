# Working artifact from the rag-design reviewer

## A. Local graph identity (read before any conclusion)

- Container `neo4j:2026.05-community`. No `SchemaVersion`, `CorpusRelease` or `JevAnnotation` node. `Document.last_indexed` 2026-07-11T16:47Z to 16:58Z. Legacy document ids (`doc:clinical_policy:10A`), so it predates the immutable-id migration.
- 7,589 Document, 71,695 Section, 11,477 Chunk, 33 PolicyConcept. No `embedding_plan_hash` or `embedding_source_epoch` on any section and no `body_start` on chunks: embeddings predate plan v3. Statements about what is embedded today come from code; the graph was used for structure, lengths and text samples.
- Section length: median 375, p90 3,872, p99 58,481, max 38,489,101 characters; 12,348 empty; 5,333 over 6,000 (5,182 leaves); 3,244 over 9,000.

| Type | Sections | Empty | Over 6,000 | Leaf over 6,000 | Median | Max |
|---|---|---|---|---|---|---|
| dhhs_policy | 16,061 | 2,840 | 129 | 127 | 333 | 103,400 |
| clinical_policy | 13,238 | 2,035 | 218 | 207 | 252 | 194,511 |
| state_plan_amendment | 8,315 | 1,395 | 338 | 304 | 431 | 132,400 |
| fee_schedule | 5,057 | 1,735 | 2,722 | 2,700 | 6,676 | 38,489,101 |
| managed_care_contract | 4,604 | 583 | 670 | 663 | 796 | 333,139 |
| federal_regulation | 3,452 | 48 | 500 | 500 | 1,465 | 134,964 |
| federal_statute | 327 | 0 | 119 | 102 | 3,427 | 815,229 |

Samples as stored: a typical section is Policy 3K-2 § 2.1.1 'General' (470 characters of template text). A table section is a 'Revision Information:' markdown table padded to column width. A fee-schedule section is one worksheet (title 'Update as of 10-19-2022') of ` | `-joined rows. An amended policy (8C) has 155 `change_notice` documents with dates from 2005-05-01 to 2025-04-15, zero sections each, and the change text on the AMENDS edge. A chunk (legacy chunker) starts with `42 CFR Part 438 > Medical loss ratio (MLR) standards`.

## B. Relationships traversed at query time

| Relationship | Edges (local) | Used by | Comment |
|---|---|---|---|
| HAS_SECTION | 71,695 | every backend and primitive | join |
| HAS_CHUNK | 11,477 | chunk_vector | matched chunk discarded |
| PARENT_OF, NEXT_SIBLING | 35,950 / 62,258 | getSection (container), getSectionContext, embedding breadcrumb | tree navigation |
| AMENDS | 5,079 | getAmendments, amendment_context, amendment-title expansion | dated rows, no prior text |
| SUPERSEDED_BY | 2 | lookupPolicy | two federal parts |
| REFERENCES, REFERENCES_DOCUMENT | 10,826 / 4,343 | followReferences tool only | never used for retrieval |
| COVERS, DEFINES, RESTRICTS | 26,959 | concept backend, findConceptSections | 33 seeded terms, mention edges |

## C. Changes ranked by expected effect on answer correctness, with a test in the existing harness

1. **Return and read the matched passage.** Chunk hits return chunk offsets; getSection takes an offset; frames hydrate matching windows. Test: add an evidence-reachability check to `eval --level retrieval` and eight to ten questions answered past offset 6,000; three answer runs before and after.
2. **As-of-date guard.** Date in every QueryAnalysis; compare with AMENDS rows and CFR last_revised; mandatory caveat or abstention; verifier rule. Test: ten new dated questions plus deterministic unit tests.
3. **Per-claim verification with evidence handles, on a different model family.** Test: seeded-error set (50 released answers with one injected fault each, plus the 50 originals); report detection and false-withhold rates over three repeats.
4. **Topic-disjoint held-out set and ablations.** 60 to 100 new questions from untouched policies and families; flags for planner-checklist off and prefetch off. Test: `scripts/eval-ab.sh agent` with DATASET set to the new file; paired differences.
5. **Repair the negative lane.** Scope is § 1.0 and specific criteria; relabel ten golden negatives; absence-based answers say so and look for the governing policy. Test: `eval --level answer --reasoning-type negative_answer` and the retrieval level on the new labels.
6. **Conversation-aware retrieval.** Self-contained restatement for the frame and the verifier; no prefetch for non-questions. Test: 15 two-turn cases through an extended CLI runner.
7. **Structured fee-schedule lookup and compact tables.** Row records plus a lookup tool. Test: 15 code-and-date questions scored by exact match.
8. **Evaluation statistics.** Three or more runs, paired clustered standard errors, gate on a bound, per-claim hallucination metric, validated references. Test: re-analyse existing same-configuration runs to calibrate the false-alarm rate of the current rule.

Simplifications worth an A/B rather than an argument: remove the concept backend; fold three keyword scans into one contextual fulltext leg and fuse by rank; drop observational memory.

## D. Where the system overfits, and how to measure generalisation honestly

- Topic-specific predicates fire on 28 of 55 golden questions, 27 of 50 paraphrases and 2 of 25 fresh questions.
- Source carries golden evidence section numbers (`'3.2.1'`, `'3.3'`, `'4.2.1.2'`; eleven CFR section numbers for the waiver questions), reference-answer components (ordering practitioner, written plan of care, 60 days), four federal hints for a five-question category, and six comments naming question ids.
- The golden set labels 33 documents; 156 of 177 clinical policies and six source families are untouched.
- The paraphrase set shares topics, evidence and routing triggers with the golden set, and its ids are stale.

Honest measurement: a frozen, topic-disjoint set written from documents by someone who has not seen system output; stratified by family, policy and question type, including unanswerable, as-of-date, multi-turn and table lookups; passage-level labels; report both sets with clustered confidence intervals; run the ablations above; treat any heuristic that names a section number or programme as suspect until it helps on the disjoint set. Track withhold rate and false-withhold rate as first-class metrics next to answer quality.

## E. External practice checked on the web (2026-10-04)

- Anthropic, 'Introducing Contextual Retrieval': contextual embeddings plus contextual BM25 cut top-20 retrieval failures by 49% (5.7% to 2.9%), 67% with reranking (vendor benchmark). The project already prepends a heading breadcrumb to embeddings; its lexical index does not see that context.
- Voyage AI documents contextualized chunk embeddings (`voyage-context-3`; the current quickstart shows `voyage-context-4`). Worth an A/B for non-spreadsheet families after change 1; tokenizer pins and the client would need extending.
- Neo4j: vector search with filters via the Cypher 25 `SEARCH` clause, generally available from 2026.02 in all editions; filter properties are declared at index creation; `IN` predicates from 2026.06.
- Elastic documents reciprocal rank fusion with a default rank constant of 60; it needs no score calibration.
- Anthropic citations and search-result content blocks return the cited block text with each claim and cite whole blocks.
- FActScore (EMNLP 2023) and SAFE (arXiv 2403.18802) decompose an answer into atomic claims and verify each.
- Anthropic, 'A statistical approach to model evaluations': standard errors, clustering for related questions, paired differences.
