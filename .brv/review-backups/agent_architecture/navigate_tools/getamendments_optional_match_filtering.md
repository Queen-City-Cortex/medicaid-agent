---
title: getAmendments optional match filtering
tags: []
related: [agent_architecture/neo4j_tool_output_validation/neo4j_tool_output_validation.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-02T19:58:24.413Z'
updatedAt: '2026-04-02T19:58:24.413Z'
---
## Raw Concept
**Task:**
Document the optional match null row filtering requirement for the getAmendments tool in packages/agent/src/tools/navigate.ts.

**Changes:**
- Added a filter to drop amendment rows whose id is null before mapping metadata.
- Clarified that the WHERE amend IS NOT NULL predicate does not stop Neo4j from emitting the outer MATCH row with null fields when no amendment exists.

**Files:**
- packages/agent/src/tools/navigate.ts

**Flow:**
find document -> OPTIONAL MATCH amendments -> filter out null id rows -> mapDocumentMetadataRecord -> sort amendments -> derive base and authoritative documents

**Timestamp:** 2026-04-02

## Narrative
### Structure
getAmendments runs inside withSession, matches the requested document, optionally matches in-bound AMENDS relationships, orders the amendment rows by effective_date desc then id asc, and returns mapped metadata along with baseDocument and authoritativeDocument selections.

### Dependencies
Depends on DocumentMetadataSchema for the shape of document metadata, mapDocumentMetadataRecord to hydrate each Neo4j record, and the zod schemas that require id to be non-null, so the records must be sanitized before validation.

### Highlights
Because Neo4j emits a single null-filled row for the OPTIONAL MATCH even when there are no amendments, the code must filter amendment rows where id is null before mapping so that changeSummary and metadata conversions pass zod validation and the base/authoritative logic continues to work.

### Rules
Rule 1: After the OPTIONAL MATCH of amendments, immediately apply .filter(rec => rec.get('id') != null) before calling mapDocumentMetadataRecord because a null row leaks through the outer MATCH and z.string() will fail otherwise.

## Facts
- **neo4j_optional_match_null_row**: When a document lacks amendments, the Neo4j OPTIONAL MATCH still returns one row where every column is null, so the outer MATCH row remains even though no amendment exists. [project]
- **metadata_mapping_filter**: Filtering amendment records with .filter(rec => rec.get('id') != null) before calling mapDocumentMetadataRecord prevents Zod from rejecting the null id that the empty OPTIONAL MATCH row would otherwise expose. [project]
- **amendment_ordering**: Amendment rows are ordered by amend.effective_date descending and amend.id ascending so that the first row always represents the latest change and becomes the authoritativeDocument. [project]
