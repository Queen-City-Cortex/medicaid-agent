---
children_hash: d38a4577a582cee63b33efbe3387d4de718f843461535be365851e4de666cc41
compression_ratio: 0.4463840399002494
condensation_order: 1
covers: [context.md, getamendments_optional_match_filtering.md]
covers_token_total: 802
summary_level: d1
token_count: 358
type: summary
---
### navigate_tools (context.md)
- Describes how the navigate tools module structures Neo4j queries for `getAmendments`, focusing on optional-match behavior, document metadata expectations, and authoritative document selection.
- Highlights interaction with `mapDocumentMetadataRecord` (requires non-null IDs) and outlines that ordered amendment rows drive authoritative-document selection.
- Relates to Neo4j output validation practices noted under `agent_architecture/neo4j_tool_output_validation/neo4j_tool_output_validation.md` for consistent handling.

### getAmendments optional match filtering (getamendments_optional_match_filtering.md)
- Task documents the necessary filter in `packages/agent/src/tools/navigate.ts` that removes null-`id` rows emitted by Neo4j’s `OPTIONAL MATCH` before metadata mapping.
- Flow: find document → OPTIONAL MATCH amendments → filter null `id` rows → `mapDocumentMetadataRecord` → sort amendments → determine base and authoritative documents.
- Dependencies: Document metadata schema, `mapDocumentMetadataRecord`, and Zod schemas enforcing non-null `id`.
- Key rule: apply `.filter(rec => rec.get('id') != null)` immediately after the OPTIONAL MATCH to avoid Zod validation failures.
- Facts preserved: Neo4j emits one all-null row when no amendments exist; filtering prevents Zod errors; amendment rows are ordered by `effective_date` desc and `id` asc so the first row becomes authoritative.