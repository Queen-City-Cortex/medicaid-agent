# Working artifact from the pipeline-refs-federal-jev reviewer

## A. Measurements

All offline with the repo's own functions unless marked live. Local data: `packages/pipeline/data/ecfr-cache` (CFR API responses of 2026-04-17, USC pages of 2026-06-12), `packages/pipeline/data/parsed`, and a scratch copy of `packages/crawler/data/crawler.db`.

| Area | Measure | Value |
| --- | --- | --- |
| SSA text | Title XIX characters after the source-credit line | 1,288,422 of 2,661,134 (48%) |
| SSA text | Title XXI, same | 117,674 of 361,774 (33%) |
| SSA text | Section 1902 notes share | 540,879 of 815,229 (66%) |
| SSA text | Child 1902(yy): total / real (yy) text | 543,119 / 2,241 chars |
| SSA split | Children created (XIX + XXI) | 235 + 23 = 258 |
| SSA split | Children with wrong or nonexistent identity | 9 |
| SSA map | Headings whose source credit matches SSA_TO_USC | 55/55 mapped (XIX), 13/13 (XXI) |
| SSA currency | Marker in cached page | `currentthrough:20260413_119-83` |
| CFR dates | Wrong or missing last_revised, today's GovInfo text | 198 of 2,134 (9.3%); 119 wrong, 79 None |
| CFR dates | Same, 42 CFR Parts 430-457 | 51 (20 with a wrong earlier date) |
| CFR dates | Same, April API cache | 205 of 2,162 |
| eCFR | Cached API responses rejected by validate_part_xml | 43 of 43 (root DIV5) |
| eCFR (live) | `_download` on part 434 | 406, "requires response compression" |
| eCFR (live) | Same with `Accept-Encoding: gzip` | 200, root DIV5, rejected by validator |
| GovInfo | Parts passing `_bulk_part` on today's files | 43 of 43; 3,457 sections |
| GovInfo | Title sizes (decompressed) | T2 2.9 MB, T42 23.0 MB, T45 13.8 MB |
| Resolver | Section refs in 173 clinical policies | 5,183 |
| Resolver | Attributed to another policy | 671 (12.9%); 620 likely internal |
| Resolver | Distance to the chosen policy mention over 1,000 chars | 602 |
| Resolver | In revision tables / prose | 636 / 18 |
| Resolver | Policy refs: exact / normalized / prefix / unresolved | 3,753 / 272 / 61 / 146 |
| Resolver | Ambiguous prefix fallbacks | 59 of 61 |
| Waiver | Documents sharing policy_number 1915(c) | 4 (shortest title: Innovations, Oct. 23, 2018) |
| Waiver | 1915(c) mentions / documents | 706 / 105 (+108 in 42 CFR sections with (i)) |
| Waiver | 1915(i) mentions / documents | 2,371 / 107 |
| Extraction | 'section 19xx' in CFR text: any case / extracted | 894 / 161 |
| Extraction | Intra-CFR '§ N.N' refs, none extracted | 9,977 |
| Extraction | State docs: lowercase section 19xx / § 19xx / USC / G.S. / NCAC | 1,079 / 813 / 1,075 / 661 / 1,102 |
| Extraction | All 7 patterns over 99.8M chars | 1.3 s |
| Amendments | Change notices / AMENDS edges / fan-out edges | 212 / 939 / 577 |
| Amendments | 'Revised SPA' matches / public notices / edges | 16 / 15 / 36 |
| Amendments | Clinical policies: total / with chain / table under other heading | 177 / 124 / 47 |
| Amendments | Synthetic documents / same-date extras | 4,252 / 2,800 |
| Amendments | Implausible dates | 11A-10 `2105-09-01`; 1C-1 `2010-00-01` |
| LLM extractor | Catalog lines / chars / lines with no policy number | 4,365 / 368,594 / 3,874 |
| Jev | Scope fixture rows / distinct templates | 200 / 38 |
| Jev | Reservation per attempt: roles / routing / true maximum | $0.0244 / $0.0835 / $0.0027 |
| Jev | Ledger RPC overhead per metered OpenAI call | about 46 ms |

## B. Statute children with a wrong identity

| Node created | What it really is | Size |
| --- | --- | --- |
| 1903(bb) | Nested item (bb) inside 1903(aa) | 239 |
| 1903(cc) | Nested item; no such subsection | 81 |
| 1903(dd) | Nested item, then the real 1903(bb) and all notes; no such subsection | 187,317 |
| 1917(i) | Text of a future-amendment note; 1917 ends at (h) | 30,474 |
| 1919(i) | Clause (i) inside 1919(h); the real (i) starts at offset 18,736 | 22,705 |
| 1923(i) | Clause (i) inside 1923(h) | 2,251 |
| 1932(i) | Clause (i) inside 1932(h) | 5,991 |
| 2104(i) | Clause (i) inside 2104(h) | 11,468 |
| 2105(i) | Clause (i) inside 2105(h), Rural health transformation program; no such subsection | 39,304 |

## C. Scratch scripts

In `<review scratch directory, not kept>/pipeline-refs-federal-jev/`:

- Federal regulations: `ecfr_check.py`, `ecfr_check2.py`, `bulk_check.py`, `ecfr_live.py`
- Statutes: `ssa_check.py` to `ssa_check6.py`, `ssa_map_check.py`
- References: `regex_cov.py`, `ssa21_check.py`, `xdoc_sim.py`, `waiver_count.py`, `section_ctx_sim.py`, `section_ctx_sim2.py`, `attach_sim.py`, `llm_check.py`
- Amendments: `amend_sim.py` to `amend_sim5.py`, `registry_sim.py`
- Jev: `ledger-timing/time_rpc.py`
- Notes: `NOTES-draft-findings.md`

## D. Live sources consulted (2026-10-04)

- ecfr.gov versioner API: `titles.json` and one part (title 42, part 434), with and without `Accept-Encoding`.
- govinfo.gov bulk eCFR XML for titles 2, 42 and 45.
- docs.typesafe.ai: `llms.txt`, `api`, `models`, `concepts/state`, `confidence`, `primitives/noul`, `model-jaggedness/jev-1.13`.
