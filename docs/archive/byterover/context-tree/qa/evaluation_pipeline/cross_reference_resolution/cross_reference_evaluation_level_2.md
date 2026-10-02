---
title: Cross Reference Evaluation Level 2
summary: Cross-reference resolution evaluation behavior at level 2.
tags: []
related: [qa/launch_blockers/launch_blocker_fixes.md, qa/evaluation_pipeline/evaluation_pipeline.md, qa/evaluation_pipeline/answer_quality_and_cross_reference_evaluation.md, qa/evaluation_pipeline/answer_quality/answer_evaluation_level_3.md, qa/hallucination_verifier/hallucination_verifier_processor.md, qa/playwright_e2e/medicaid_agent_playwright_e2e_infrastructure.md, qa/playwright_e2e/context.md, qa/evaluation_pipeline/context.md]
keywords: []
createdAt: '2026-04-03T05:53:41.080Z'
updatedAt: '2026-06-13T03:00:23.085Z'
---
## Reason
Curate extracted facts from context

## Raw Concept
**Task:**
Document cross-reference resolution evaluation at level 2

**Changes:**
- Added bidirectional AMENDS checking alongside REFERENCES_DOCUMENT edges to increase resolution coverage.
- Implemented a section-level REFERENCES fallback query when document-level edges are missing.
- Tracked resolved_count, missed_count, and derived precision/recall per entry for later aggregates.
- Captured cross-reference evaluation rules and checks

**Files:**
- packages/pipeline/src/pipeline/eval/levels/cross_ref.py

**Flow:**
reference detection -> resolution -> level-2 evaluation -> outcome

**Timestamp:** 2026-06-12

**Author:** Medicaid QA Evaluation Team

## Narrative
### Structure
Describes the level-2 cross-reference evaluation path.

### Dependencies
Works with answer quality and evaluation pipeline validation.

### Highlights
Preserves the cross-reference resolution focus for evaluation recall.

### Rules
Rule: total_refs equals len(cross_references), precision/recall default to resolved_count / total_refs when total_refs > 0, and false_resolutions/extraction_misses are currently hard-coded to 0 pending future instrumentation.
