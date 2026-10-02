---
children_hash: 3b292e2896d39247b6cbed9e5f75c1d9d2a066374ec4aad182ea274d56b5bbab
compression_ratio: 0.5948275862068966
condensation_order: 0
covers: [cross_reference_evaluation_level_2.md]
covers_token_total: 464
summary_level: d0
token_count: 276
type: summary
---
## Cross-Reference Evaluation

- **Cross Reference Evaluation Level 2**: level-2 cross-reference resolution evaluation in `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`.
- Core behavior: reference detection → resolution → level-2 evaluation → outcome.
- Key changes:
  - Added bidirectional **AMENDS** checking alongside **REFERENCES_DOCUMENT** edges.
  - Added section-level **REFERENCES** fallback when document-level edges are missing.
  - Tracks `resolved_count`, `missed_count`, and per-entry precision/recall for aggregates.
- Rule: `total_refs = len(cross_references)`; precision/recall default to `resolved_count / total_refs` when `total_refs > 0`; `false_resolutions` and `extraction_misses` remain hard-coded to `0` until instrumentation exists.
- Related drill-downs: `qa/evaluation_pipeline/evaluation_pipeline.md`, `qa/evaluation_pipeline/answer_quality_and_cross_reference_evaluation.md`, `qa/evaluation_pipeline/answer_evaluation_level_3.md`, `qa/hallucination_verifier/hallucination_verifier_processor.md`, `qa/playwright_e2e/medicaid_agent_playwright_e2e_infrastructure.md`.