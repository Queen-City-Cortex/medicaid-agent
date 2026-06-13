---
children_hash: c909f465c92aa57be6a3d21e2bfe4a5228c8a64871c31e8d09d7fca59368702b
compression_ratio: 0.4427390791027155
condensation_order: 1
covers: [curated_operational_knowledge.md]
covers_token_total: 847
summary_level: d1
token_count: 375
type: summary
---
# Curated Operational Knowledge

A durable operational knowledge entry documenting cross-cutting patterns for retrieval, message parsing, and curation workflow preferences. It is intentionally minimal and serves as a curated knowledge anchor rather than a procedural guide.

## Core structure
- **Reason:** Captures durable knowledge from the provided context block.
- **Raw Concept:** Defines the task as documenting curated knowledge about retrieval, parsing, and curation patterns.
- **Flow:** `context input -> extract factual statements -> group by subject -> upsert curated knowledge`
- **Timestamp:** `2026-06-12T05:52:40.638Z`

## Key preserved facts and patterns
- Retrieval heuristics, especially **hybrid policy search**, are a primary preserved pattern.
- Message parsing behavior includes **legacy fallback behavior**.
- Curation workflow preferences emphasize **structured curation workflow** and fact extraction/grouping before upsert.

## Relationships and dependencies
- Depends on **context tree organization** and prior curated modules.
- Closely related drill-down areas:
  - `agent_architecture/packages_pipeline/retrieval_fixes.md`
  - `frontend_ui/message_persistence_parsing/message_persistence_parsing.md`
  - `agent_architecture/context.md`

## What this entry is for
- Preserves operational conventions that should be reused across curation and retrieval work.
- Acts as a consolidated summary of durable knowledge spanning retrieval, parsing, and knowledge organization.