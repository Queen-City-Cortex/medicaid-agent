---
children_hash: 9edef668cd3de939029e840a7d13bf7578f5104af10c0fbb95a3aead720edb29
compression_ratio: 0.6533864541832669
condensation_order: 0
covers: [cross_reference_evaluation_level_2.md]
covers_token_total: 753
summary_level: d0
token_count: 492
type: summary
---
# Level 2 Cross-Reference Evaluation

Structural overview of the Level 2 cross-reference evaluation pipeline used by QA to verify golden evidence relationships in Neo4j.

## Core purpose
- Confirms whether golden cross-references are supported by graph relationships between documents and sections.
- Primary entry point: `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`.

## Evaluation flow
- `entry -> iterate cross_references -> document-level Neo4j query -> section-level fallback -> compute metrics -> aggregate results`
- For each golden entry:
  - Skip entries without `cross_references`.
  - Run `MATCH (a)-[:REFERENCES_DOCUMENT|AMENDS]-(b)` to resolve direct document links.
  - If no document-level match exists, fall back to a section-level `REFERENCES` chain.
  - Record resolved/missed counts and derived precision/recall.

## Key relationships and rules
- Resolution counts a reference as found when the graph contains:
  - `REFERENCES_DOCUMENT`
  - `AMENDS`
- Section-level fallback exists specifically to capture indirect relationships when document edges are missing.
- Metrics currently use:
  - `total_refs = len(cross_references)`
  - `precision = recall = resolved_count / total_refs` when `total_refs > 0`
- `false_resolutions` and `extraction_misses` are still hard-coded to `0` pending future instrumentation.

## Data captured for downstream aggregation
- `resolved_count`
- `missed_count`
- `precision`
- `recall`
- `difficulty`
- `reasoning_type`
- `primary_hit`

## Dependencies
- Uses `pipeline.graph.connection.get_session` to execute Neo4j `MATCH` queries over `Document` and `Section` nodes.

## Notable outcome
- The fallback and bidirectional edge checking improved coverage, resolving 2/5 previously failing references.
- Remaining unresolved references noted for extraction improvement: `q-004`, `q-009`, `q-020`.

## Drill-down
- `cross_reference_evaluation_level_2.md` — full evaluation design, flow, and metrics details