---
title: Evaluation Pipeline
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-03T05:53:41.078Z'
updatedAt: '2026-04-03T05:53:41.078Z'
related: [qa/launch_blockers/launch_blocker_fixes.md, qa/evaluation_pipeline/answer_quality_and_cross_reference_evaluation.md, qa/evaluation_pipeline/answer_quality/answer_evaluation_level_3.md, qa/evaluation_pipeline/cross_reference_resolution/cross_reference_evaluation_level_2.md, qa/hallucination_verifier/hallucination_verifier_processor.md, qa/playwright_e2e/medicaid_agent_playwright_e2e_infrastructure.md, qa/playwright_e2e/context.md, qa/evaluation_pipeline/context.md, qa/evaluation_pipeline/held_out_evaluation_dataset_and_ssa_ingestion_rules.md]
---
## Raw Concept
**Task:**
Document the QA evaluation pipeline that drives Level 3 answer scoring and Level 2 cross-reference resolution for the NC Medicaid agent golden dataset.

**Changes:**
- Answer evaluation now records None scores for judge errors and excludes them from aggregated metrics.
- Cross-reference evaluation checks document-level REFERENCES_DOCUMENT/AMENDS edges plus section-level REFERENCES fallbacks to improve pass rates.
- Remaining golden dataset failures (q-004, q-009, q-020) target the reference extraction pipeline for further improvement.

**Files:**
- packages/pipeline/src/pipeline/eval/levels/answer.py
- packages/pipeline/src/pipeline/eval/levels/cross_ref.py

**Flow:**
Golden entry -> Level 3 answer evaluation (agent invocation, evidence retrieval, judge scoring) -> Level 2 cross-reference resolution (graph relationship checks) -> aggregated QA metrics for recall, precision, and primary hit.

**Timestamp:** 2026-04-03

**Author:** Medicaid QA Evaluation Team

## Narrative
### Structure
Evaluation is composed of two layers: Level 3 runs end-to-end answer scoring that invokes the agent, retrieves Neo4j evidence, and calls judge_answer; Level 2 validates documented cross-references by querying the graph relationships and section references. Each layer appends metadata such as difficulty, reasoning type, and primary hit for golden dataset entries before handing data to downstream aggregates.

### Dependencies
Depends on the judge_answer scoring logic, the Neo4j session helpers, and AGENT_DIR configuration to reach the ncMedicaidAgent endpoint.

### Highlights
Judge errors now emit None scores so aggregate metrics skip them, and cross-reference checks now pass through bidirectional AMENDS plus section-level REFERENCES to recover previously missed relationships.
