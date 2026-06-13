---
related: [qa/launch_blockers/launch_blocker_fixes.md, qa/evaluation_pipeline/evaluation_pipeline.md, qa/evaluation_pipeline/answer_quality_and_cross_reference_evaluation.md, qa/evaluation_pipeline/answer_quality/answer_evaluation_level_3.md, qa/evaluation_pipeline/cross_reference_resolution/cross_reference_evaluation_level_2.md, qa/hallucination_verifier/hallucination_verifier_processor.md, qa/playwright_e2e/medicaid_agent_playwright_e2e_infrastructure.md, qa/playwright_e2e/context.md, qa/evaluation_pipeline/held_out_evaluation_dataset_and_ssa_ingestion_rules.md, qa/hallucination_verifier/cli_verifier_flow_and_stdout_contract.md, qa/launch_blockers/remediation_plan_2026_06_11.md]
---
# Topic: evaluation_pipeline

## Overview
Describes the pipelines that score agent answers against golden data and verify cross-reference relationships for the Medicaid navigator QA suite.

## Key Concepts
- End-to-end answer evaluation with HTTP/CLI agent invocation
- Evidence fetching from Neo4j to feed the judge
- Cross-reference resolution checks using REFERENCES_DOCUMENT, AMENDS, and section REFERENCES paths
- Aggregator rules for excluding judge errors from metrics

## Related Topics
- qa/hallucination_verifier - for hallucination verifier processor details
- qa/playwright_e2e - for e2e infrastructure coverage
