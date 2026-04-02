---
title: Amendment Detection Pipeline
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-02T19:24:07.999Z'
updatedAt: '2026-04-02T19:24:07.999Z'
---
## Raw Concept
**Task:**
Document the NC Medicaid amendment detection pipeline and its sentence boundary/context extraction updates.

**Changes:**
- Fixed _is_sentence_boundary so periods in MA-series references (e.g., MA-2180.IV.I) do not terminate context extraction.
- Improved _extract_context to span the full sentence even when references contain dots after the MA number.
- Reinforced AMENDS edge creation by deduplicating change_description entries before batch merge and by tagging amendment-origin docs status="amendment".

**Files:**
- packages/pipeline/src/pipeline/references/amendments.py

**Flow:**
1. Query all documents → 2. Identify change notices and revised SPAs → 3. Collect sections and MA/SPA numbers → 4. Extract context excerpts using sentence-boundary heuristics → 5. Build AMENDS edges with deduplicated descriptions and update document statuses in Neo4j.

**Timestamp:** 2026-04-02

**Patterns:**
- `CHANGE\s+NOTICE\s+FOR\s+MANUAL\s+NO\.\s*([\w\-]+)` (flags: i) - Captures DHHS change notice titles to recognize change notice documents.
- `((?:MA|DMA|DHB|DSS)-\d+)` (flags: i) - Finds MA-series policy numbers inside titles or content for linking amendments.
- `SPA\s+(\d+[\s\-]+\d+)` (flags: i) - Extracts multi-part SPA numbers, including patterns like "NC SPA 12-001" and "SPA 14 047".

## Narrative
### Structure
The module defines helper predicates (e.g., _is_change_notice, _is_revised_spa, _is_signal_section, _is_sentence_boundary) followed by detect_amendments(), which orchestrates data gathering, context extraction, and Neo4j writes.

### Dependencies
Relies on pipeline.config.GRAPH_BATCH_SIZE, pipeline.graph.connection.get_session, pipeline.graph.queries for Cypher batches, pipeline.utils.batching.chunked, and rich.console.Console for progress logging.

### Highlights
Improved context for MA-2180.IV.I change descriptions, signal sections prioritized over fallback bodies, and change_notice/revised SPA docs now explicitly labeled status="amendment" after edges are merged.

### Rules
Rule 1: Treat periods followed by alphanumeric characters as part of references, not sentence boundaries. Rule 2: Signal sections are recognized when their title/body mention CONTENT OF CHANGE, POLICY UPDATE, MAINTENANCE OF MANUAL, or include an MA-series number. Rule 3: Use deduplicated change_description entries per (source, target) pair before running queries.MERGE_AMENDS_BATCH. Rule 4: After edges are created, mark change notice/revised SPA documents status="amendment" via batch update.

### Examples
Example: context extraction now returns "MA-2180.IV.I - HCWD Premiums Income chart has been updated" instead of truncating to "MA-2180." because the dot following IV is not treated as end of sentence.

## Facts
- **sentence_boundary_detection**: Sentence boundary detection now treats periods followed by alphanumeric characters as reference punctuation so MA-2180.IV.I stays in context. [project]
- **signal_section_detection**: Signal sections include titles or bodies containing CONTENT OF CHANGE, POLICY UPDATE, or MAINTENANCE OF MANUAL, or any MA-series number. [project]
- **amends_edge_creation**: AMENDS edges are emitted via queries.MERGE_AMENDS_BATCH with deduplicated change_description lines, and change notice documents are marked status="amendment" through queries.SET_DOCUMENT_STATUS_BATCH. [project]
