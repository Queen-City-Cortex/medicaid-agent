---
related: [qa/launch_blockers/launch_blocker_fixes.md, qa/evaluation_pipeline/evaluation_pipeline.md, qa/evaluation_pipeline/answer_quality_and_cross_reference_evaluation.md, qa/evaluation_pipeline/answer_quality/answer_evaluation_level_3.md, qa/evaluation_pipeline/cross_reference_resolution/cross_reference_evaluation_level_2.md, qa/hallucination_verifier/hallucination_verifier_processor.md, qa/playwright_e2e/medicaid_agent_playwright_e2e_infrastructure.md, qa/evaluation_pipeline/context.md]
---
# Topic: playwright_e2e

## Overview
Describes the Playwright-based e2e infrastructure under e2e/, including the config, mock helpers, and chat page object used by both mocked and smoke suites.

## Key Concepts
- Playwright projects (mocked + smoke) with tailored timeouts
- MastraStreamBuilder for synthesizing SSE responses
- mockMastraAPI routes for streaming, thread, and message endpoints
- ChatPage page object encapsulating selectors and actions
