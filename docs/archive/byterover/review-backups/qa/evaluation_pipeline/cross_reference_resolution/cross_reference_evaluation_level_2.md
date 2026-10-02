---
title: Cross Reference Evaluation Level 2
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-03T05:53:41.080Z'
updatedAt: '2026-04-03T05:53:41.080Z'
related: [qa/launch_blockers/launch_blocker_fixes.md, qa/evaluation_pipeline/evaluation_pipeline.md, qa/evaluation_pipeline/answer_quality_and_cross_reference_evaluation.md, qa/evaluation_pipeline/answer_quality/answer_evaluation_level_3.md, qa/hallucination_verifier/hallucination_verifier_processor.md, qa/playwright_e2e/medicaid_agent_playwright_e2e_infrastructure.md, qa/playwright_e2e/context.md, qa/evaluation_pipeline/context.md]
---
## Raw Concept
**Task:**
Explain how Level 2 cross-reference evaluation verifies golden evidence relationships via Neo4j queries.

**Changes:**
- Added bidirectional AMENDS checking alongside REFERENCES_DOCUMENT edges to increase resolution coverage.
- Implemented a section-level REFERENCES fallback query when document-level edges are missing.
- Tracked resolved_count, missed_count, and derived precision/recall per entry for later aggregates.

**Files:**
- packages/pipeline/src/pipeline/eval/levels/cross_ref.py

**Flow:**
entry -> iterate cross_references -> run document-level query MATCH (a)-[:REFERENCES_DOCUMENT|AMENDS]-(b) -> if none, run section-level REFERENCES fallback -> compute resolved/missed counts -> append metrics including false_resolutions=0 and extraction_misses=0.

**Timestamp:** 2026-04-03

**Author:** Medicaid QA Evaluation Team

## Narrative
### Structure
evaluate_cross_refs scans each golden entry for cross_references, skips entries without any, and either marks references as resolved or missed based on graph queries. The function stores resolved/missed counts alongside difficulty, reasoning_type, and primary_hit for downstream aggregation.

### Dependencies
Depends on pipeline.graph.connection.get_session to run Neo4j MATCH queries against Document and Section nodes.

### Highlights
Cross-reference detection now resolves 2/5 previously failing references and flags the remaining (q-004, q-009, q-020) as needing extraction improvements. The fallback to section-level REFERENCES ensures indirect relationships are captured.

### Rules
Rule: total_refs equals len(cross_references), precision/recall default to resolved_count / total_refs when total_refs > 0, and false_resolutions/extraction_misses are currently hard-coded to 0 pending future instrumentation.

## Facts
- **cross_ref_relationships**: Cross-reference evaluation resolves a reference when the graph contains REFERENCES_DOCUMENT or AMENDS edges between the source and target documents. [project]
- **cross_ref_fallback**: If no direct document edge exists, the pipeline falls back to a section-level REFERENCES chain that connects sections of the source and target documents. [project]
- **cross_ref_metrics**: Precision and recall equal resolved_count / total when total > 0, while false_resolutions and extraction_misses remain 0 because they are not derived yet. [project]
