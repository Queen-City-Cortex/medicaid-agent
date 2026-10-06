# Trimmed GovInfo Statute Compilation fixtures

Public-domain United States Government text (17 U.S.C. 105), cut from the
GovInfo Statute Compilation packages on 2026-10-06:

| Fixture | Source package | Source file sha256 | Current through | Processed |
| --- | --- | --- | --- | --- |
| `COMPS-8765.trimmed.xml` | https://www.govinfo.gov/content/pkg/COMPS-8765/uslm/COMPS-8765.xml (Title XIX, 3,205,005 bytes) | `6b29717a08f39eb88cbf1f5fcba6a97e542d39c43f1804b2a9cee8c62cd8fee6` | P.L. 119–75 | 2026-09-11 |
| `COMPS-8770.trimmed.xml` | https://www.govinfo.gov/content/pkg/COMPS-8770/uslm/COMPS-8770.xml (Title XXI, 598,575 bytes) | `78adeee289b1b7ae348a8fc725ee41d3f1b0f2e0416a37e2e11b13ae6683528e` | P.L. 119–75 | 2026-02-20 |

Each fixture keeps the package `meta` block and a handful of sections; the
preface and table of contents are dropped and most subsections are cut to
their first paragraph or two, so the files are a few percent of the originals.
Kept on purpose:

- 1902 with subsection (a) paragraphs (34) (the P.L. 119-21 retroactive-coverage
  wording) and (77) (footnote 8, a delayed-effective amendment), (kk) with its
  footnote 12, and the P.L. 119–75 editorial note.
- 1903 with its "(h) Repealed" and "(n) Repealed" editorial notes and all
  direct subsections (a) through (bb): the HTML parser fabricated 1903(cc) and (dd).
- 1905 with its section-level footnote 24; 1906A whole, with footnote 27.
- 1917 (a) through (h): the HTML parser fabricated 1917(i).
- 2105 (a) through (h): the HTML parser fabricated 2105(i).
- 2108 with its two subsections (e).
- The six anchor sections the client requires: 1902, 1905, 1915, 2101, 2103, 2110.
