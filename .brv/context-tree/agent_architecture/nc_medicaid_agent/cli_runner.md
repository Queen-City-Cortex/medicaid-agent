---
title: CLI Runner
tags: []
related: [agent_architecture/nc_medicaid_agent/observational_memory_and_policy_guidance.md, agent_architecture/nc_medicaid_agent/nc_medicaid_navigator_agent.md]
keywords: []
importance: 60
recency: 1
maturity: draft
updateCount: 2
createdAt: '2026-04-02T19:41:03.753Z'
updatedAt: '2026-04-02T19:42:53.779Z'
---
## Raw Concept
**Task:**
Document the nc-medicaid-navigator CLI runner and its memory, tool, and guardrail configuration from packages/agent/src/index.ts.

**Changes:**
- Recorded that the CLI passes a { thread, resource } memory object because threadId/resourceId are deprecated top-level options.
- Captured the observational and working memory configuration plus the tools enabled for ncMedicaidAgent.
- Preserved the response format and anti-hallucination guardrails embedded inside the system prompt and CLI entrypoint.

**Files:**
- packages/agent/src/index.ts

**Flow:**
Start with `npx tsx src/index.ts "your question here"`; load Mastra, storage, memory, and agent instructions; call agent.generate(question, { maxSteps: 99, memory: { thread: `cli-${Date.now()}`, resource: "cli" }, onIterationComplete }); print the answer, then close the Neo4j driver.

**Timestamp:** 2026-04-02

**Author:** mastra nc-medicaid-navigator team

## Narrative
### Structure
packages/agent/src/index.ts wires together Mastra, the ncMedicaidAgent, observability, logging, and extended tools (searchSections, getSection, getDocument, getSectionContext, followReferences, getAmendments, findConceptSections, lookupPolicy). The exported Mastra instance exposes a /chat API that routes requests into the CLI runner, which requires question text on the command line and injects the memory payload needed for observational memory.

### Dependencies
Depends on ANTHROPIC_API_KEY and OPENAI_API_KEY to construct anthropic/openai model factories; requires DuckDB for observability store, LibSQL storage for memory, and a Neo4j driver that must be closed after each run.

### Highlights
The CLI generates `thread` IDs using `cli-${Date.now()}` so every run has a unique observational-memory thread; working memory collects user profile and preference metadata; onIterationComplete warns when steps are low and forces a final answer; logging is handled by Pino, and the system prompt drives anti-hallucination guardrails with precise citation requirements.

### Rules
IMPORTANT: After every batch of tool calls, emit a short text message (1-2 sentences) explaining what you found and what you're doing next. The user sees tool calls as icons — without your narration they have no idea what's happening. Never make more than 3 tool calls in a row without narrating. When ready to answer, transition naturally to a well-formatted response using markdown. Use headings, bullet lists, bold for key terms. Cite specific policy sections (e.g., "Clinical Coverage Policy 1F, Section 3.2.1"). ALWAYS provide a substantive final answer — even if your research was incomplete, summarize what you found and what you could not find. CRITICAL: Anti-hallucination rules: Only state facts that appear verbatim in retrieved section content. If a specific detail (dollar amount, date, threshold, eligibility criterion) is not in the text you retrieved via getSection, say "I could not find this specific detail in the policy documents" — do NOT guess or infer from general knowledge. If you cannot find information in the database, say so clearly. Do not speculate beyond what the policy documents say. Distinguish between NC Medicaid Standard Plan and NC Medicaid Managed Care (NC HEALTH CHOICE / PHPs) where relevant. Note when a policy may have been recently updated and recommend the user verify with DHHS if the stakes are high.

### Examples
Usage: `npx tsx src/index.ts "your question here"` runs the CLI; the code logs 
---ANSWER---
 before printing the agent result and always calls closeDriver() when finished.

## Facts
- **cli_memory_payload**: CLI runner passes memory: { thread: `cli-${Date.now()}`, resource: "cli" } to agent.generate because Mastra API no longer accepts threadId/resourceId as top-level options. [project]
- **observational_memory_model**: Observational memory is backed by the openai/gpt-5.4-mini model. [project]
- **working_memory_scope**: Working memory is enabled with scope “resource” and a template that captures user profile and conversation preferences. [convention]
- **iteration_complete_guardrail**: onIterationComplete forces synthesis when MAX_STEPS is nearly reached so the CLI always returns a final answer. [convention]
