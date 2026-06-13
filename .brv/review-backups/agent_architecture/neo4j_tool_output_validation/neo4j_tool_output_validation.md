---
title: Neo4j Tool Output Validation
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-02T02:46:00.980Z'
updatedAt: '2026-04-02T02:46:00.980Z'
---
## Raw Concept
**Task:**
Normalize Neo4j-backed read tool outputs by converting integer metadata to JavaScript numbers before Zod validation and by providing structural context for sections.

**Changes:**
- Converted Neo4j Integer numeric metadata to JS numbers for getSection and getDocument outputs.
- Added container-heading handling in getSection that assembles up to 6K characters of children when the parent lacks its own content.
- Documented getSectionContext ancestors/siblings/children queries and their ordering rules to explain structural navigation.

**Files:**
- packages/agent/src/tools/read.ts

**Flow:**
API input (sectionId/documentId) -> withSession -> session.run Neo4j queries -> collect records -> convert Integer properties to JS numbers (content_length, chars) -> apply container-child or ancestor/sibling/children logic -> return schema-validated payload.

**Timestamp:** 2026-04-02

## Narrative
### Structure
read.ts exports getSection, getDocument, and getSectionContext tooling. getSection fetches a single Section node, and if the record lacks textual content it gathers its children while enforcing a 6,000-character cap. getDocument collects document metadata plus a sections array and now normalizes content_length/chars via toNumber(). getSectionContext queries ancestors (ordered by path length), direct children (by section_number), and siblings (respecting NEXT_SIBLING chains where available).

### Dependencies
Each tool runs inside withSession and relies on DocumentMetadataSchema, documentMetadataReturn, and mapDocumentMetadataRecord. z.Schema validations (DocumentMetadataSchema + section structs) require numeric fields to be plain JS numbers, so every Neo4j Integer must be cast before returning.

### Highlights
Agents previously saw silent validation errors when Neo4j returned Integer objects for numeric metadata; the fix prevents retries by converting those Integers via toNumber() before zod validation. Container headings now proactively return aggregated children content, improving the agent experience when top-level sections are mere headings.

## Facts
- **neo4j_integer_return**: Neo4j driver returns Integer objects for numeric properties such as content_length and chars when queries are executed via session.run. [project]
- **neo4j_integer_conversion**: getDocument now converts any Neo4j Integer to a JavaScript number using toNumber() before the data hits the Zod schema, preventing validation failures. [project]
- **section_container_expansion**: getSection returns child content for empty container headings, iterating up to 6K characters and truncating with a note when there are more child sections. [convention]
