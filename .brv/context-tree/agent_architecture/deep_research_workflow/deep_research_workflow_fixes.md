---
title: Deep Research Workflow Fixes
summary: Deep research workers now force a final cited summary before tool budget exhaustion, and report verification now uses deterministic URL grounding instead of a chat-tuned hallucination verifier.
tags: []
related: [agent_architecture/context/curated_operational_knowledge.md, agent_architecture/nc_medicaid_agent/startup_and_web_ui_hardening.md]
keywords: []
createdAt: '2026-06-20T20:36:52.089Z'
updatedAt: '2026-06-20T20:36:52.089Z'
---
## Reason
Document fixes to deep-research worker synthesis and citation verification

## Raw Concept
**Task:**
Document deep-research workflow fixes for worker synthesis and citation verification

**Changes:**
- Added onIterationComplete worker guard to force final summary near tool budget exhaustion
- Raised WORKER_MAX_STEPS from 12 to 16
- Replaced chat-tuned verifier with deterministic validateAnswerUrls grounding
- Strengthened report agent instructions to require ATX headings and avoid asking for more input

**Files:**
- packages/agent/src/deep-research/workflow.ts
- packages/agent/src/deep-research/agents.ts
- packages/agent/src/deep-research/config.ts
- packages/agent/src/deep-research/schemas.ts

**Flow:**
planner -> worker research -> forced synthesis near step limit -> report synthesis -> deterministic citation grounding -> completion

**Timestamp:** 2026-06-20T20:36:23.273Z

## Narrative
### Structure
The workflow step now protects against blank worker outputs by injecting feedback two steps before the worker step limit, and the verification pass now grounds citations against retrieved sources rather than using a long-report hallucination verifier.

### Dependencies
Depends on @mastra/core/agent for OnIterationCompleteHandler and on the hallucination-verifier helper validateAnswerUrls for deterministic citation checking.

### Highlights
The live fix resolved both empty findings from worker agents and verifier miscalibration on 22-23k character reports with many citations.

### Examples
A worker that reaches iteration WORKER_MAX_STEPS - 2 with finishReason tool-calls is told to stop and write its final cited summary immediately.

## Facts
- **worker_finish_reason**: The deep-research worker can end with finishReason='tool-calls' and empty text when it spends its entire step budget on tool calls. [project]
- **worker_iteration_handler**: The worker fix adds onIterationComplete using OnIterationCompleteHandler from @mastra/core/agent. [project]
- **worker_force_synthesis_rule**: When iteration >= WORKER_MAX_STEPS - 2 and finishReason === tool-calls, the worker receives feedback to write its final cited summary NOW and returns continue: false. [project]
- **worker_max_steps**: WORKER_MAX_STEPS default was increased from 12 to 16. [project]
- **verification_strategy**: The deep-research verify step now uses validateAnswerUrls(reportMarkdown, sources) instead of runVerificationForAnswer. [project]
- **citation_grounding_behavior**: validateAnswerUrls demotes citation URLs not backed by a retrieved source to plain text and counts checked, grounded, and fabricated citations. [project]
- **report_agent_instructions**: The report agent instructions require ATX headings, never asking the user to paste findings, and never asking for permission. [project]
- **deep_research_model_behavior**: The default DEEP_RESEARCH_MODEL is gpt-5.4, and gpt-5-mini tends to produce flatter bullet lists and over-claim more often. [project]
- **verification_result**: The verify step logs 82/82 citations grounded and 0 fabricated in a live gpt-5.4 run. [project]
- **worker_result**: The worker now returns finishReason stop and a full cited summary after the synthesis guard is added. [project]
