---
children_hash: 3b65820ff4ea090ab00326c7cc8a7907b922da8cb4050d228b2fee5e1ae44c62
compression_ratio: 0.7776049766718507
condensation_order: 0
covers: [cross_reference_evaluation_level_2.md]
covers_token_total: 643
summary_level: d0
token_count: 500
type: summary
---
# Level 2 Cross-Reference Evaluation Overview

- **Purpose & Flow**: `cross_reference_evaluation_level_2.md` documents how the Level 2 evaluation routine (`evaluate_cross_refs`) iterates each golden entry’s `cross_references`, skips entries with none, and resolves them via Neo4j MATCH queries, falling back to section-level REFERENCES when document-level relationships aren’t found. This flow tracks per-entry counts (resolved, missed) plus resolution difficulty metadata for downstream aggregation.

- **Key Architectural Decisions**:
  - **Edge coverage**: Added bidirectional AMENDS checks alongside REFERENCES_DOCUMENT edges to capture more granular relationships between source and target documents.
  - **Fallback strategy**: When direct document edges are absent, the evaluator runs a section-to-section REFERENCES chain to recover indirect relationships.
  - **Metric tracking**: Each entry yields resolved/missed counts, with derived precision and recall (resolved_count ÷ total_refs) and placeholder zeros for false_resolutions and extraction_misses until instrumentation improves.

- **Dependencies & Assets**:
  - Relies on `pipeline.graph.connection.get_session` to execute Neo4j MATCH queries spanning Document and Section nodes.
  - Source code located at `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`.

- **Highlights & Outcomes**:
  - The updated evaluation resolves 2 of 5 previously failing references while flagging remaining ones (q-004, q-009, q-020) as extraction gaps.
  - Section-level fallbacks ensure indirect cross-reference relationships are surfaced for auditability.

- **Rules & Facts**:
  - `total_refs` equals `len(cross_references)`; precision/recall default to `resolved_count / total_refs` when `total_refs > 0`.
  - False resolutions and extraction misses remain hard-coded to 0 until further instrumentation.
  - Evaluator signals resolution when Neo4j shows either REFERENCES_DOCUMENT or AMENDS edges; otherwise, it attempts section-level chains.