# Working artifact from the round-two critic-amendment-date-design review

I ran the current loader and revision parser over all 177 local clinical-policy parses and 204 change-notice parses (June-July parse files, October registry copy), queried the legacy local graph read-only, executed the built amendment frame against it with search stubbed, and ran three marker parsers over 70,634 real section titles.

Decisions the data supports. (1) The title-block banner is each clinical policy's stated version date: present on 177 of 177; where the latest row is later (28 policies), 27 say in their own text that the row is a posting date or that the amended date did not change. (2) Change notices carry a parseable DATE on 202 of 204; latest-by-date and latest-by-number name the same notice on all 209 amended manuals, so real dates need no new properties. (3) The bound that holds is content-change date plus 366 days; wall-clock bounds admit 2028-07-31 on a schedule. (4) The explicit marker pattern misses the 'Current Change Notice' header; the gated one accepts revised-SPA numbers. (5) No superseding amendment type exists, so the consolidated document is always the citation target.

New defects: amendment frames for chained clinical policies list only synthetic rows; the document-keyword tie-break hands every slot to notices; the pipeline resolver also orders by effective date.

Fine: current code reproduces the legacy stored dates for 173 of 177 policies and 204 of 204 notices; no web or contracts code reads effective dates; the null-date ordering guard in amendments.ts is intact.

## Provenance of every number

- **[LOCAL]** current repository code (HEAD c48a9d4) run from a scratch script over the untracked local parse files (clinical 177, DHHS 1,237; parsed 2026-06-16 to 2026-07-24), with titles and timestamps from a copy of the crawler registry (last written 2026-10-01).
- **[LEGACY]** the local Neo4j graph (July 2026 build, legacy document ids), read-only.
- **[EVAL]** a saved local evaluation file (gitignored), run 2026-07-10, git 210ced2.

Current code reproduces the legacy stored dates for 173 of 177 clinical policies (10A and 3A were re-crawled since; 8F and 8G no longer have a registry row at their parse path) and for 204 of 204 notices. Of the 177 clinical parses, 170 would load today (4 not answer-ready, 1 registry row removed, 2 without a registry row).

## 1. Clinical policies: banner, latest valid row, stored date [LOCAL; last column LEGACY]

Over 177 policies: banner present 177 (`Amended Date:` 175, `Effective Date:` 2). Latest valid row equals the banner 146, is later 28, is earlier 3. Loader equals the banner 96; older 61 (27 by three years or more); newer 15 (11 posting-date rows, 3 dates read from change-column prose: 1E-3, 2B-1, 8A; 1 typo); none 5.

**Where banner and latest row differ (31 policies), the document presents the banner as its version date in all 31**: 27 later rows disclaim themselves (P1, P2), 1 is a typo year (T), 3 banners have no row yet (N).

Codes: P1 = the later row is a posting date whose text reads "Policy posted … with an effective date of <banner date>". P2 = the later row's text reads "amended date not changed". N = no row for the current banner. T = typo row 09/01/2105. F = stored value is a future date. X = would not load today. (E) = banner label is `Effective Date:`. * = policy number taken from the file name.

| Policy | Banner | Latest valid row | Loader stores | Legacy graph | Code |
|---|---|---|---|---|---|
| 1A-2 | 2023-08-15 | 2023-08-15 | 2019-12-04 | 2019-12-04 |  |
| 1A-3 | 2023-08-15 | 2023-08-15 | 2019-03-15 | 2019-03-15 |  |
| 1A-4 | 2023-04-01 | 2023-04-15 | 2021-03-15 | 2021-03-15 | P1 |
| 1A-5 | 2023-04-01 | 2023-04-15 | 2022-09-01 | 2022-09-01 | P1 |
| 1A-6 | 2023-08-15 | 2023-08-15 | 2019-12-04 | 2019-12-04 |  |
| 1A-11 | 2023-08-15 | 2023-08-15 | 2019-12-04 | 2019-12-04 |  |
| 1A-12 | 2023-08-15 | 2023-08-15 | 2021-02-01 | 2021-02-01 |  |
| 1A-13 | 2023-08-15 | 2023-08-15 | 2020-08-04 | 2020-08-04 |  |
| 1A-17 | 2023-08-15 | 2023-08-15 | 2019-12-04 | 2019-12-04 |  |
| 1A-23 | 2023-04-01 | 2023-04-15 | 2019-12-04 | 2019-12-04 | P1 |
| 1A-24 | 2023-06-01 | 2023-12-15 | 2023-12-15 | 2023-12-15 | P2 |
| 1A-25 | 2023-08-15 | 2023-08-15 | 2019-12-04 | 2019-12-04 |  |
| 1A-32 | 2023-08-15 | 2023-08-15 | 2019-12-04 | 2019-12-04 |  |
| 1A-36 | 2023-04-01 | 2023-04-15 | 2019-12-12 | 2019-12-12 | P1 |
| 1A-42 | 2023-08-15 (E) | 2023-08-15 | 2019-12-12 | 2019-12-12 |  |
| 1B | 2023-04-01 | 2023-04-15 | 2022-06-01 | 2022-06-01 | P1 X |
| 1D-1 | 2023-08-15 | 2023-08-15 | 2019-12-12 | 2019-12-12 |  |
| 1D-2 | 2023-08-15 | 2023-12-15 | 2023-12-15 | 2023-12-15 | P2 |
| 1D-3 | 2023-08-15 | 2023-12-15 | 2023-12-15 | 2023-12-15 | P2 |
| 1D-4 | 2023-08-15 | 2023-08-15 | 2020-12-01 | 2020-12-01 |  |
| 1E-3 | 2026-01-01 | 2025-08-15 | 2028-07-31 | 2028-07-31 | N F |
| 1E-6 | 2023-04-01 | 2023-12-15 | 2023-12-15 | 2023-12-15 | P1+P2 |
| 1E-7 | 2025-05-01 | 2025-04-15 | 2025-05-01 | 2025-05-01 | N |
| 1H | 2025-02-15 | 2025-02-01 | 2025-02-01 | 2025-02-01 | N |
| 1-I | 2023-08-15 | 2023-08-15 | 2020-12-01 | 2020-12-01 |  |
| 1K-2 | 2024-02-15 | 2024-02-15 | 2019-12-20 | 2019-12-20 |  |
| 1L-2 | 2023-04-01 | 2023-04-15 | 2019-12-20 | 2019-12-20 | P1 |
| 1M-2 | 2023-08-15 | 2023-08-15 | 2020-12-01 | 2020-12-01 |  |
| 1M-3 | 2023-08-15 | 2023-08-15 | 2022-05-15 | 2022-05-15 |  |
| 1M-4 | 2023-08-15 | 2023-08-15 | 2019-12-20 | 2019-12-20 |  |
| 1M-5 | 2023-08-15 | 2023-08-15 | 2022-05-15 | 2022-05-15 |  |
| 1M-6 | 2023-08-15 | 2023-08-15 | 2019-12-20 | 2019-12-20 |  |
| 1S-8 | 2023-04-01 | 2023-04-15 | 2020-11-01 | 2020-11-01 | P1 |
| 1T-1 | 2023-08-15 | 2023-08-15 | 2020-01-15 | 2020-01-15 |  |
| 2B-1 | 2024-08-01 | 2024-08-01 | 2024-08-07 | 2024-08-07 | prose "posted 08/07/2024" |
| 3A | 2026-07-01 | 2026-07-01 | 2026-07-01 | 2023-12-15 | re-crawled |
| 3B | 2023-04-01 | 2023-04-15 | 2022-10-01 | 2022-10-01 | P1 |
| 3G-1 | 2024-05-15 | 2024-05-15 | None | None |  |
| 3L-1 | 2026-01-01 | 2026-01-01 | None | None |  |
| 5B | 2024-07-15 | 2024-07-15 | None | None |  |
| 6A | 2024-05-01 | 2024-07-25 | 2024-07-25 | 2024-07-25 | P2 |
| 6B | 2024-05-01 | 2024-07-25 | 2024-07-25 | 2024-07-25 | P2 |
| 7 | 2023-04-01 | 2023-04-01 | 2020-01-13 | 2020-01-13 |  |
| 8A | 2026-01-01 | 2026-01-01 | 2026-01-02 | 2026-01-02 | prose date |
| 8A-7 | 2025-01-01 | 2025-01-01 | 2024-10-01 | 2024-10-01 |  |
| 8A-8 | 2025-01-01 | 2025-01-01 | 2024-10-01 | 2024-10-01 |  |
| 8A-11 | 2025-01-01 | 2025-01-01 | 2024-10-01 | 2024-10-01 |  |
| 8C | 2025-01-01 | 2025-04-15 | 2025-04-15 | 2025-04-15 | P2 |
| 8E | 2023-04-01 | 2023-04-15 | 2019-11-14 | 2019-11-14 | P1 |
| 8F* | 2023-04-01 | 2023-12-15 | 2023-12-15 | 2023-12-15 | P1+P2 X |
| 8H-4 | 2024-02-01 | 2024-02-01 | 2023-10-01 | 2023-10-01 |  |
| 8H-5 | 2023-10-15 | 2023-10-15 | None | None |  |
| 8I | 2025-01-01 | 2025-01-01 | None | None |  |
| 8O | 2023-04-01 | 2023-04-15 | 2019-12-15 | 2019-12-15 | P1 |
| 8P | 2023-04-01 | 2023-04-15 | 2016-11-01 | 2016-11-01 | P1 |
| 9B | 2023-04-01 | 2023-04-15 | 2020-01-12 | 2020-01-12 | P1 |
| 9D | 2023-04-01 | 2023-04-15 | 2020-01-12 | 2020-01-12 | P1 |
| 9E | 2023-04-01 | 2023-04-15 | 2020-01-12 | 2020-01-12 | P1 (sentence split across a page break) |
| 10A | 2026-07-01 | 2026-07-01 | 2026-07-01 | 2025-02-01 | re-crawled |
| 10C | 2023-04-01 | 2023-12-15 | 2023-12-15 | 2023-12-15 | P1+P2 |
| 10D | 2023-04-01 | 2023-12-15 | 2023-12-15 | 2023-12-15 | P1+P2 |
| 11A-1 | 2023-08-15 | 2023-08-15 | 2021-07-01 | 2021-07-01 |  |
| 11A-2 | 2023-08-15 | 2023-08-15 | 2021-07-01 | 2021-07-01 |  |
| 11A-3 | 2023-08-15 | 2023-08-15 | 2021-07-01 | 2021-07-01 |  |
| 11A-5 | 2023-08-15 | 2023-08-15 | 2021-07-01 | 2021-07-01 |  |
| 11A-6 | 2023-08-15 | 2023-08-15 | 2021-07-01 | 2021-07-01 |  |
| 11A-7 | 2023-08-15 | 2023-08-15 | 2021-07-01 | 2021-07-01 |  |
| 11A-9 | 2023-08-15 | 2023-08-15 | 2021-07-01 | 2021-07-01 |  |
| 11A-10 | 2023-08-15 | 2105-09-01 | 2105-09-01 | 2105-09-01 | T F |
| 11A-11 | 2023-08-15 | 2023-08-15 | 2021-07-01 | 2021-07-01 |  |
| 11A-14 | 2023-08-15 | 2023-08-15 | 2021-07-01 | 2021-07-01 |  |
| 11A-16 | 2023-08-15 | 2023-08-15 | 2021-07-01 | 2021-07-01 |  |
| 11B-1 | 2023-08-15 | 2023-08-15 | 2021-07-01 | 2021-07-01 |  |
| 11B-2 | 2023-08-15 | 2023-08-15 | 2021-07-01 | 2021-07-01 |  |
| 11B-3 | 2023-08-15 | 2023-08-15 | 2021-07-01 | 2021-07-01 |  |
| 11B-5 | 2023-08-15 | 2023-08-15 | 2021-07-01 | 2021-07-01 |  |
| 11B-6 | 2023-08-15 | 2023-08-15 | 2021-07-01 | 2021-07-01 |  |
| 11B-7 | 2023-08-15 | 2023-08-15 | 2021-07-01 | 2021-07-01 |  |
| 11B-8 | 2023-08-15 | 2023-08-15 | 2021-07-01 | 2021-07-01 |  |
| 11C | 2023-08-15 | 2023-08-15 | 2020-01-06 | 2020-01-06 |  |
| 12B | 2023-08-15 | 2023-08-15 | 2020-01-15 | 2020-01-15 |  |
| 13A | 2023-04-01 | 2023-04-15 | 2021-03-15 | 2021-03-15 | P1 |
| 13B | 2023-04-01 | 2023-04-15 | 2020-01-15 | 2020-01-15 | P1 |
| 15 | 2023-04-01 | 2023-12-15 | 2023-12-15 | 2023-12-15 | P1+P2 |

The other 93 policies have the same value in all four columns (among them 3K-2, 8A-1, 5A-1, 2A-1, 1A-30*, 8G*).

Revision rows [LOCAL]: 6,066 rows parse: 4,267 under "revision information" titles in 125 policies (the only ones amendments.py reads; the legacy graph holds the same 4,267), 1,487 under "history" titles in 46 more, 312 under split or page-header titles (four policies only there: 3G-1, 5B, 8H-5, 8I). A further 541 date-first rows are dropped by the strict pattern (503 two-digit years, 36 with an "(eff. …)" suffix in the date cell, 2 malformed), all dated 2001 to 2019. One entry per (policy, date) turns 6,066 rows into 1,933; policies with more than 50 entries fall from 29 to 3.

## 3. Future-date bound [LOCAL rows + registry timestamps]

| Bound | From | Legitimate rows kept (of 6,064) | 09/01/2105 | 2028-07-31, if a prose reader remained | Moves with build day |
|---|---|---|---|---|---|
| on or before retrieval date | pipeline-parse-graph-01 | all today; loses 124 rows in 31 policies if crawled on the posting day | rejected | rejected | `retrieved_at` is the last check, so yes |
| today + 2 years | neo4j-live-09 | all | rejected | **admitted today** | yes |
| year ≤ current year + 1 | neo4j-live-03 | all | rejected | admitted from 2027-01-01 | yes |
| build date + 1 year | pipeline-refs-federal-jev-05 | all | rejected | admitted from 2027-07-31 | yes |
| **content-change date + 366 days** | this review | all, also on the posting day (largest lead 12 days) | rejected (29,012 days past) | rejected (857 days past) | no |
| banner + 366 days (fallback) | this review | all (largest lead 258 days) | rejected (29,967) | rejected (942) | no |

After column restriction 2028-07-31 never reaches the row parser; the bound's remaining job is typo years.

## 2. Change notices [LOCAL; per-manual figures use LEGACY edges]

| Field | Present | Parses to a date | Notes |
|---|---|---|---|
| Title number NN-YY | 204 | 204 | one registry title has the wrong number (03-21; the document says 04-21) |
| `DATE:` | 203 | 202 | a section title on 40; Month D, YYYY 182, M/D/YY 16, next line 2, no comma 1, MM-DD-YYYY 1; 07-04 empty; 10-18 date without the label |
| header `Effective:` | 59 | 51 | 7 "Upon receipt"; 0 of the 114 notices from 2020 on; against DATE: 38 later, 9 equal, 3 earlier |
| "EFFECTIVE DATE" section | 197 | 143 carry a date in the first 600 characters | prose |
| `Manual:` series | 200 | n/a | ABD 122, F&C 78, 4 unreadable |

Ordering by (year, sequence) against DATE within a series: ABD 120 dated notices, 10 adjacent inversions, 14 of 7,127 pairs discordant (14 of 433 same-year pairs); F&C 78 notices, 4 adjacent inversions, 11 of 2,991 (5 of 219 same-year). 55 of 145 numbers are used by both series. DATE year is the year before the title year on 10 notices.

Per amended manual (209): ties on the newest key 56 (fabricated), 39 (real DATE: 28 twins, 11 same-day), 28 (year, sequence). Current pick is not the highest number on 12. Latest-by-date and latest-by-number differ on 0. The fabricated date differs from DATE by a median of 137 days (within 31 days on 36 of 202; later than the real date on 10).

Manual's own revision header [LOCAL]: 147 of 920 active manual documents (in a section title 105, in content only 42). Of the 209 amended manuals 124 have one: equal to the newest linked notice 91, newer 26, older 7 (two are superseded duplicate copies of MA-2180 and MA-2240 still loaded as current, one edge comes from a misprinted number in a notice, four unresolved).

## 4. Marker patterns [LEGACY titles: 70,634 titled sections, 30,433 distinct; 3,322 real document titles]

| True-marker family (example) | Occurrences | Current | Explicit (corpus-retrieval-05) | Gated (corpus-frames-09) | Tolerant explicit (this review, in-sample) |
|---|---|---|---|---|---|
| `REVISED 05/01/11 - CHANGE NO. 04-11` (and REISSUED, ISSUED) | 912 | 912 | 912 | 912 | 912 |
| `CHANGE NOTICE FOR MANUAL NO. 01-21, …` | 200 | 200 | 195 | 200 | 200 |
| `Current Change Notice: 03-23` | 38 | 38 | 0 | 38 | 38 |
| other header variants (`REVISED EFFECTIVE 04/01/10 - CHANGE NO. 04-10`) | 12 | 12 | 12 | 12 | 12 |
| `REVISED 04/01/10 - CHANGE NOTICE 04-10` | 8 | 8 | 8 | 8 | 8 |
| `Change No. 02-24:` | 7 | 7 | 7 | 7 | 7 |
| `ISSUED 01/01/11-CHANGE 24-10` | 5 | 5 | 5 | 1 | 5 |
| **Total true** | 1,182 | 1,182 | 1,139 | 1,178 | 1,182 |
| False accepts, section occurrences | | 836 | 0 | 10 | 0 |
| False accepts, real document titles | | 658 | 0 | 5 | 0 |
| False accepts, synthetic titles (4,267) | | 4,267 | 0 | 0 | 0 |

## 5. Readers of `effective_date` and what each proposal changes

| Reader | Use | Banner on clinical base | Real DATE on notices | Null + year/sequence | Manual header date (optional) |
|---|---|---|---|---|---|
| primitives/amendments.ts:30 | newest-first list, LIMIT 50 | rows keep row dates; 2105 and month-0 rows go | 12 wrong newest picks fixed; ties 56 → 39; no Cypher change | new ORDER BY needed; "unknown date" shown | none |
| retrieval/backends/amendment-context.ts:40 | 5 (amendment, base) pairs: title score, date, id | none | same-year ties resolved by real recency | falls to id unless rewritten | none |
| retrieval/backends/keyword.ts:105 | 6 documents per type group: title score, date, id | clinical siblings reorder | still 6 notices, 0 manuals on the NEMT probe | manuals get through by id order | manuals sort ahead of older notices |
| retrieval/backends/document-expansion.ts:112 | header sections; date is the first key | none | notice sections still precede undated manual sections | all empty, score order | manual header sections sort with the newest notices |
| frame/context/routing.ts:92 | HCWD notice sections: score, date, no final key | none | real recency | all empty, order undefined | none |
| primitives/policy-lookup.ts:79-80 | lookup row order | a different wrong sibling wins (11A-1: 11A-10 → 11A-17); still 6 of 9 colliding numbers wrong | none (0 of 204 notices have a policy number) | none | orders duplicate manual copies |
| primitives/sections.ts:40,77 → tools/read.ts:24 → evidence.ts:133 | `Effective:` on every getSection result | changes on sections of 81 policies (61 later, 15 earlier, 5 gain a date) | changes on sections of 204 notices; label should read `Dated:` | line disappears for notices | appears for 147 manuals |
| document-metadata.ts:27 → all tools → evidence.ts:108, :184 | document metadata, amendment list | same 81 | same 204 | "unknown date" at :184 | 147 manuals |
| pipeline references/resolver.py:26-34, :193-198 | canonical document for a citation; parent-prefix rule | 6 of 22 families retarget | none | none | none |
| pipeline eval/levels/answer.py:495 | treats amendment effective dates as cited graph data | n/a | judge stops rewarding January 1 dates | n/a | n/a |
| web, contracts | no reader (no `effectiveDate` or `effective_date` in packages/web/src or packages/contracts/src) | | | | |

## 6. Consumers of `authoritativeDocument` and `baseDocument`

| Consumer | Use today | Change |
|---|---|---|
| policy-corpus types.ts:223-224 | type | new shape |
| frame/pipelines/amendment.ts:78-91 | pushes them as document candidates at 1.3 and 0.9 on the non-latest lane | remove the pushes; lookups first |
| agent tools/navigate.ts:36-51 | schema; "the authoritative document to cite now" | new schema and description |
| agent prompt.ts:93 | "Use authoritativeDocument … as the default current document" | cite the consolidated document; `latestAmendment` describes change only |
| agent deep-research/agents.ts:84 | "Check getAmendments for every document you would present as current." | text can stay |
| verifier evidence.ts:168-195 | source key and link from the authoritative id; "Authoritative document:" and "Base document:" blocks | key and link from `document`; new headings |
| verifier verify.ts:65 | prompt rule on superseded sections; reads evidence text only | none |
| web lib/message-sources.ts:265-277 | adds authoritative, base and every amendment as sources (same URL and policy number collapse to one) | read `document`, `amends`, `amendments` |
| web components/ToolStep.tsx:177-187 | "N amendments, Current document: <authoritativeDocument.title>" | show the queried document |
| tests | nine files named in the finding | rewrite assertions |

The model can be told to cite the consolidated manual with a separate `latestAmendment`: nothing in the graph needs an amendment to be authoritative (the single non-notice AMENDS edge is a mis-link). No reader needs revision rows to carry the `Document` label. After relabelling, `getDocument` on a revision id returns nothing, which is acceptable once frames stop exposing those ids.

## 7. Ordered change list (R = needs a corpus rebuild)

Readers first; each is correct on today's graph.
1. policy-lookup.ts: exact-match-first key (corpus-frames-02). Independent of every date choice.
2. amendment.ts: lookups first at 1.8; `getAmendments` once per non-amendment lookup; no amendment document pushes. Must ship with or before step 3.
3. amendments.ts: label-free `amend` (also amendment-context.ts:22); shape `{document, amends, amendments, latestAmendment, truncated}`; `title DESC` before id.
4. keyword.ts:105 and document-expansion.ts:112: status before date; routing.ts:92: final id key.
5. change-markers.ts: one tolerant explicit pattern; finalize.ts and amendment.ts per corpus-frames-09 steps 2 and 3.
6. Agent and web text: prompt.ts:93, navigate.ts, evidence.ts (`Dated:` for amendment status; headings), message-sources.ts, ToolStep.tsx, tests; drop `change_notice` from tools/search.ts:19 and prompt.ts:86 if revisions are relabelled.

Pipeline, one change and one rebuild.
7. **R** shared printed-date helper: shapes, calendar check, bound = `source_changed_at` + 366 days.
8. **R** `_parse_revision_rows` through the helper: two-digit years, "(eff. …)" suffix, rows from every section of a clinical policy (or at least titles containing "history"), one entry per (policy, date).
9. **R** loader, clinical: banner first, latest valid row as fallback.
10. **R** loader, DHHS notices: DATE line; no fabrication.
11. **R** revision rows written as `:PolicyRevision`; stale rows deleted in the same transaction.
12. **R** resolver: remove the parent-prefix rule.
13. **R**, optional, after 9 and 10 are verified: newest dated revision header of a DHHS manual into that manual's `effective_date`.

After the rebuild.
14. Re-run the retrieval-ranking tests, one retrieval evaluation and the amendment questions of the answer evaluation; confirm q-043/h-043 still resolve to the newest table row (April 15, 2025) through `latestAmendment` while the policy's own date reads January 1, 2025.
