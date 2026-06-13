---
title: SSA Parser Subsection Splitting Fix
summary: SSA parser now splits only top-level lettered subsections from large USC statute sections, preserves parent text, and skips nested roman numeral markers unless they match the strict expected sequence.
tags: []
related: [database_operations/neo4j_hybrid_search/neo4j_hybrid_search_indexing.md, agent_architecture/packages_pipeline/context.md]
keywords: []
createdAt: '2026-06-12T22:36:44.082Z'
updatedAt: '2026-06-12T22:36:44.082Z'
---
## Reason
Document the root cause fix for splitting large SSA statute sections into stable child subsections

## Raw Concept
**Task:**
Document the SSA parser fix for parsing large USC HTML statute sections into citable SSA subsections

**Changes:**
- Split top-level lettered subsections into child section dicts
- Preserved parent section full text to keep existing ids and citations stable
- Added strict expected-letter sequencing to avoid misclassifying nested roman numeral markers
- Used USC-to-SSA mapping and skipped unmapped or freestanding USC sections

**Files:**
- packages/pipeline/src/pipeline/federal/ssa_parser.py

**Flow:**
parse USC HTML -> find section heads -> map USC to SSA -> retain parent section -> split large sections into top-level lettered child subsections -> ingest and embed

**Timestamp:** 2026-06-12

**Patterns:**
- `^\(([a-z]{1,2})\)\s*(.*)$` (flags: m) - Matches top-level lettered subsection markers at the start of a line
- `^§+\s*([0-9][0-9a-z-]*)\.\s*(.+)$` - Extracts USC section number and title from section heading text

## Narrative
### Structure
The parser builds SSA section dicts from USC HTML, maps USC numbers to SSA numbers, and then splits oversized sections into level-2 child subsections when the content crosses the split threshold.

### Dependencies
Depends on USC_TO_SSA and FREESTANDING_USC_SECTIONS mappings from ssa_client.py, and on downstream ingest-ssa plus embedding workflows.

### Highlights
This fix prevents stable parent citations from being overwritten while still exposing citable subsection identities such as 1905(r).

### Rules
Sections larger than SUBSECTION_SPLIT_MIN_CHARS (30,000) are eligible for top-level subsection splitting. Subsection markers must appear in strict sequence (a → b → … → z → aa → …). Nested roman numeral markers are not treated as top-level subsection boundaries unless they match the next expected letter. Unmapped USC sections are skipped with a warning or note.

### Examples
Example child identity: sec:doc:federal_statute:ssa-title-?-1905(r)-r is represented as a child with id <parent>-<letter> and section_number 1905(r).

## Facts
- **subsection_split_threshold**: ssa_parser._split_statute_subsections emits TOP-LEVEL lettered subsections of statute sections larger than 30K chars as level-2 children [project]
- **child_section_identity**: Child subsection ids are formed as <parent>-<letter> and parent_id is set on the child section [project]
- **subsection_sequence_tracking**: Strict a->b->...->z->aa sequence tracking rejects nested roman-numeral line starts; 'i' is only accepted directly after 'h' [project]
- **parent_text_retention**: Parents keep full text so ids and citations stay stable [project]
- **usc_subsection_count**: Real USC HTML contains 235 subsections across 15 statutes [project]
- **ssa_1905_r_size**: SSA section 1905(r) is a 3.9K-char EPSDT-definition section [project]
- **post_change_actions**: The parser requires ingest-ssa and embed after parser changes [project]
