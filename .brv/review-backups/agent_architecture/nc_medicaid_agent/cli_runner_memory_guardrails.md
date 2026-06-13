---
title: CLI Runner Memory Guardrails
tags: []
related: [agent_architecture/nc_medicaid_agent/observational_memory_and_policy_guidance.md, agent_architecture/nc_medicaid_agent/nc_medicaid_navigator_agent.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-02T19:40:13.647Z'
updatedAt: '2026-04-02T19:40:13.647Z'
---
## Raw Concept
**Task:**
Document NC Medicaid CLI runner memory and iteration guardrails so observational memory remains functional and outputs remain consistent.

**Changes:**
- Added explicit CLI memory payload guidance
- Captured iteration completion hook for MAX_STEPS guardrail

**Files:**
- packages/agent/src/index.ts

**Flow:**
CLI invocation -> agent.generate({ maxSteps, memory, onIterationComplete }) -> log answer or error -> closeDriver

**Timestamp:** 2026-04-02

**Author:** NC Medicaid Navigator dev notes

## Narrative
### Structure
The CLI runner (npx tsx src/index.ts "question") obtains the ncMedicaidAgent instance, then calls agent.generate with maxSteps=99, the memory payload expected by observational memory, and the onIterationComplete hook that forces a final answer when tool steps nearly exhaust.

### Dependencies
Relies on the Mastra API (MastraAgentChatTransport) memory field, Memory store configuration, and the onIterationComplete callback injected into agent.generate to manage step limits while observational memory is recorded.

### Highlights
Observational memory requires the { thread, resource } memory object rather than deprecated top-level threadId/resourceId options. The CLI matcher logs the answer or error via console and always calls closeDriver() to release the driver, ensuring the unique threadID cli-${Date.now()} stays scoped to a single run.

### Rules
Usage: npx tsx src/index.ts "your question here"
CALL agent.generate with memory: { thread: `cli-${Date.now()}`, resource: "cli" } before providing the question results to the user.

### Examples
Example memory payload: { thread: `cli-1700000000000`, resource: "cli" } (thread salted with Date.now()).

## Facts
- **cli_memory_payload**: CLI runner passes { thread: `cli-${Date.now()}`, resource: "cli" } to agent.generate() so observational memory entires can be associated with a unique run. [project]
- **memory_api_requirements**: Mastra API no longer accepts threadId/resourceId as top-level options; the new memory field must be used instead. [project]
- **ui_memory_handshake**: The web UI populates the memory field on MastraAgentChatTransport so observational memory matches the CLI payload pattern. [project]
- **cli_thread_id**: The CLI generates a unique thread id per run using cli-${Date.now()} to keep each session distinct. [project]
