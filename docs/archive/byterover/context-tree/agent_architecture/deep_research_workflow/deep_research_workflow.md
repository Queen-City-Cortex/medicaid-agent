---
title: Deep Research Workflow
summary: DeepResearchWorkflow is a Mastra vNext pipeline with planning, HITL approval, parallel research, bounded reflection, synthesis, and verification, plus matching client and CLI support.
tags: []
related: [agent_architecture/deep_research_workflow/deep_research_workflow.md, agent_architecture/context/curated_operational_knowledge.md]
keywords: []
createdAt: '2026-06-20T20:10:29.173Z'
updatedAt: '2026-06-20T20:10:29.173Z'
---
## Reason
Document the new Mastra deep research workflow, agents, client handling, and CLI integration

## Raw Concept
**Task:**
Document the Deep Research feature implemented as the Mastra vNext workflow deepResearchWorkflow and its supporting agents, client integration, and CLI runner

**Changes:**
- Added a Deep Research feature implemented as a Mastra vNext workflow named deepResearchWorkflow
- Introduced a HITL plan-approval suspend/resume step before research proceeds
- Implemented parallel research fan-out with bounded reflection and novelty-based stopping
- Added synthesis and verification steps that produce a cited markdown report
- Added client-side workflow state handling for suspend/resume payload variants
- Added CLI support for auto-approved deep research runs

**Files:**
- packages/agent/src/deep-research/workflow.ts
- packages/agent/src/deep-research/agents.ts
- packages/agent/src/model.ts
- packages/web/src/lib/use-deep-research.ts
- packages/agent/src/index.ts

**Flow:**
plan -> HITL plan-approval suspend -> research fan-out -> bounded reflection -> synthesize -> verify

**Timestamp:** 2026-06-20T20:10:11.604Z

**Author:** ByteRover context engineer

**Patterns:**
- `run.start/startAsync result suspendPayload = { 'plan-approval': { brief, subQuestions } }` - Workflow suspension payload is keyed by step id
- `ReturnType<ReturnType<typeof createOpenAI>>` - Provider model type annotation required by Mastra
- `npx tsx src/index.ts --deep-research 'q'` - CLI invocation for deep research mode

## Narrative
### Structure
The workflow is composed of five steps: plan, plan-approval, research, synthesize, and verify. The planner agent creates a brief and sub-questions, the approval step suspends for human review, research fans out over sub-questions with bounded reflection, synthesis writes the report, and verification rewrites or scores the result against sources.

### Dependencies
The workflow reuses corpus retrieval tools and the hallucination verifier, optionally uses Exa web search, and depends on Mastra vNext workflow typings plus the provider model factory in packages/agent/src/model.ts. The web client must tolerate multiple suspendPayload shapes, and the CLI uses autoApprove for unattended runs.

### Highlights
Verified Mastra 1.17 behavior includes agent.generate returning FullOutput, createStep execute receiving inputData/resumeData/suspend/writer/mastra/bail, writer.write requiring await, and workflow suspension payloads being keyed by step id. The deep research runner can run headless from the CLI and the verifier can rewrite the final answer when enabled.

### Rules
1. agent.generate(msgs, { structuredOutput: { schema }, maxSteps }) returns FullOutput with typed .object, .text, and .toolResults.
2. createStep execute receives { inputData, resumeData, suspend, writer, mastra, bail }.
3. writer.write(data) must be awaited.
4. Workflow suspend payload is keyed by step ID and may appear at result.steps['plan-approval'].suspendPayload.
5. createModel exported type must be annotated as ReturnType<ReturnType<typeof createOpenAI>>.
6. The web client must check suspendPayload, steps[stepId].suspendPayload, and suspendPayload.subQuestions when extracting the approval plan.
7. CLI deep research runs auto-approve the plan.

### Examples
Example CLI: npx tsx src/index.ts --deep-research "question". Example approval resume payload: { approved: true, editedSubQuestions?: [...] }. Example decline payload: { approved: false }.
