---
title: Deep Research Workflow Fixes
summary: Deep research workflow fixes cover worker synthesis guardrails, deterministic citation verification, OpenAI o1 routing, immediate cancelled-state handling on decline, and human-readable corpus source labels.
tags: []
related: [agent_architecture/context/curated_operational_knowledge.md, frontend_ui/chat_page_transport/authenticated_chat_transport_reinitialization.md, agent_architecture/nc_medicaid_agent/startup_and_web_ui_hardening.md]
keywords: []
createdAt: '2026-06-20T20:36:52.089Z'
updatedAt: '2026-06-21T05:39:51.447Z'
consolidated_at: '2026-06-21T19:22:24.797Z'
consolidated_from: [{date: '2026-06-21T19:22:24.797Z', path: agent_architecture/deep_research_workflow_fixes/deep_research_workflow_fixes.md, reason: 'These two files are redundant topical siblings under deep_research_workflow/deep_research_workflow_fixes and both document PR-driven fixes to the deep research feature. They overlap heavily in subject matter and should be consolidated into a single, richer fixes document that preserves all unique details: worker synthesis/verification fixes, OpenAI o1 routing, cancel-state behavior, and human-readable source labels.'}]
---
## Reason
Consolidated deep research workflow fixes from multiple PR review passes.

## Raw Concept
**Task:**
Document deep-research workflow fixes for worker synthesis, citation verification, model routing, cancel UX, and readable source labels.

**Changes:**
- Added onIterationComplete worker guard to force final summary near tool budget exhaustion
- Raised WORKER_MAX_STEPS from 12 to 16
- Replaced chat-tuned verifier with deterministic validateAnswerUrls grounding
- Strengthened report agent instructions to require ATX headings and avoid asking for more input
- Added o1 model-prefix routing to OpenAI in createModel
- Changed decline() to mark cancelled immediately
- Introduced sourceLabel(SourceEntry) for readable corpus source labels

**Files:**
- packages/agent/src/deep-research/workflow.ts
- packages/agent/src/deep-research/agents.ts
- packages/agent/src/deep-research/config.ts
- packages/agent/src/deep-research/schemas.ts
- packages/agent/src/model.ts
- packages/web/src/lib/use-deep-research.ts

**Flow:**
planner -> worker research -> forced synthesis near step limit -> report synthesis -> deterministic citation grounding -> completion
review -> code update -> merged to main -> verification of model routing, cancel UX, and source label formatting

**Timestamp:** 2026-06-21T05:39:24.565Z

**Author:** greptile PR review

## Narrative
### Structure
The workflow fix spans worker iteration control, report verification, agent model selection, browser deep-research state transitions, and workflow verification output.

### Dependencies
Depends on @mastra/core/agent for OnIterationCompleteHandler and on the hallucination-verifier helper validateAnswerUrls for deterministic citation checking. Model routing depends on matching provider prefixes correctly; cancel handling depends on workflow bailout behavior; source labeling depends on parsing serialized evidence text.

### Highlights
The live fix resolved empty findings from worker agents, verifier miscalibration on long cited reports, OpenAI o1 routing failures, the flash of a researching state on cancel, and raw section IDs in corpus source labels.

### Rules
1. agent.generate(msgs, { structuredOutput: { schema }, maxSteps }) returns FullOutput with typed .object, .text, and .toolResults.
2. createStep execute receives { inputData, resumeData, suspend, writer, mastra, bail }.
3. writer.write(data) must be awaited.
4. Workflow suspend payload is keyed by step ID and may appear at result.steps['plan-approval'].suspendPayload.
5. createModel exported type must be annotated as ReturnType<ReturnType<typeof createOpenAI>>.
6. The web client must check suspendPayload, steps[stepId].suspendPayload, and suspendPayload.subQuestions when extracting the approval plan.
7. CLI deep research runs auto-approve the plan.
8. OpenAI reasoning models use the o1/o3/o4 prefixes; everything non-OpenAI (claude-*) routes to Anthropic.
9. The decline round-trip just bails the workflow to a cancelled report, so show the cancelled state immediately rather than flashing "Researching…".
10. The project forbids exposing raw internal IDs (sec:doc:…) in the UI.

### Examples
Example CLI: npx tsx src/index.ts --deep-research "question". Example approval resume payload: { approved: true, editedSubQuestions?: [...] }. Example decline payload: { approved: false }. Example label formatting: Policy 5B § 2.3 — Therapeutic Leave.

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
- **deep_research_pr**: PR #17 was merged to main as c61709f. [project]
- **model_factory_sharing**: createModel in packages/agent/src/model.ts is shared by both the chat agent and deep-research agents. [project]
- **openai_model_routing_bug**: OpenAI model routing originally matched gpt-, o3, and o4 prefixes only, which caused o1 models such as o1-mini and o1-preview to route to Anthropic and fail with auth/model-not-found. [project]
- **openai_model_routing_fix**: The fix added an o1 prefix to the OpenAI branch in createModel. [project]
- **decline_status_fix**: packages/web/src/lib/use-deep-research.ts decline() now sets status to cancelled immediately instead of researching before awaiting the cancel round-trip. [project]
- **cancel_ui_flash_fix**: The decline behavior avoids flashing the wrong phase, including spinner and sub-question list, on Cancel. [project]
- **raw_id_violation**: deep-research/workflow.ts verifyStep previously emitted corpusSources.label as the raw section key, violating the no-raw-IDs rule. [project]
- **source_label_helper**: The new sourceLabel(SourceEntry) helper parses serialized evidence text with Title, Section, and Policy lines into readable labels such as Policy 5B § 2.3 — Therapeutic Leave. [project]
- **source_label_fallback**: sourceLabel(SourceEntry) falls back to the source key only when no usable metadata is present. [project]
