# Working artifact from the pipeline-parse-graph reviewer

## A. Probe ledger

All scripts are in the scratch directory `review/pipeline-parse-graph/`. They are read-only, offline, and import the real pipeline functions with `CORPUS_DATA_ROOT` pointed at scratch, an unroutable `NEO4J_URI` and empty provider keys. "Local corpus" is the workstation copy: 4,143 sidecars parsed March to July 2026 at cache version 2, with no HTML sources and no parsed `.xls`.

| Script | Population | What ran | Result |
| --- | --- | --- | --- |
| sidecar_stats.py | 4,143 local sidecars | stdlib JSON read | `docling_version` is "unknown" in all; 993 parse exceptions, 984 of them the RapidOCR torch configuration error on 2026-07-11 |
| hier.py, bodies.py, effdate.py | committed fixture 1A-14 | `build_sections_from_items`, `_assign_hierarchy`, `_extract_effective_date` | 45 of 46 headers at depth 1; lettered headings are roots; list markers absent; 12 of 23 dates unmatched; table 5,591 vs 2,795 chars |
| corpus_probe.py | 176 clinical, 60 DHHS, 40 SPA, 17 manual, 9 contract documents | loader section builder | hierarchy, list-marker and padding counts |
| cp_probe.py, cp_dates.py, odd_dates.py | 176 clinical policies | `_extract_effective_date` vs each document's own Amended Date line | equal 93, older 60, newer 15, none 5 |
| ocr_gate.py | 145 PDFs, hash-verified against sidecars | `_parse_pdf_once` on saved Docling documents, then `evaluate_no_ocr_pdf` with pypdf | 0 accepted |
| ocr_gate_pages.py | 80 PDFs, 1,181 substantive pages | same normalisation, per page | 3 exact matches; 41 documents with tables |
| xls_probe.py, xls_render.py, xls_render2.py | 291 local .xls | xlrd cell types; `parse_xls` on one file | 387,336 date cells in 149 files rendered as serials |
| docx_html.py | synthetic files in scratch | `parse_docx`, `parse_html` | table moved to last section; HTML table dropped |
| force_probe.py | scratch corpus root | `parse_all` twice, second forced with parser patched to raise | parsed 1, errors 0, artifact unchanged |
| linker_probe.py | 5,156 sections from 230 documents | `_build_term_pattern`, `_determine_relationship`, `SEED_CONCEPTS` | 2,598 edges, 88% COVERS |
| trunc_probe.py | 176 clinical policies | loader bodies against the 6,000-character cap | 191 over; 122 only because of padding |
| inline lock script | uv.lock | tomllib | nvidia and triton wheels 2,170 MB; torch 531 MB |
| inline registry query | local crawler.db, opened `mode=ro` | sqlite3 | 212 active change notices; up to 30 share one fabricated date |

## B. converter.py responsibility map (1,837 lines)

| Lines | Responsibility | Suggested home |
| --- | --- | --- |
| 65-77 | Docling converter factory | parse/pdf.py |
| 80-153 | hashing, output paths, timeout setting, cache validation | parse/cache.py |
| 156-259 | synthetic section helpers, table renderer, quality flags, markdown | parse/sections.py (shared with the loader) |
| 262-475 | PDF walk, no-OCR gate, two-pass `parse_pdf` | parse/pdf.py |
| 478-875 | DOCX, XLSX, XLS, PPTX, DOC and HTML parsers | parse/formats/*.py |
| 878-967 | attempt counters, atomic writes, legacy sidecar migration | parse/cache.py |
| 970-1101 | three sidecar writers | parse/sidecar.py (one dataclass) |
| 1104-1202 | discovery and dispatch | parse/run.py |
| 1205-1357 | worker entry, result validation, semaphore cleanup, supervised spawn | parse/isolation.py |
| 1360-1606 | parse inventory and release evidence | parse/inventory.py |
| 1609-1837 | run state and the `parse_all` orchestrator | parse/run.py |

The larger structural issue is that sections are derived twice: `_parse_pdf_once` walks the Docling document for quality statistics and the loader walks it again for the graph, with different table rendering. One shared builder would remove that drift.

## C. What invalidates a cached parse

| Change | Invalidates? |
| --- | --- |
| Source file bytes | yes |
| `PARSE_CACHE_VERSION` bump (manual) | yes; v4 and v5 are migrated in place |
| Fee-XLSX representation marker | yes, fee XLSX only |
| Artifact JSON or markdown bytes | yes |
| Previous parse failed or was not answer-ready | always retried |
| Docling, docling-core, layout or table model versions | no |
| OCR engine, OCR weights, OCR on or off | no |
| `PdfPipelineOptions` or thresholds such as `MIN_SUBSTANTIVE_PAGE_CHARS` | no |
| python-docx, openpyxl, xlrd, python-pptx, LibreOffice versions | no |
| Parser code edits without a version bump | no |

## D. Brief questions that turned out fine

- Cypher built by string formatting: no injection path (see strengths).
- Chunking against model limits: bounded correctly by characters and by locally counted tokens.
- Idempotent MERGE versus duplicates: sound; unique constraints exist and are created before load.
- Embedding idempotency and partial failure: a failed batch aborts the run, and a rerun resumes only the missing vectors.
- Orphan cleanup inside a document: stale sections, chunks and structure edges are removed in the same transaction.
