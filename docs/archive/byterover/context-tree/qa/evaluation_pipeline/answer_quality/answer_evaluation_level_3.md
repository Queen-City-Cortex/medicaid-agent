---
title: Answer Evaluation Level 3
summary: Answer quality evaluation criteria and level-3 assessment behavior.
tags: []
related: [qa/launch_blockers/launch_blocker_fixes.md, qa/evaluation_pipeline/evaluation_pipeline.md, qa/evaluation_pipeline/answer_quality_and_cross_reference_evaluation.md, qa/evaluation_pipeline/cross_reference_resolution/cross_reference_evaluation_level_2.md, qa/hallucination_verifier/hallucination_verifier_processor.md, qa/playwright_e2e/medicaid_agent_playwright_e2e_infrastructure.md, qa/playwright_e2e/context.md, qa/evaluation_pipeline/context.md]
keywords: []
createdAt: '2026-04-03T05:53:41.079Z'
updatedAt: '2026-06-13T03:00:23.083Z'
---
## Reason
Curate extracted facts from context

## Raw Concept
**Task:**
Document the answer evaluation level 3 criteria inside the evaluation pipeline

**Changes:**
- Added HTTP-first agent invocation with CLI fallback and error logging for agent connectivity issues.
- Agent errors now emit zeroed scores with explanation so failures remain traceable.
- Judge errors are recorded with None metrics to keep aggregate calculations accurate.
- Captured answer-quality evaluation rules and scoring behavior

**Files:**
- packages/pipeline/src/pipeline/eval/levels/answer.py

**Flow:**
response generation -> evaluation -> level-3 assessment -> feedback

**Timestamp:** 2026-06-12

**Author:** Medicaid QA Evaluation Team

## Narrative
### Structure
Represents the highest-level answer quality assessment used in the evaluation pipeline.

### Dependencies
Depends on evaluation pipeline rules and citation fidelity expectations.

### Highlights
Captures the level-3 evaluation focus for answer quality.

### Rules
Rule: When judge_answer raises or returns an error_type judge, set factual_accuracy/completeness/overall/citation_quality to None so aggregator treats the score as missing. Rule: When agent_error is truthy, default all numeric scores to 0 and keep the explanation string for logging.
