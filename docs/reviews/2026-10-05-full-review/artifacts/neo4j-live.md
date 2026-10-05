# Working artifact from the neo4j-live reviewer

# neo4j-live appendix

All numbers were measured read-only on the local container `2026-03-26-medicaid-agent-neo4j-1` on 2026-10-04.

## 0. Method

- Every statement ran in a READ transaction with a 55 s timeout and a client-side guard rejecting write clauses.
- Retrieval and primitives were profiled by running the real modules (`retrieval/hybrid.ts`, `primitives/service.ts`) against a wrapped session that ran each statement plainly (timing) and again under PROFILE (plan). Statements were serialised.
- No embedding call was made: the query vector was an embedding already stored on a Section node.
- To avoid pulling multi-megabyte bodies over Bolt, the harness replaced `s.content_text AS content` with a server-side cut for bodies over 200,000 characters and added `s.content_length`. Reported body sizes are sums of `content_length` for the returned rows.
- Scratch outputs: `<review scratch directory, not kept>/neo4j-live/` (`out-*.txt`, `plans.txt`, `statements-run1.jsonl`).

## 1. Graph identity

| Item | Observed |
| --- | --- |
| Server | Neo4j 2026.05.0 community; default language CYPHER_25; store format aligned; page cache 512 MiB; heap unset |
| Store size | 6.9 GB (strings 6.2 GB, arrays 604 MB) |
| SchemaVersion / CorpusRelease / JevAnnotation / CorpusMutationLock nodes | 0 / 0 / 0 / 0 |
| Constraints | 4 of the 5 in `schema.py` (`corpus_mutation_lock_id` absent) |
| `Document.last_indexed` | 2026-07-11T16:47:41Z to 16:58:10Z for all 7,589 documents |
| Later writes | chunk ids last read 2026-07-11T19:24Z; arrays store 2026-07-18; strings store 2026-07-24 |
| Concept layer | `concept_id` index last read 2026-04-22; PolicyConcept still carries alias "HHS" removed from `seed.py` on 2026-06-11 |
| Document ids | legacy: `doc:clinical_policy:3L`, `doc:fee_schedule:url-<12 hex>`, `doc:federal_statute:ssa-title-19` (current code: `doc:<type>:<16 hex>`) |
| Plan-v3 embedding properties | 0 sections with `embedding_source_epoch`, `embedding_plan_hash` or `embedding_input_count`; chunks have no `body_start` or `input_hash` |
| Timestamp fields | `retrieved_at`, `source_checked_at`, `source_changed_at`, `source_modified_date` null on every document |
| Code at load time | about `e3a1d4c` (2026-07-10). Unchanged since: section building, `_extract_effective_date`, `resolver.py`, `concepts/`, federal parsers; `amendments.py` changed by 6 lines |

Consequence: the current generator would refuse this graph, the current loader would exclude its 247 not-answer-ready documents, and fee-schedule text is the pre-compaction baseline.

## 2. Labels and relationship types

| Label | Nodes | | Relationship | Count |
| --- | ---: | --- | --- | ---: |
| Section | 71,695 | | HAS_SECTION | 71,695 |
| Chunk | 11,477 | | NEXT_SIBLING | 62,258 |
| Document | 7,589 | | PARENT_OF | 35,950 |
| PolicyConcept | 33 | | COVERS | 25,439 |
| | | | HAS_CHUNK | 11,477 |
| | | | REFERENCES | 10,826 |
| | | | AMENDS | 5,079 |
| | | | REFERENCES_DOCUMENT | 4,343 |
| | | | RESTRICTS | 1,057 |
| | | | DEFINES | 463 |
| | | | SUPERSEDED_BY | 2 |

Document nodes: 3,320 source documents, 4,267 synthetic `change_notice`, 2 superseded CFR stubs.

## 3. Indexes

| Index | Type | On | readCount | Last read |
| --- | --- | --- | ---: | --- |
| section_id (unique) | RANGE | Section.id | 3,107,464 | 2026-10-05 |
| doc_id (unique) | RANGE | Document.id | 362,989 | 2026-10-05 |
| section_document_id_section_number | RANGE | Section(document_id, section_number) | 124,248 | 2026-10-05 |
| doc_document_type | RANGE | Document.document_type | 104,487 | 2026-10-05 |
| concept_id (unique) | RANGE | PolicyConcept.id | 91,833 | 2026-04-22 |
| chunk_id (unique) | RANGE | Chunk.id | 79,455 | 2026-07-11 |
| doc_policy_number | RANGE | Document.policy_number | 42,598 | 2026-10-05 |
| section_embeddings | VECTOR | Section.embedding | 39,864 | 2026-10-05 |
| chunk_embeddings | VECTOR | Chunk.embedding | 27,573 | 2026-10-05 |
| section_fulltext | FULLTEXT | Section(title, content_text) | 26,146 | 2026-10-05 |
| doc_status | RANGE | Document.status | 2 | 2026-10-05 |
| doc_answer_ready | RANGE | Document.answer_ready | 0 | never |
| doc_authority_tier | RANGE | Document.authority_tier | 0 | never |
| doc_corpus_bucket | RANGE | Document.corpus_bucket | 0 | never |
| doc_retrieval_ready | RANGE | Document.retrieval_ready | 0 | never |
| doc_variant_group | RANGE | Document.variant_group | 0 | never |

Vector indexes: provider vector-3.0, 1024 dimensions, COSINE, hnsw.m 16, ef_construction 100, quantization enabled (all defaults except dimensions and similarity). Full-text: analyzer `standard-no-stop-words`, not eventually consistent. No index on `Document.title` or `Document.source_url`, both of which are used as lookup keys.

## 4. Documents per type against the manifest

| document_type | In manifest | Documents | answer_ready | retrieval_ready | Sections | Characters |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| dhhs_policy | yes | 1,237 (204 amendment) | 1,235 | 1,237 | 16,061 | 11,854,943 |
| fee_schedule | yes | 943 | 943 | 262 | 5,057 | 2,677,033,374 |
| state_plan_amendment | yes | 331 (8 amendment) | 331 | 331 | 8,315 | 11,015,218 |
| managed_care_guidance | yes | 217 | 5 | 217 | 7,900 | 6,736,526 |
| bulletin | yes | 208 | 206 | 208 | 6,371 | 7,756,012 |
| clinical_policy | yes | 177 | 171 | 177 | 13,238 | 11,548,771 |
| managed_care_contract | yes | 100 | 98 | 100 | 4,604 | 26,707,318 |
| federal_regulation | yes | 43 + 2 stubs | 43 | 43 | 3,452 | 11,574,036 |
| provider_manual | yes | 34 | 34 | 34 | 651 | 4,500,613 |
| billing_guidance | yes | 16 | 0 | 16 | 1,867 | 2,875,884 |
| waiver | yes | 12 | 12 | 12 | 3,852 | 4,350,336 |
| federal_statute | yes | 2 | 2 | 2 | 327 | 5,498,486 |
| beneficiary_guidance | yes | 0 (family added 2026-07-30) | | | | |
| change_notice | no (synthetic) | 4,267 | 4,267 | 0 | 0 | 0 |

Total text 2,781,451,517 characters; fee schedules are 96.2% of it in 7% of the sections.

## 5. Property coverage

Document (7,589): title, document_type, status, source_url, authority_tier, answer_ready, retrieval_ready, section_count and last_indexed present on all; policy_number 5,066 (799 of the 3,322 non-synthetic); category 7,197; answer_role 3,320; source_format 7,588; effective_date 4,645 (376 non-synthetic, non-stub); corpus_bucket and variant_group 943 (fee schedules only); variant_date 5,158; empty source_url 1; empty local_path 4,314; page_count 0 on 4,557.

Dates on source documents: clinical_policy 172 of 177 (24 are YYYY-01-01, 2 are in the future); dhhs_policy 204 of 1,237 (change notices only, all YYYY-01-01); every other family 0.

Section (71,695): document_id, level, content_length, has_tables and has_definitions on all; title 70,634; section_number 13,216; neither title nor number 1,061; has_tables true 8,100; has_definitions true 723; federal_register_cite 2,162; last_revised 2,079; embedding 56,102. Levels: 0: 1,061; 1: 58,891; 2: 8,104; 3: 3,352; 4: 280; 5: 7.

Chunk (11,477): keys are id, section_id, chunk_index, content_length, content_text, embedding; one chunk has no embedding.

## 6. Section size distribution

| Type | Sections | p50 | p90 | p99 | Max | Empty | Under 50 | Over 6,000 | Over 100k | Over 1M |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| fee_schedule | 5,057 | 6,676 | 83,088 | 16,236,579 | 38,489,101 | 1,735 | 21 | 2,722 | 465 | 228 |
| managed_care_contract | 4,604 | 796 | 9,704 | 102,200 | 333,139 | 583 | 70 | 670 | 47 | 0 |
| dhhs_policy | 16,061 | 333 | 1,688 | 5,450 | 103,400 | 2,840 | 613 | 129 | 1 | 0 |
| federal_regulation | 3,452 | 1,465 | 8,037 | 25,516 | 134,964 | 48 | 3 | 500 | 1 | 0 |
| clinical_policy | 13,238 | 252 | 1,489 | 9,610 | 194,511 | 2,035 | 1,213 | 218 | 9 | 0 |
| state_plan_amendment | 8,315 | 431 | 2,882 | 13,677 | 132,400 | 1,395 | 593 | 338 | 1 | 0 |
| bulletin | 6,371 | 205 | 2,467 | 15,850 | 198,654 | 1,341 | 133 | 250 | 6 | 0 |
| managed_care_guidance | 7,900 | 265 | 1,325 | 9,286 | 95,168 | 1,537 | 446 | 132 | 0 | 0 |
| federal_statute | 327 | 3,427 | 24,974 | 218,355 | 815,229 | 0 | 1 | 119 | 11 | 0 |
| provider_manual | 651 | 555 | 2,417 | 10,349 | 3,627,304 | 51 | 15 | 14 | 2 | 1 |
| waiver | 3,852 | 298 | 2,503 | 12,022 | 77,435 | 520 | 431 | 129 | 0 | 0 |
| billing_guidance | 1,867 | 507 | 2,767 | 22,363 | 28,062 | 263 | 6 | 112 | 0 | 0 |
| All | 71,695 | | | | 38,489,101 | 12,348 | 3,545 | 5,333 | 543 | 229 |

Empty sections: 12,348 (17.2%); 10,956 of them have no non-empty child. Two bulletins and two DHHS documents consist only of empty sections.

Leaf sections past the 6,000-character read limit:

| Type | Truncated leaves | Share of leaf text past the limit |
| --- | ---: | ---: |
| fee_schedule | 2,700 | 99.3% |
| provider_manual | 13 | 86.6% |
| managed_care_contract | 663 | 68.7% |
| federal_statute | 102 | 64.8% |
| clinical_policy | 207 | 33.9% |
| bulletin | 234 | 33.0% |
| federal_regulation | 500 | 32.6% |
| billing_guidance | 93 | 30.3% |
| managed_care_guidance | 116 | 28.2% |
| state_plan_amendment | 304 | 19.7% |
| waiver | 123 | 18.4% |
| dhhs_policy | 127 | 10.2% |

Core Medicaid parts: 431: 7 of 120 sections (8.6% of text); 435: 15 of 153 (20.1%); 438: 21 of 104 (30.6%); 440: 3 of 62 (16.4%); 441: 13 of 139 (22.0%); 447: 13 of 71 (29.4%); 457: 11 of 161 (20.9%).

## 7. Embedding coverage (non-empty sections)

| Type | Non-empty | Direct vector | Chunked | Neither |
| --- | ---: | ---: | ---: | ---: |
| dhhs_policy | 13,221 | 13,157 | 64 | 0 |
| clinical_policy | 11,203 | 11,055 | 148 | 0 |
| state_plan_amendment | 6,920 | 6,720 | 200 | 0 |
| managed_care_guidance | 6,363 | 6,280 | 83 | 0 |
| bulletin | 5,030 | 4,900 | 130 | 0 |
| managed_care_contract | 4,021 | 3,531 | 490 | 0 |
| federal_regulation | 3,404 | 3,106 | 298 | 0 |
| waiver | 3,332 | 3,276 | 56 | 0 |
| fee_schedule (ready) | 307 | 94 | 213 | 0 |
| fee_schedule (not ready) | 3,015 | 1,640 | 1,375 | 0 |
| billing_guidance | 1,604 | 1,518 | 86 | 0 |
| provider_manual | 600 | 592 | 8 | 0 |
| federal_statute | 327 | 233 | 94 | 0 |

Chunks per chunked section: median 2, p90 6, maximum 246. Legacy chunker artefact: 1,285 sections have a single chunk, including 836 fee-schedule sections totalling 2.59 GB (one vector for a body of up to 38.5 MB). 3,545 direct-embedded sections have fewer than 50 characters of body.

## 8. Fee-schedule representation

| Format | Bucket | retrieval_ready | Documents | Sections | Characters | Largest section |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| xlsx | archive | false | 407 | 547 | 2,195,062,766 | 21,819,822 |
| xlsx | companion | false | 39 | 53 | 153,787,059 | 21,764,111 |
| xlsx | history | true | 113 | 130 | 132,948,172 | 21,785,989 |
| xlsx | primary | true | 136 | 160 | 110,506,257 | 38,489,101 |
| pdf | companion | false | 174 | 3,266 | 70,820,386 | 2,215,146 |
| pdf | archive | false | 60 | 868 | 12,111,447 | 810,118 |
| pdf | primary | true | 7 | 12 | 1,739,871 | 860,296 |
| pdf | history | true | 6 | 10 | 53,894 | 23,503 |
| pdf | reference | false | 1 | 11 | 3,522 | 886 |

One spreadsheet sheet is one section. 146 variant groups; 66 have more than one retrieval-ready document; 52 documents have no variant_date. Primary variant dates: 2011: 2, 2012: 2, 2016: 1, 2017: 1, 2019: 2, 2020: 4, 2021: 22, 2022: 64, 2025: 1, none: 44.

## 9. Edges

References: REFERENCES 10,826 (federal_regulation 5,357; section 3,492 with 849 empty targets; attachment 1,240 with 255 empty targets; ssa_section 737). REFERENCES_DOCUMENT 4,343 (clinical_policy 2,591 to 174 targets; waiver 1,083 to 2 targets; federal_regulation 612; state_plan_amendment 57). All extraction_method regex. Sections with any outbound reference: clinical 2,259 of 11,203; SPA 1,426 of 6,920; contracts 975 of 4,021; DHHS 80 of 13,221. Unresolved ledger from the same run: 4,552 (attachment 1,351; section 1,016; waiver 1,005, of which 1915(b) 811; federal_regulation 981; cross_document 144; spa 34; ssa_section 21).

Amendments: change_notice to clinical_policy 4,267 edges onto 125 policies (median 21 per policy, p90 67, maximum 251; 18 policies exceed the 50-row limit); dhhs_policy to dhhs_policy 811 edges from 193 notices onto 209 bases (maximum out-degree 26; 75 notices fan out to several documents sharing a policy number); SPA 1. Ties at the newest date: DHHS 56 of 209 bases, clinical 34 of 125 (maximum tie 54).

Supersession: 45-CFR-74 and 45-CFR-75 point to 2-CFR-200, effective 2025-10-01.

Concepts (33; edges last written 2026-04-22): CMS 3,773; DHHS 3,307; Prior Authorization 2,573; Medical Necessity 2,191; Individual Support Plan 1,944; EPSDT 1,917 (RESTRICTS 525); Fair Hearing 1,245; Level of Care Determination 1,067; MCO 1,063; NC Innovations Waiver 901; lowest: Functional Eligibility 2.

## 10. Retrieval profiles (real pipeline, serial)

| Scenario | Type groups | Statements | Sum of wall ms | Sum of db hits | Rows | Body characters returned |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A baseline: personal care services in an adult care home | 5 | 27 | 4,334 | 2,754,054 | 682 | 10,988,363 |
| C federal: 42 CFR 438.6 | 3 | 17 | 3,526 | 2,028,932 | 528 | 12,567,031 |
| D change notice: MA-2270 | 5 | 44 | 2,851 | 2,969,391 | 760 | 11,833,843 |
| E documentTypes ['change_notice'] | 1 | 9 | 236 | 486,642 | 0 | 0 |
| B operational: CPT 99213 fee schedule | 8 | 42 | 50,503 | 4,307,575 (excludes the 45 s statement) | 932 | 749,666,673 |

Scenario A by backend:

| Backend | Statements | ms | db hits | Body characters |
| --- | ---: | ---: | ---: | ---: |
| section_keyword | 5 | 1,716 | 729,427 | 4,079,587 |
| fulltext | 5 | 698 | 1,912,063 | 2,252,449 |
| chunk_vector | 5 | 341 | 14,194 | 2,341,663 |
| section_vector | 5 | 774 | 9,945 | 163,177 |
| document_keyword | 5 | 389 | 17,049 | 171,135 |
| title expansion | 1 | 296 | 67,511 | 1,009,339 |
| concept | 1 | 120 | 3,865 | 971,013 |

Notable statements: section_keyword on fee_schedule (13 terms) 45,970 ms and 44,951 ms, 40 rows, 685,134,392 characters; document_keyword on fee_schedule 882 ms, 10 rows, 47,153,331 characters; section_keyword on the six-type federal implementation group 1,762 ms, 807,001 db hits, 46,721 sections scanned; section_keyword on federal_statute 143 to 186 ms, 40 rows, about 3.3 MB; fulltext per group 345k to 394k db hits with 45k to 51k rows yielded by the procedure.

Plan shapes: vector: ProcedureCall (200), Expand, Filter, Top. Keyword: NodeIndexSeek on document_type, Expand, Filter, Projection (reduce), Top. Fulltext: ProcedureCall (about 52k), Filter, Expand, Filter, Top. Expansion: NodeByLabelScan (7,589), Filter on title, Expand, Top. amendment_context: DirectedRelationshipTypeScan over 5,079 AMENDS.

What-if variants of the keyword statement: clinical_policy as issued 592 ms, lower-casing once 215 ms; fee_schedule as issued 44.9 s, lower-casing once 10.9 s, with `AND d.retrieval_ready` 4.2 s (77.8 MB), with both 1.2 s.

Operator tally over 203 statements: Projection 474, Filter 419, CacheProperties 238, Expand 219, Top 184, ProcedureCall 72, OptionalExpand 67, NodeIndexSeek 50, NodeUniqueIndexSeek 50, EagerAggregation 43, Sort 33, NodeByLabelScan 31, VarLengthExpand 22, AntiSemiApply 22, DirectedRelationshipTypeScan 8; CartesianProduct 0; Eager 0.

## 11. Primitive profiles (real primitives)

| Call | ms | db hits | Rows | Tool output characters |
| --- | ---: | ---: | ---: | ---: |
| getSection, Policy 3L section 3.3 | 66 | 42 | 1 | 2,303 |
| getSection, SSA 1902 (815,229 characters) | 3 | 35 | 1 | 6,000 of body returned |
| getSection, 38.5 MB fee-schedule sheet | 33 | 35 | 1 | 6,000 of body returned |
| getSection, empty container with 86 children | 46 | 2,755 | 2 statements | 6,931 |
| getDocument, waiver with 933 sections | 50 | 6,659 | 1 | 88,463 |
| getDocument, Policy 3K-2 | 5 | 2,970 | 1 | 41,434 |
| followReferences, 180 references | 262 | 2,765 | 180 | 44,293 |
| getAmendments, MA-2270 | 237 | 360 | 15 | 15,544 |
| getAmendments, Policy 3K-2 | 21 | 1,936 | 50 of 251 | 43,042 |
| lookupPolicy '3L' | 173 | 16,476 | 2 | 21,090 |
| lookupPolicy '1A-1' | 17 | 23,880 | 25 | 58,636 |
| lookupPolicy '8A' | 14 | 25,589 | 25 | 110,037 |
| lookupPolicy '1' | 42 | 133,693 | 25 | 171,985 |
| lookupPolicy '1915(c)' | 18 | 36,387 | 4 | 313,299 |
| findConceptSections 'Prior Authorization' | 54 | 47,553 | 2,573 | 693,868 |
| findConceptSections 'CMS' | 52 | 66,305 | 3,773 | 1,038,976 |
| findConceptSections EPSDT, RESTRICTS | 48 | 10,139 | 525 | 149,000 |
| findConceptSections EPSDT, GOVERNS | 47 | 1 | 0 | 2 |

getSectionContext sibling statement by family size:

| Siblings | db hits | Largest operator rows | ms | Output characters |
| ---: | ---: | ---: | ---: | ---: |
| 49 | 10,723 | 1,275 | 14 | 5,282 |
| 95 | 45,862 | 4,656 | 14 | 13,808 |
| 146 | 122,167 | 10,878 | 28 | 17,936 |
| 198 | 176,384 | 19,900 | 29 | 20,850 |
| 271 | 338,978 | 37,128 | 52 | 38,019 |
| 462 | 978,877 | 107,416 | 146 | 47,217 |
| 514 | 1,486,045 | 132,870 | 195 | 63,608 |
| 756 | 2,419,438 | 286,903 | 385 | 83,816 |
| 2,363 | 27,763,544 | 2,795,430 | 4,459 | 316,342 |

Root sections per document: median 1, p90 25, p99 147, maximum 757; 60 documents exceed 100 and 6 exceed 500. All 43 CFR parts are flat.

lookupPolicy across all stored policy numbers: clinical_policy 6 of 176 return another policy first; dhhs_policy 0 of 251; federal_regulation 0 of 45; state_plan_amendment 0 of 197.

## 12. Vector coverage: overscan 200 then filter, against the exact per-group top 40

Twenty stored section embeddings as query vectors. Each cell is mean hits returned (of 40 wanted) / recall against the exact top 40 / queries with zero hits.

| Query drawn from | clinical_policy | dhhs_policy | federal_regulation | federal_statute | bulletin + SPA + waiver + manual |
| --- | --- | --- | --- | --- | --- |
| clinical_policy (5) | 40.0 / 1.00 / 0 | 4.8 / 0.12 / 2 | 0.6 / 0.02 / 3 | 0.0 / 0.00 / 5 | 12.2 / 0.31 / 0 |
| dhhs_policy (5) | 4.8 / 0.12 / 2 | 40.0 / 0.99 / 0 | 0.8 / 0.02 / 3 | 0.2 / 0.01 / 4 | 13.2 / 0.33 / 2 |
| federal_regulation (4) | 19.5 / 0.48 / 1 | 13.5 / 0.34 / 1 | 37.8 / 0.94 / 0 | 1.8 / 0.04 / 1 | 23.5 / 0.59 / 0 |
| federal_statute (3) | 15.7 / 0.39 / 1 | 19.0 / 0.47 / 0 | 14.3 / 0.36 / 0 | 18.7 / 0.47 / 0 | 35.7 / 0.89 / 0 |
| bulletin (3) | 0.0 / 0.00 / 3 | 2.3 / 0.06 / 0 | 0.0 / 0.00 / 3 | 0.0 / 0.00 / 3 | 40.0 / 1.00 / 0 |

ANN recall@200 against exact cosine: 196, 200, 198, 200 and 197 of 200 (mean 0.991). Vectors by type in the section index: dhhs 13,157; clinical 11,055; SPA 6,720; managed-care guidance 6,280; bulletin 4,900; contracts 3,531; waiver 3,276; federal_regulation 3,106; fee_schedule 1,734; billing 1,518; provider_manual 592; federal_statute 233. Chunk index: 11,476 vectors, 5,097 of them fee_schedule.

## 13. Full-text semantics

| Lucene query | Hits |
| --- | ---: |
| `personal care services` (as the backend sends it) | 28,190 |
| `"personal care services"` (true phrase) | 453 |
| `\"personal care services\"` (user quotes after escapeLucene) | 28,190 |
| the full question as escaped by fulltext.ts | 52,541 |
| `does in an the of for` | 54,960 |
| `3K\-2` (after escapeLucene) | 11,555 |
| `"3K-2"` | 45 |
| `eligible` / `eligibility` | 5,956 / 7,918 |
| `reimburse` / `reimbursement` | 573 / 3,045 |

## 14. Concept selection by the concept backend's own predicate

| Question | Selected concepts (matching alias) |
| --- | --- |
| What is the payment rate for dental services? | Prior Authorization (PA) |
| Is a pacemaker covered for a hospital patient? | Prior Authorization (PA), PACE |
| Does Medicaid pay for a space heater? | Prior Authorization (PA), PACE |
| Which local health departments participate? | Level of Care Determination (LOC), Prior Authorization (PA) |
| What changed in the latest amendment to the state plan? | Durable Medical Equipment (DME) |
| Who made the eligibility decision? | Medicaid to the Disabled (MAD) |
| What is the dispensing fee for pharmacies? | Individual Support Plan (ISP) |
| How is patient liability calculated for nursing home residents? | Prior Authorization (PA) |
| How do I appeal a denial of CAP/DA services? | Fair Hearing (appeal), CAP/DA |
| Does NC Medicaid cover personal care services in an adult care home? | Personal Care Services |

## 15. Server and vendor facts checked live

- EXPLAIN of the statement in `section-vector.ts` returns `01N01: db.index.vector.queryNodes is deprecated. It is replaced by SEARCH.`
- `MATCH (s:Section) SEARCH s IN (VECTOR INDEX section_embeddings FOR $embedding LIMIT 5) SCORE AS score` plans on this server.
- The same statement with `WHERE s.document_id = 'x'` inside SEARCH fails with `22ND3` (not an additional property of the index); with `IN [...]` it fails as unsupported syntax.
- Neo4j Cypher Manual (current): SEARCH introduced in 2026.01; additional index properties for filtering in 2026.01; `IN` in filters from 2026.06; `queryNodes` deprecated in 2026.04; `vector.quantization.enabled` deprecated in 2026.06 and the default quantization type becomes binary in 2026.08; native VECTOR properties need block format (Enterprise or Aura); `db.create.setNodeVectorProperty` stores vectors more compactly than SET.
- Loading one body: 38.5 MB in 26 to 48 ms; `toLower(...) CONTAINS` on it 54 ms; the eight-term reduce 434 ms.
