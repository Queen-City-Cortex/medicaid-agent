---
title: SSA and CFR Reference Resolution Fixes
summary: P0 fixes for SSA/USC mapping, SSA parser robustness, CFR citation parsing, and part-level supersession redirects.
tags: []
related: [agent_architecture/nc_medicaid_agent/cli_runner.md, agent_architecture/nc_medicaid_agent/context.md]
keywords: []
createdAt: '2026-06-12T02:34:25.161Z'
updatedAt: '2026-06-12T02:34:25.161Z'
---
## Reason
Document the P0 fixes for SSA mapping, parser behavior, and CFR supersession handling

## Raw Concept
**Task:**
Document the P0 fixes to federal statute and regulation parsing for the Medicaid agent pipeline

**Changes:**
- Corrected SSA_TO_USC mappings from USC source credits
- Updated ssa_parser to handle italicized section headings and preserve full text
- Expanded CFR regex coverage and constrained supersession redirects to part-level only
- Required re-ingest after mapping and parser corrections

**Files:**
- packages/pipeline/src/pipeline/federal/ssa_client.py
- packages/pipeline/src/pipeline/federal/ssa_parser.py
- packages/pipeline/src/pipeline/references/resolver.py

**Flow:**
USC fetch -> SSA parse -> reference extraction -> CFR parsing -> supersession redirect -> re-ingest

**Timestamp:** 2026-06-11T00:00:00Z

**Author:** Context extraction

**Patterns:**
- `C\.F\.R\.` (flags: i) - Matches CFR citations written with periods
- `Part\s+\d+` (flags: i) - Matches CFR citations that use the Part form

## Narrative
### Structure
The work spans federal SSA fetching and parsing in ssa_client.py and ssa_parser.py, plus citation resolution in resolver.py.

### Dependencies
Relies on uscode.house.gov as the source for SSA text and on cfr-supersessions.json for part-level CFR redirects.

### Highlights
The key correction is that SSA-to-USC mappings are not contiguous; section 1944 maps to 1396w-3a and there is no 1396w-7 in current law. The parser now preserves complete section text for downstream chunking and embeds.

### Rules
Supersession redirects are part-level only. Never rewrite section numbers across parts.

### Examples
Examples of re-ingest commands: ingest-ssa --refresh, extract-refs, embed.

## Facts
- **ssa_1944_mapping**: SSA 1944 maps to USC 1396w-3a (PDMP). [project]
- **ssa_1900_mapping**: SSA 1900 maps to USC 1396. [project]
- **ssa_1901_mapping**: SSA 1901 maps to USC 1396-1. [project]
- **ssa_w7_absent**: There is no w-7 section in current law. [project]
- **ssa_parser_heading_parsing**: The SSA parser handles italic l and o headings in USC HTML. [project]
- **ssa_parser_aliasing**: The SSA parser uses no aliasing fallback. [project]
- **ssa_parser_truncation**: The SSA parser removes the 50K truncation cap and keeps full section text. [project]
- **cfr_regex_coverage**: The CFR citation regex now matches C.F.R. and Part forms. [project]
- **cfr_supersession_scope**: CFR supersession redirects are part-level only and never rewrite section numbers across parts. [project]
- **reingest_steps**: Re-ingest requires ingest-ssa --refresh, extract-refs, and embed. [project]
