# Corpus data quality: parsing, graph, references and federal text: all issues

The write side is sound: each document loads in one transaction, embedding plans are lossless and hash-bound, and federal downloads are validated before a cache is replaced. The risk is in content and authority metadata. Statute sections carry editorial notes and not-yet-effective amendments as law, and the statute's only source has served a maintenance page since 3 October, which stops every release build. Effective dates are wrong for about a third of clinical policies and invented for change notices. Fee schedules have been frozen since November 2022 but are labelled current. Revision rows are loaded as documents; list markers, heading hierarchy and tables are degraded. The verifier cannot catch these defects because it checks answers against the same stored text. Most figures come from a July 2026 local graph; production was not inspected. I would settle the statute source first, then fix dates, retire fee schedules and reload once.

## What is working

- `packages/pipeline/src/pipeline/graph/corpus_writer.py` is a single write boundary: one transaction per document, retry-safe merges and document-scoped cleanup, with rollback tests in `packages/pipeline/tests/test_corpus_writer.py:333-371`. All 71,695 local sections had exactly one owner and no cross-document hierarchy edges.
- The embedding planner (`packages/pipeline/src/pipeline/embeddings/planner.py`, `packages/pipeline/src/pipeline/embeddings/plan_graph.py:136-158`) uses lossless windows with exact offsets, a pinned local tokenizer, disabled truncation and a plan hash; coverage is recomputed from section bodies instead of trusted flags.
- `packages/pipeline/src/pipeline/identity.py` derives document ids from the canonical source URL only, and the loader refuses ambiguous duplicate artifacts (`packages/pipeline/src/pipeline/graph/loader.py:512-566`) instead of choosing one silently.
- Federal downloads are validated before a cache is replaced (`packages/pipeline/src/pipeline/federal/ecfr_client.py:66-96`, `packages/pipeline/src/pipeline/federal/ssa_client.py:126-144`); on 5 October 2026 the statute validator rejected the source's maintenance pages instead of loading them.
- The Social Security Act to United States Code mapping (`packages/pipeline/src/pipeline/federal/ssa_client.py:33-119`) matched each page's own source credit for all 68 mapped headings that were checked.
- Parse artifacts are written atomically with fsync and rename (`packages/pipeline/src/pipeline/parse/converter.py:904-915`) and bound by SHA-256 in the sidecar; failures leave typed sidecars, and the inventory fails closed on an empty registry.

## High severity

### DATA-1 · Statute text includes editorial notes and future amendments, and its only source is down

**high** · effort M · deadline 2027-01-01 · wrong-answer risk, data quality, release gate, reliability

`parse_usc_subchapter` (`packages/pipeline/src/pipeline/federal/ssa_parser.py:120-123`) stores everything between two section headings as statute text: on the cached United States Code pages 48% of Title XIX text follows the source-credit line, and 89 of 553 local chunks contain 'read as follows', including a rewording of section 1902(a)(34) that applies from 1 January 2027. `_split_statute_subsections` (`:174-180`) fabricates or mislabels 9 of 258 children. Separately, both `USC_URLS` in `packages/pipeline/src/pipeline/federal/ssa_client.py:21` returned maintenance pages on 5 October 2026, so every release build stops at the statute stage.

**Impact.** An attorney can be given superseded or not-yet-effective wording as current law, or a pin cite such as 1917(i) that does not exist. The owner cannot complete a release build today.

**Fix.** Decide whether to accept GovInfo's Statute Compilations (COMPS-8765 and COMPS-8770) as the statute source; otherwise repair the parser to keep only the statute field. Before switching, spot-check two or three provisions with delayed effective dates. Then add a small adapter that takes children from the XML `subsection` elements and drops footnotes, keep the six anchor checks and document ids, point `source_url` at GovInfo, record the current-through public law, and delete the HTML parser and subsection splitter. Re-ingest before January 2027.

*What is and is not established: No retrieval was run. Parser figures come from the June 2026 cache and local graph. The compilation's legal equivalence and its handling of delayed-effective amendments are unverified.*

Where: `packages/pipeline/src/pipeline/federal/ssa_parser.py:120`, `packages/pipeline/src/pipeline/federal/ssa_parser.py:174`, `packages/pipeline/src/pipeline/federal/ssa_client.py:21`, `packages/pipeline/src/pipeline/release.py:235`

### DATA-2 · Policy effective dates are wrong, impossible or fabricated, and revision chains are incomplete

**high** · effort M · wrong-answer risk, data quality, test gap

`_extract_effective_date` (`packages/pipeline/src/pipeline/graph/loader.py:259-293`) takes the string maximum of every date in a clinical policy's history section and invents `YYYY-01-01` for change notices. Of 174 local clinical policies with an `Amended Date:` banner, the stored date matches it in 94 and is older in 60; 11A-10 and 1E-3 are dated 2105 and 2028. Invented notice dates are off by a median of 149 days across 202 local notices. `_parse_revision_rows` (`packages/pipeline/src/pipeline/references/amendments.py:156`) accepts the 2105 row and a month 00, and its heading filter leaves 48 policies without an amendment chain.

**Impact.** An attorney asking when a policy was last amended can receive a date years too early, or for 11A-10 a revision dated 2105. The verifier checks both against the same stored values.

**Fix.** Read the first title-block `Amended Date:` banner for clinical policies, or `Effective Date:` after `Policy No:`, falling back to the latest valid revision row. Parse each change notice's header `DATE:` line in its six observed shapes, otherwise store null, and print it as `Dated:`. Build dates with `datetime.date` in one shared helper that rejects rows more than 366 days after `source_changed_at`. Widen the heading match to 'history'. Add tests for the 10C, 1E-3, 2105 and month-00 shapes; reload.

*What is and is not established: Measured on local parses and the July 2026 local graph with current loader code; production was not inspected and no wrong answer was reproduced.*

Where: `packages/pipeline/src/pipeline/graph/loader.py:259`, `packages/pipeline/src/pipeline/references/amendments.py:156`, `packages/policy-corpus/src/primitives/policy-lookup.ts:80`, `packages/agent/src/processors/verifier/evidence.ts:108`

### DATA-3 · Fee schedules frozen since November 2022 are labelled primary and current for rate questions

**high** · effort M · wrong-answer risk, data quality, cost, needless complexity

The fee-schedule family in `corpus-manifest.json:112-119` crawls an agency page that stopped receiving updates on 3 November 2022; later schedules are on a separate site that is not crawled. None of the 1,998 registry rows carries a 2023 to 2026 date, yet current code labels 189 files `primary`, `packages/pipeline/src/pipeline/graph/loader.py:451` marks every document `current`, and reimbursement wording adds the family to retrieval with a boost. In the July 2026 local graph the family is 96% of stored text and about nine tenths of embedding tokens.

**Impact.** A provider or case manager asking what NC Medicaid pays can be quoted a rate at least four years old from a document described as current, and the verifier accepts it.

**Fix.** Remove `['fee_schedule']` from `OPERATIONAL_TYPE_GROUPS` in `packages/policy-corpus/src/internal/scoring-constants.ts`, delete `scoreFeeScheduleBuckets`, and stop embedding the family. Write `status='archived'` for fee schedules in the loader and stop assigning the `primary` bucket. Mark the manifest family frozen so the daily crawl stops re-validating about 2,000 files. For narrowly matched rate questions, add a `requirements` entry in `resolveCoverageScope` stating that the corpus holds no schedule after 2 November 2022. Add four or five fee questions to the golden set.

*What is and is not established: No stale-rate answer was observed: stored runs cite no fee schedules and the golden set has no fee question. Changing scope policy requires renewed scope approvals under issue #188.*

Where: `corpus-manifest.json:119`, `packages/pipeline/src/pipeline/graph/loader.py:451`, `packages/policy-corpus/src/internal/scoring-constants.ts`, `docs/operations/fee-schedule-compaction.md:43`

## Medium severity

### DATA-4 · Two current MA-2180 manuals tie in lookup, and document id order picks one

**medium** · effort S · wrong-answer risk, data quality, test gap

The loader sets no `effective_date` on `dhhs_policy` manuals, and `narrowHcwdCoverageDocuments` (`packages/policy-corpus/src/internal/document-selection.ts:172-173`) keeps one document with no recency term, so same-number manuals fall through to `d.id ASC` in `packages/policy-corpus/src/primitives/policy-lookup.ts:79-82`. For Health Coverage for Workers with Disabilities (HCWD) questions on the July 2026 local graph, the manual revised 2/3/2025 sorts ahead of the one revised 4/30/26. Its premium chart uses the earlier income bands (151-200% ends at $2,609, not $2,660).

**Impact.** A worker with countable income of $2,630 a month would be placed in the band with a $196 monthly premium when the current chart charges none. The verifier accepts the old figures.

**Fix.** Parse the 'REVISED m/d/yy' header for `dhhs_policy` manuals in `_extract_effective_date`, so the lookup's existing `effective_date DESC` key orders them. When the top two lookup candidates share a policy number and score, prefer the later date and keep both if neither has one; never resolve by id. Add a test in `packages/policy-corpus/tests/internal/document-selection.test.ts` with two identically titled MA-2180 documents, and a loader test for the header. Retiring unlinked manuals at the crawler removes the tie for every manual.

*What is and is not established: Which manual wins on the production graph is unknown; the 22 September 2026 release record lists both URLs. The frame probe was not re-run.*

Where: `packages/policy-corpus/src/internal/document-selection.ts:173`, `packages/policy-corpus/src/primitives/policy-lookup.ts:79`, `packages/pipeline/src/pipeline/graph/loader.py:259`

### DATA-5 · Territory-only 42 CFR Part 436 is loaded as authoritative and ranks beside Part 435

**medium** · effort S · wrong-answer risk, data quality

`packages/pipeline/src/pipeline/config.py:101` loads 42 CFR Part 436, which governs eligibility only in Guam, Puerto Rico and the Virgin Islands, and `packages/pipeline/src/pipeline/federal/loader.py:89` titles every federal document by part number alone with an authoritative tier. No North Carolina section in the July 2026 local graph cites Part 436, against 202 citing Part 435. Forty-eight of its 78 sections share an exact title with a Part 435 section; in a full-text probe 435.540 and 436.540 ranked first and second (17.79 against 17.19), and their disability definitions differ.

**Impact.** An attorney asking for the federal disability definition could be cited 436.540, a rule that does not bind North Carolina. Nothing in the title or tier shows the difference, and the verifier would pass it.

**Fix.** Remove 436 from `CFR_PARTS` in `packages/pipeline/src/pipeline/config.py:101` and from `BASE_MEDICAID_CFR_PARTS` in `packages/policy-corpus/src/internal/focus-ranking.ts:50`, and confirm the next build drops the existing document and its sections. Put the part heading from the fetched XML into the document title at `packages/pipeline/src/pipeline/federal/loader.py:89` so a part's scope is visible in evidence. Keep the Medicare parts, which North Carolina policies cite.

*What is and is not established: No answer citing Part 436 was observed. Graph counts are from the July 2026 local build; the Medicare-part frame behaviour was not reproduced.*

Where: `packages/pipeline/src/pipeline/config.py:101`, `packages/pipeline/src/pipeline/federal/loader.py:89`, `packages/policy-corpus/src/internal/focus-ranking.ts:50`

### DATA-6 · Over half of Document nodes are synthetic revision rows that crowd lookups and counts

**medium** · effort M · wrong-answer risk, data quality, user experience

`packages/pipeline/src/pipeline/references/amendments.py:258-268` writes every clinical-policy revision-table row as a `Document` of type `change_notice`, with no sections and the base policy's number and URL. In the July 2026 local graph 4,267 of 7,589 Document nodes are such rows, 2,806 of them same-date duplicates. `lookupPolicy` (`packages/policy-corpus/src/primitives/policy-lookup.ts:62-82`) fills up to 24 slots with them. In stored runs a synthetic row was the first authoritative document in 63 of 1,697 answers, and `getAmendments` named one in 715 of 1,577 results.

**Impact.** When a question names a clinical policy, authoritative-document slots can go to section-less rows. The chat empty state counts them as corpus documents, and the advertised `change_notice` filter matches nothing.

**Fix.** Keep the rows and their `AMENDS` edges but take them out of every `:Document` reader. The owner must choose between relabelling them `:PolicyRevision` and keeping the label while filtering `source_format = 'derived'` at five reader sites; reviewers disagreed. Either way, write one row per policy and date, delete stale rows on each run, and remove `change_notice` from `packages/agent/src/tools/search.ts:19` and `packages/agent/src/prompt.ts:86`. Add a same-date collapse test to `packages/pipeline/tests/test_amendments.py`.

*What is and is not established: Counts come from the July 2026 local graph and stored runs on older local graphs. The frame-scoring effect was traced from code, not executed.*

Where: `packages/pipeline/src/pipeline/references/amendments.py:258`, `packages/policy-corpus/src/primitives/policy-lookup.ts:62`, `packages/policy-corpus/src/frame/pipelines/amendment.ts:103`, `packages/agent/src/corpus-status.ts:27`

### DATA-7 · Regulation last-revised dates are wrong or missing where the citation says 'Sept.'

**medium** · effort S · wrong-answer risk, data quality, test gap

`_CITA_DATE_FORMATS` (`packages/pipeline/src/pipeline/federal/parser.py:11`) cannot parse the abbreviation 'Sept.', so a Code of Federal Regulations (CFR) section whose Federal Register citation ends in a September date keeps an earlier date or none. On the locally cached XML this affects 205 of 2,162 sections that carry a citation: 125 hold an earlier date and 80 none. Section 433.139 stores 2020-12-31 although its citation ends 'Sept. 26, 2024'. Line 107 also labels the Federal Register source note 'Authority'. No test covers `last_revised`.

**Impact.** Asked when a federal regulation was last revised, the agent is instructed to cite the stored date and can give one years out of date. The verifier treats that date as evidence.

**Fix.** Replace the format list with one date scan over the whole citation text using an explicit month map, and take the latest date. Reject a non-empty citation that yields no date. Append the citation text without the 'Authority' label. Add tests for 'Sept. 29, 1978 ... July 15, 2013', a citation ending 'Sept. 26, 2024', a multi-page citation and 'Aug. 17 2018'. Reload federal text from the cache and cut a release.

*What is and is not established: Measured on locally cached regulation XML; no answer quoting a wrong revision date was observed.*

Where: `packages/pipeline/src/pipeline/federal/parser.py:11`, `packages/pipeline/src/pipeline/federal/parser.py:107`, `packages/agent/src/prompt.ts:13`, `packages/agent/src/processors/verifier/evidence.ts:136`

### DATA-8 · Unnumbered headings capture the numbered sections that follow, so container reads are silently partial

**medium** · effort M · wrong-answer risk, data quality, test gap

`_assign_hierarchy` (`packages/pipeline/src/pipeline/graph/loader.py:233-237`) parents each heading by level, and an unnumbered heading takes its level from Docling tree depth (`:87`), which is 1 for nearly every heading. An unnumbered heading such as 'e. Telehealth' therefore becomes a root and adopts the numbered sections after it. In the local July 2026 graph 1,323 of 7,439 numbered clinical-policy sections have an unnumbered parent, across 152 of 177 policies. No test asserts a parent link, and `docs/development/gotchas.md:104` records one instance as a per-question workaround.

**Impact.** Reading '4.2 Specific Criteria Not Covered' in policy 1-O-1 returns only its lead-in, without 4.2.2 or the lettered criteria. The agent receives a partial list with no warning, and the verifier cannot detect an omission.

**Fix.** Assign parents to numbered sections by dotted-number prefix on a separate stack, and scope unnumbered headings under the current numbered or Attachment anchor so they can never parent a later numbered section. Set siblings by shared parent. Add tests on the 1A-14 fixture and the unit case [3.2, 3.2.1, 'e. Telehealth', 3.2.2, 3.3]. Then make `getSection` collect non-empty descendants, reload, re-embed and re-validate evidence identities.

*What is and is not established: Counts are from the July 2026 local graph. The partial read was shown on policy 1-O-1; no resulting wrong answer was observed.*

Where: `packages/pipeline/src/pipeline/graph/loader.py:233`, `packages/pipeline/src/pipeline/graph/loader.py:87`, `packages/policy-corpus/src/primitives/sections.ts:63`, `docs/development/gotchas.md:104`

### DATA-9 · List letters and numbers are dropped from every PDF section body

**medium** · effort S · wrong-answer risk, data quality, test gap

`build_sections_from_items` (`packages/pipeline/src/pipeline/graph/loader.py:79`, `:155-156`) appends only `item.text` for list items. Docling keeps the enumerator in `ListItem.marker`, so every 'a.', 'b.' and '1.' is lost and nested lists become undifferentiated lines. On local clinical policies 18,928 of 20,022 list items carry an enumerator that is discarded. In the local graph, one of 2,587 sections numbered 3.x has a line starting with a lettered enumerator. The markdown file the parser writes keeps the markers; the loader does not read it.

**Impact.** Coverage criteria lose their lettered structure, so an attorney cannot be given a cite such as 3.2.1(b), and nested 'one of the following' alternatives become ambiguous in the text the verifier checks against.

**Fix.** Prefix `item.marker` to the text when the item is a `ListItem`, the marker contains a letter or digit and the text does not already start with it. Leave bullets unchanged and do not bump `PLAN_VERSION`. Add a test on the committed fixture asserting that section 3.1 contains 'a. the procedure' and that a nested numbered item keeps its '1.'. Reload from existing parses before validating evidence identities.

*What is and is not established: Measured on local parses and the local graph; the effect on answers is inferred.*

Where: `packages/pipeline/src/pipeline/graph/loader.py:156`, `packages/pipeline/src/pipeline/graph/loader.py:79`, `packages/pipeline/tests/test_loader.py:120`

### DATA-10 · Mentions in change notices and revised public notices are recorded as amendments

**medium** · effort S · wrong-answer risk, data quality, needless complexity

At `packages/pipeline/src/pipeline/references/amendments.py:431`, every manual number found in a change notice's signal sections becomes an `AMENDS` edge to every document sharing that number. An offline run over the current registry produced 939 edges from 212 notices; a keyword screen found 7 whose wording only refers to the target (for example 'Refer to MA-2242'), and 225 were not classified. Separately, the revised state plan amendment (SPA) rule at `:450-463` matched 16 documents, 15 of them revised public notices, and sets `status='amendment'` even when no target is found. No test covers that rule.

**Impact.** A case manager asking whether MA-2242 has been amended can be told that a notice which merely refers to it is the latest amendment, because the newest linked notice becomes the authoritative document.

**Fix.** Delete the revised-SPA branch and its helpers. Keep `status='amendment'` unconditional for change notices. Skip an edge only when every sentence naming the number is reference phrasing ('refer to', 'see', 'procedures in') and the number is absent from the notice title, section titles and any MAINTENANCE OF MANUAL section. Add one test for each observed excerpt (MA-2242 'Refer to', DSS-8110 'send a timely') and hand-label the dropped set before shipping.

*What is and is not established: From an offline run over the current registry. Only 7 mention-only edges were identified by keyword screen and 225 were not classified; the answer effect is inferred.*

Where: `packages/pipeline/src/pipeline/references/amendments.py:431`, `packages/pipeline/src/pipeline/references/amendments.py:450`, `packages/policy-corpus/src/primitives/amendments.ts:51`, `packages/policy-corpus/src/internal/document-selection.ts:115`

### DATA-11 · Reference resolver links citations to the wrong documents, including every '1915(c)' to one waiver

**medium** · effort M · wrong-answer risk, data quality, evaluation validity, test gap

`_resolve_waiver` (`packages/pipeline/src/pipeline/references/resolver.py:304-319`) maps every bare '1915(c)' or '1915(i)' to a document with that policy number, and the shortest title wins: 1,083 of 4,343 local `REFERENCES_DOCUMENT` edges (25%) point at a six-section flyer and a 2018 Innovations waiver. `_pick_contextual_target_document_id` (`:413-440`) binds 'Section N.N' to the nearest other policy mentioned: 343 of 3,492 section edges cross documents. The prefix rule at `:193-202` picks one sibling by `effective_date`, so '11A' resolved to 11A-10 on its 2105 date. The cross-reference evaluation hardcodes false resolutions to zero.

**Impact.** `followReferences` tells the model and the verifier that federal regulation text, or the policy for a different waiver programme, references the 2018 Innovations waiver, or that one policy's revision row cites another policy's section.

**Fix.** Resolve '1915(x)' to the existing Social Security Act subsection node and stop matching `Document.policy_number`. Bind a section reference to another policy only through a literal connective such as 'Section 5.0 of clinical coverage policy 10A'; otherwise resolve within the citing document. Delete the prefix fallback in the same rebuild as the effective-date fix, expecting about 38 fewer edges. Add negative tests in `packages/pipeline/tests/test_resolver.py`, including 'Clinical Coverage Policy 11A' staying unresolved. Clear regex-origin edges before re-merging.

*What is and is not established: Edge counts are from the July 2026 local graph; the effect on answers through `followReferences` is inferred.*

Where: `packages/pipeline/src/pipeline/references/resolver.py:311`, `packages/pipeline/src/pipeline/references/resolver.py:428`, `packages/pipeline/src/pipeline/references/resolver.py:193`, `packages/pipeline/src/pipeline/eval/levels/cross_ref.py:72`

### DATA-12 · Padded tables push sections past the 6,000-character read cap, hiding the newest rows

**medium** · effort S · wrong-answer risk, data quality, test gap

`packages/pipeline/src/pipeline/graph/loader.py:136` stores each PDF table with pandas `to_markdown`, which pads every cell to its column width. On 176 local clinical policies padded tables are 2.7 times their compact size and padding is 29% of stored text. `getSection` returns only the first 6,000 characters: 191 of 653 table sections exceed that, and 122 would fit unpadded. Revision tables run oldest first, so the newest rows are cut. Each fee-schedule worksheet is also one section (`packages/pipeline/src/pipeline/parse/converter.py:581`) with no row lookup.

**Impact.** An attorney asking what changed most recently in a policy may not be shown the latest revisions, and the agent receives no sign that rows were cut.

**Fix.** Render tables through one compact helper shared by the loader and the parser, escaping pipes and newlines in cells; this needs a reload, not a re-parse. Assert on the 1A-14 fixture that the revision section is under 6,000 characters. Do not build a row lookup for the fee-schedule family, which has been frozen since November 2022 and should leave answering instead. Re-embed table sections before the qualification campaign.

*What is and is not established: Measured on local parses and the July 2026 local graph; no truncated answer was observed.*

Where: `packages/pipeline/src/pipeline/graph/loader.py:136`, `packages/policy-corpus/src/internal/record-mapping.ts:143`, `packages/pipeline/src/pipeline/parse/converter.py:581`

### DATA-13 · Fee-schedule dates are misread from titles, so wrong files become the primary schedule

**medium** · effort S · wrong-answer risk, data quality, test gap

`_extract_variant_date` (`packages/pipeline/src/pipeline/source_selection.py:252-278`) takes the maximum of every date-like match in the title, file stem and URL. Its month pattern reads 'Jan.24, 2019' as January 2024, years are not range-checked, so a '6022' typo is accepted, and a URL upload date can beat the title. On the current registry of 1,998 fee-schedule rows, 36 get a date that disagrees with their own title. The Physician Assistant schedule of 24 January 2019 is `primary` while the 10 August 2022 schedule is `history`.

**Impact.** A question naming 2024 matches the false date and earns the requested-year boost, so 2019 Physician Assistant rates can be served as the 2024 schedule.

**Fix.** Choose the date by specificity: the latest day-precision date in the title, then month and year, and the file stem or URL only when the title has none. Allow '.', ',' or '-' between month, day and year, never invent a year, and reject years outside 2000 to the build year plus one. Add the real registry titles to `packages/pipeline/tests/test_source_selection.py`, including 'Jan.24, 2019', 'Aug. 16, 6022' and 'April 25'.

*What is and is not established: Reproduced on the current registry; the 2024 boost was shown on repository fixtures only. Impact shrinks if the frozen family leaves default retrieval, though the date still reaches the model.*

Where: `packages/pipeline/src/pipeline/source_selection.py:84`, `packages/pipeline/src/pipeline/source_selection.py:252`, `packages/pipeline/src/pipeline/source_selection.py:278`

### DATA-14 · XLS, DOCX and HTML parsers drop or misplace content while reporting answer-ready

**medium** · effort M · wrong-answer risk, data quality, test gap

`parse_xls` (`packages/pipeline/src/pipeline/parse/converter.py:625`) stringifies raw cell values, so dates become serial numbers (39083.0 for 1 January 2007) and whole numbers gain '.0'; across 293 local `.xls` files, 387,336 date cells in 149 files are affected. `parse_docx` (`:497-525`) reads all paragraphs, then all tables, and attaches every table to the last section. The HTML parser (`:783`) keeps only text inside `p`, `li` and headings; on a current bulletin post, in a family required for answering, it kept table values and dropped their labels. All three report `answer_ready: True` with no quality flag.

**Impact.** A user relying on a bulletin table or a spreadsheet rate would be answered from figures without labels or usable dates, or from a table filed under the wrong heading.

**Fix.** Render XLS cells by `cell_type`, converting dates with `xldate_as_datetime` and printing whole numbers without '.0'. Walk DOCX content in body order with `iter_inner_content()`. Rewrite the HTML parser to flush text at block boundaries, emit table rows as ' | '-joined lines and flag coverage below about 95%. Invalidate through per-format representation markers, not `PARSE_CACHE_VERSION`. Add a real `.xls` fixture, a DOCX with a table between two headings and a div-wrapped HTML table test.

*What is and is not established: Measured on local files; the bulletin loss was seen on one current post. No answer built on the affected content was observed.*

Where: `packages/pipeline/src/pipeline/parse/converter.py:625`, `packages/pipeline/src/pipeline/parse/converter.py:497`, `packages/pipeline/src/pipeline/parse/converter.py:783`, `packages/pipeline/tests/test_parse_converter.py:683`

### DATA-15 · Federal statute and regulation text carries no as-of date in the graph

**medium** · effort S · wrong-answer risk, data quality

`packages/pipeline/src/pipeline/federal/loader.py:69-74` writes federal documents with no `retrieved_at`, a null `effective_date` and a `source_checked_at` equal to load time. The fetch provenance stamped on cached regulation XML is read only by a test, and the `currentthrough` marker on United States Code pages is never parsed. Cache freshness is file modification time (7 days for regulations, 30 for statutes). In the local graph none of the 47 federal documents has `retrieved_at`; the statute cache was fetched on 12 June 2026 but is current only through Public Law 119-83 of 13 April.

**Impact.** An attorney asking whether an answer reflects a recent enactment or final rule cannot be told, and the agent has no date with which to qualify a federal citation.

**Fix.** Record the fetch time inside each cache file and set `retrieved_at` and `source_checked_at` from it. Set `source_modified_date` from the regulation file's source date and from the statute source's current-through marker (the compilation's current-through public law if GovInfo is adopted), and fail validation when it is missing. Base cache freshness on the recorded fetch time. Extend the `lastRevised` rule at `packages/agent/src/prompt.ts:13` to state the current-through date on temporal questions.

*What is and is not established: Observed on the July 2026 local graph and local caches; production was not inspected.*

Where: `packages/pipeline/src/pipeline/federal/loader.py:74`, `packages/pipeline/src/pipeline/federal/ecfr_client.py:159`, `packages/pipeline/src/pipeline/federal/ssa_client.py:158`, `packages/agent/src/prompt.ts:13`

### DATA-16 · Concept links are keyword mentions labelled COVERS and feed every hybrid search

**medium** · effort M · data quality, needless complexity

`link_concepts` (`packages/pipeline/src/pipeline/concepts/linker.py:77-81`) links every whole-word mention of 33 seeded concepts to its section, and the edge type defaults to `COVERS` (`:57`). All 12 local sections stating prior approval is not required were linked `COVERS` to Prior Authorization. The seed (`packages/pipeline/src/pipeline/concepts/seed.py:36`) makes 'plan of care' an alias of the Innovations Individual Support Plan, so at least 1,083 of that concept's 1,944 links are generic, and it lacks 'Medicaid deductible' and 'Tailored Plan'. The concept backend runs in every hybrid search at a fixed 0.7 score, longest sections first.

**Impact.** `findConceptSections('Prior Authorization', 'COVERS')` returns sections saying prior approval is not required, and a hospice 'plan of care' question pulls long Innovations-tagged sections into search. No wrong answer was demonstrated.

**Fix.** Drop `'concept'` from `BASE_BACKENDS` and compare one retrieval evaluation run against baseline on isolated observability storage; if nothing is lost, delete the linker, seed list, backend, primitive and tool. Only if it stays: write a single `MENTIONS` edge, page the scan in batches, clear old edges before each merge, remove the `PA` alias, split 'Plan of Care' from 'Individual Support Plan', and add 'Medicaid deductible' and the managed-care plan names. Update `packages/pipeline/tests/test_linker.py` to assert the single edge type.

*What is and is not established: Link counts come from local sections and the July 2026 local graph; the effect on answers is unmeasured.*

Where: `packages/pipeline/src/pipeline/concepts/linker.py:79`, `packages/pipeline/src/pipeline/concepts/linker.py:57`, `packages/pipeline/src/pipeline/concepts/seed.py:36`, `packages/policy-corpus/src/retrieval/backends/concept.ts:16`

### DATA-17 · Citation extraction misses most federal cross-references and discards statute subsections

**medium** · effort M · data quality, test gap

The `section` and `ssa_section` patterns at `packages/pipeline/src/pipeline/references/extractor.py:30` and `:38` are case-sensitive, singular and stop before any subsection. There is no United States Code pattern and no bare '§ N.N' pattern for regulation text. Measured on local text, about 9,980 '§' references inside Code of Federal Regulations sections are not extracted, 82% of 'section 19xx' mentions there are missed, and about 1,629 extracted Social Security Act references lost their subsection. The local graph has 235 statute subsection nodes with no inbound `REFERENCES` edge.

**Impact.** `followReferences` on a regulation returns a fraction of its statutory basis and almost none of its sibling sections, so federal-authority answers depend on search alone. A reference to 1905(r) lands on a 229,000-character parent.

**Fix.** Add `re.IGNORECASE` and plural forms to both patterns. Capture the top-level subsection letter and resolve to the child node first, then the parent. Add a pattern for `42 U.S.C. 1396` and `1397` citations mapped through the existing `USC_TO_SSA` table, which must then survive any statute-parser deletion. For regulation documents only, match bare '§ N.N' as a same-title reference, preloading section ids. Add extractor tests for each form and a resolver test for the child-then-parent fallback.

*What is and is not established: Measured on local text and the July 2026 local graph; the effect on federal-authority answers is inferred.*

Where: `packages/pipeline/src/pipeline/references/extractor.py:30`, `packages/pipeline/src/pipeline/references/extractor.py:38`, `packages/pipeline/src/pipeline/federal/ssa_client.py:108`

### DATA-18 · `parse --force` reports crashed re-parses as success; `load` and `run-all` exit 0 on errors

**medium** · effort S · reliability, release gate, test gap

In the error path of `parse_all` (`packages/pipeline/src/pipeline/parse/converter.py:1766-1773`) any valid cached sidecar is taken as proof that the worker committed. With `--force` that sidecar is the old artifact, so a re-parse that raises or times out is counted as parsed with no error; a probe in a scratch corpus reproduced this. The `load` command (`packages/pipeline/src/pipeline/cli/build.py:225`) prints its error count and exits 0, and `run-all` (`:287`) ignores parse and load errors and still writes the schema marker. The weekly refresh runs `run-all`, then `load --reset` through `scripts/deploy-data.sh:74`.

**Impact.** The operator sees a green run while documents keep pre-change parses or are missing from the graph, so answers can be quietly out of date after a parser change or a partial load.

**Fix.** Take the 'committed' shortcut only when the sidecar's `parsed_at` changed during the attempt. Make `load` raise on a non-zero error count. Gate `run-all`'s load and federal stages on zero errors, and its parse stage on the rule `parse --strict-required` uses, before the schema marker is written. Add a regression test: parse, then force with the parser patched to raise, asserting `errors == 1` and a failure sidecar.

*What is and is not established: The `--force` case was reproduced in a scratch corpus; the exit-code behaviour was read from code. No affected production run was identified.*

Where: `packages/pipeline/src/pipeline/parse/converter.py:1766`, `packages/pipeline/src/pipeline/cli/build.py:225`, `packages/pipeline/src/pipeline/cli/build.py:287`, `scripts/deploy-data.sh:74`

### DATA-19 · The no-OCR gate accepts no real PDF, so every PDF is converted twice

**medium** · effort M · reliability, cost, test gap

`evaluate_no_ocr_pdf` (`packages/pipeline/src/pipeline/parse/converter.py:401-428`) accepts a conversion without optical character recognition (OCR) only when every page's pypdf tokens exactly equal Docling's body text and the document has no table. Headings, headers and footers are left out of that text, so the condition is effectively unreachable: none of 134 local sidecars written by the gate was accepted. `parse_pdf` then runs OCR and keeps that result unconditionally (`:463`) under one 600-second deadline, so an OCR failure discards a finished parse. Issue #161 and draft pull request #113 track the double conversion, not this loss.

**Impact.** The operator spends about 2.6 times the single-pass conversion time per PDF, long documents can time out and block a release, and a break in the OCR stack fails every PDF, not only scanned ones.

**Fix.** Choose the route before converting, from pypdf facts already computed: convert once without OCR when every non-blank page has a text layer and no images, otherwise once with OCR. Record the Docling-versus-pypdf comparison as evidence instead of a gate, and treat a non-success Docling status as a failure. Replace the mocked gate tests with one on the committed 1A-14 fixture and a mixed digital-and-scanned case. Qualify the single pass under issue #161.

*What is and is not established: Based on 134 local sidecars; the timing ratio is a local measurement and no OCR-stack failure was observed.*

Where: `packages/pipeline/src/pipeline/parse/converter.py:452`, `packages/pipeline/src/pipeline/parse/converter.py:425`, `packages/pipeline/src/pipeline/parse/converter.py:463`, `packages/pipeline/tests/test_parse_converter.py:61`

### DATA-20 · Every release re-embeds the whole corpus, with thin retry and no spend ceiling

**medium** · effort M · cost, reliability, test gap

`build_release_graph` resets the candidate graph (`packages/pipeline/src/pipeline/release.py:221`) and then embeds every section again, so unchanged vectors are bought on each release. The recorded local-tokenizer estimate is $13.64 per full build after spreadsheet compaction ($115.17 before); fee schedules are about 90% of those tokens. `packages/pipeline/src/pipeline/embeddings/voyage_client.py:89` retries timeouts but not other transport errors, so one connection reset fails the stage and a rerun starts from zero. The client never reads the provider's `usage` field and has no token ceiling, although `docs/operations/embedding-input-plans.md` requires enforced budget limits.

**Impact.** The owner pays again for identical vectors on each changed-corpus release, at most about $709 a year at list price, and cannot reconcile a Voyage invoice with a run.

**Fix.** Catch `httpx.TransportError`, raise the backoff cap to 60 seconds and log billed `usage` beside the local count, with a test for each. Add a token ceiling to `embed_all` that a paid release must set. Stop embedding the frozen fee-schedule family first, which removes about nine tenths of the tokens. Only then decide whether vector reuse, by copying from the active graph by plan hash or from a content-addressed store on the corpus volume, is still worth building.

*What is and is not established: Costs are offline token estimates at list price, not billed figures; $709 a year is an upper bound at weekly releases. No transport failure was observed.*

Where: `packages/pipeline/src/pipeline/release.py:221`, `packages/pipeline/src/pipeline/embeddings/voyage_client.py:89`, `packages/pipeline/src/pipeline/embeddings/generator.py:134`, `docs/operations/embedding-input-plans.md:23`

## Low severity

### DATA-21 · Notice-stage plan amendments reach verifier evidence labelled 'Status: current'

**low** · effort S · wrong-answer risk, data quality

`packages/pipeline/src/pipeline/graph/loader.py:451` hard-codes `status="current"` for every document and `packages/agent/src/processors/verifier/evidence.ts:111` prints it. In stored runs, a document from a proposed-amendment or public-notice page was in the evidence of 35 of 1,697 answers.

**Impact.** An attorney could be given notice-stage figures as current policy. No stored answer relied on one, and two of the three documents involved were in fact approved.

**Fix.** Set a neutral stage label such as `public_notice` or `submitted_to_cms` at the loader, demote only true public notices, and do not infer 'proposed' from title or discovery page. Use the 22-0007 public notice as the regression fixture. Decide separately whether 90 or 60 days of therapeutic leave governs.

*What is and is not established: Measured on stored runs against older local graphs from April to September 2026; no wrong answer resulted.*

Where: `packages/pipeline/src/pipeline/graph/loader.py:451`, `packages/agent/src/processors/verifier/evidence.ts:111`

### DATA-22 · The eCFR primary fetch cannot succeed, and its 406 is documented as an outage

**low** · effort S · needless complexity, documentation, test gap

`packages/pipeline/src/pipeline/federal/ecfr_client.py:27` sends no `Accept-Encoding` header, which the Electronic Code of Federal Regulations (eCFR) full-text endpoint answers with HTTP 406, and `:71` rejects that endpoint's real `DIV5` root. Every part comes from the GovInfo fallback; `docs/development/gotchas.md:23` records an upstream failure.

**Impact.** No wrong regulation text results. The owner carries dead code, tests of an invented response shape and a misleading lesson; the 406 was among the failed qualification prerequisites in issue #188.

**Fix.** Make GovInfo the only source: delete the direct-fetch branch, `_get_title_issue_date` and `_bulk_only`, keep the `CFRDOC` root check, and delete `test_primary_content_is_validated_and_retains_provenance`. Rewrite lines 23, 27 and 37 of `docs/development/gotchas.md` to state the cause, and correct the issue #188 body, which lists the 406 responses as a failed prerequisite.

*What is and is not established: The 406 and the `DIV5` root were confirmed live on 5 October 2026, but nobody ran the regulation stage end to end.*

Where: `packages/pipeline/src/pipeline/federal/ecfr_client.py:27`, `packages/pipeline/src/pipeline/federal/ecfr_client.py:71`, `docs/development/gotchas.md:23`, `packages/pipeline/tests/test_ecfr_client.py:64`

### DATA-23 · Parse sidecars record no parser versions, and each run re-reads every artifact several times

**low** · effort M · data quality, dependency

`should_parse` (`packages/pipeline/src/pipeline/parse/converter.py:112-151`) reuses a parse with no record of the Docling, model or text-recognition versions that produced it; `docling_version` (`:991`) is 'unknown' in all 4,143 local sidecars. A cache-hit run also hashes and decodes every artifact several times.

**Impact.** After a parser dependency upgrade the corpus mixes parser generations and the operator cannot tell which documents hold old output. No wrong answer follows directly.

**Fix.** Replace `docling_version` with a `parser_versions` dict built from `importlib.metadata.version()`, and have `audit-corpus` count sidecars per version set. Keep invalidation manual through `PARSE_CACHE_VERSION` or `--force`, and record in `docs/development/gotchas.md` that a parser lock bump requires that decision. Delete the payload `json.loads` from `should_parse` and `_inspect_parse_artifacts`, and make one inventory pass per run.

*What is and is not established: Latent: it matters only after a parser dependency upgrade. Counts are from local sidecars.*

Where: `packages/pipeline/src/pipeline/parse/converter.py:991`, `packages/pipeline/src/pipeline/parse/converter.py:112`, `packages/pipeline/src/pipeline/parse/converter.py:148`, `docs/development/gotchas.md:68`

### DATA-24 · Model-assisted reference extraction is unused in releases and would misattribute references if enabled

**low** · effort S · needless complexity, cost

`packages/pipeline/src/pipeline/references/llm_extractor.py` runs only behind three `--llm-assist` flags; no release or qualification path enables it. As written it assigns duplicate matches to the first section in a batch (`:286-291`), accepts ungrounded text and meters no spend.

**Impact.** None in production today. If the flag were used, reference edges would land on the wrong sections and differ between runs, with unlogged model spend.

**Fix.** Delete `packages/pipeline/src/pipeline/references/llm_extractor.py`, `packages/pipeline/tests/test_llm_extractor.py`, the three `--llm-assist` flags, the resolver's optional second phase (`packages/pipeline/src/pipeline/references/resolver.py:502-570`) and the `LLM_MODEL` and `LLM_REF_BATCH_SIZE` settings. Leave the historical attestation manifests under `docs/validation` unchanged, and confirm no live attestation check expects the file.

*What is and is not established: Latent: no release or qualification path enables the flag.*

Where: `packages/pipeline/src/pipeline/references/llm_extractor.py:286`, `packages/pipeline/src/pipeline/references/resolver.py:502`, `packages/pipeline/src/pipeline/config.py:57`
