---
children_hash: b388193983198d14d71d3798a19dbffaec0ec30e72ac412ae8dbbb8ccf926713
compression_ratio: 0.40069444444444446
condensation_order: 1
covers: [deep_research_workflow.md, deep_research_workflow_fixes.md]
covers_token_total: 2880
summary_level: d1
token_count: 1154
type: summary
---
# Deep Research Workflow

This cluster documents the Mastra vNext deep research pipeline and its subsequent fixes. The core workflow is split across **`deep_research_workflow.md`** and **`deep_research_workflow_fixes.md`**, with shared implementation in `packages/agent/src/deep-research/`, `packages/agent/src/model.ts`, and the web client state handler in `packages/web/src/lib/use-deep-research.ts`.

## Core workflow: `deep_research_workflow.md`

- The workflow is a five-step pipeline: **plan → plan-approval → research → synthesize → verify**.
- It adds a **HITL approval suspend/resume** checkpoint before research begins.
- Research uses **parallel fan-out** over sub-questions with **bounded reflection** and novelty-based stopping.
- The synthesize step produces a **cited markdown report**, and verify can rewrite or score the output against sources.
- Supporting surfaces:
  - **Client** must handle multiple suspend payload shapes.
  - **CLI** supports unattended deep research runs with auto-approval.
- Key dependencies:
  - Corpus retrieval tools
  - Hallucination verifier
  - Optional Exa web search
  - Mastra vNext workflow typings
  - Provider model factory in `packages/agent/src/model.ts`

### Important implementation facts
- `agent.generate(...)` returns `FullOutput` with typed `.object`, `.text`, and `.toolResults`.
- `createStep` receives `{ inputData, resumeData, suspend, writer, mastra, bail }`.
- `writer.write(data)` must be awaited.
- Workflow suspend payloads are keyed by step ID, e.g. `result.steps['plan-approval'].suspendPayload`.
- The model type export must be annotated as `ReturnType<ReturnType<typeof createOpenAI>>`.
- CLI deep research runs auto-approve the plan.

### Drill-down references
- **`deep_research_workflow.md`** for the baseline workflow shape, approval flow, client payload handling, and CLI mode.

---

## Fixes and hardening: `deep_research_workflow_fixes.md`

This entry consolidates PR-driven fixes around worker stability, verification correctness, model routing, cancel UX, and readable source labels.

### Main fixes
- Added an **`onIterationComplete` worker guard** to force synthesis when tool budget is nearly exhausted.
- Increased **`WORKER_MAX_STEPS` from 12 to 16**.
- Replaced chat-tuned verification with deterministic **`validateAnswerUrls`** grounding.
- Strengthened report-agent instructions:
  - require **ATX headings**
  - do not ask the user for more input
  - do not ask for permission
- Added **OpenAI `o1` prefix routing** in `createModel`.
- Changed `decline()` to set **cancelled immediately**.
- Added **`sourceLabel(SourceEntry)`** to turn raw corpus evidence into human-readable labels.

### Behavioral outcomes
- Worker agents no longer end with empty findings when they spend their budget on tools.
- Verification is grounded against retrieved sources rather than a less precise chat-style verifier.
- Canceling deep research no longer flashes a temporary “researching” state.
- Corpus source labels no longer expose raw internal section IDs in the UI.

### Facts and relationships
- `createModel` is shared by both the chat agent and deep-research agents.
- OpenAI reasoning models use **`o1/o3/o4`** prefixes; non-OpenAI models route to Anthropic.
- `validateAnswerUrls(reportMarkdown, sources)` counts grounded vs fabricated citations and demotes unsupported URLs to plain text.
- `sourceLabel(SourceEntry)` parses serialized evidence text using **Title / Section / Policy** lines and falls back to the source key only when metadata is missing.

### Drill-down references
- **`deep_research_workflow_fixes.md`** for the worker synthesis guard, deterministic citation verification, OpenAI routing correction, cancel-state fix, and readable source label logic.

---

## Cross-cutting architecture

- The workflow and fixes both revolve around the same core surfaces:
  - `packages/agent/src/deep-research/workflow.ts`
  - `packages/agent/src/deep-research/agents.ts`
  - `packages/agent/src/deep-research/config.ts`
  - `packages/agent/src/deep-research/schemas.ts`
  - `packages/agent/src/model.ts`
  - `packages/web/src/lib/use-deep-research.ts`
- The overall pattern is:
  - **plan safely**
  - **pause for human approval**
  - **research in parallel**
  - **bound worker iteration**
  - **synthesize a cited answer**
  - **verify grounding deterministically**
  - **present clean client state and human-readable labels**

### Best drill-down path
- Start with **`deep_research_workflow.md`** for the original design.
- Then read **`deep_research_workflow_fixes.md`** for the operational corrections and guardrails.