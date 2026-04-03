---
children_hash: 07ba9d03e663f4ecafddb456a852f6796a4e7abc82c3969e72f9a9eb20dfd664
compression_ratio: 0.1565343258891646
condensation_order: 1
covers: [cli_runner.md, cli_runner_memory_guardrails.md, context.md, libsql_storage_fix_for_railway.md, mastra_nc_medicaid_navigator_configuration.md, nc_medicaid_navigator_agent.md, observational_memory_and_policy_guidance.md]
covers_token_total: 4836
summary_level: d1
token_count: 757
type: summary
---
### NC Medicaid Navigator Agent (agent_architecture/nc_medicaid_agent)

- **Overview:** The domain documents how the Navigator agent wires Mastra components (memory, tools, server) with strict policy guardrails and anti-hallucination controls; see `context.md` for the broad structure.
- **Memory & Instructions:** LibSQL-backed Mastra Memory runs both observational (openai/gpt-5.4-mini) and resource-scoped working memory seeded with Medicaid-specific profile templates; instructions are regenerated per request to include the current date/time and now describe runtime tool injection rather than a hardcoded tool count (`mastra_nc_medicaid_navigator_configuration.md`, `nc_medicaid_navigator_agent.md`).
- **Agent Tooling & Guardrails:** The ncMedicaidAgent bundles eight tools (searchSections through lookupPolicy) plus a HallucinationVerifier, enforces document-type routing, citation/amendment workflows, and a forced synthesis on MAX_STEPS≈40 via `onIterationComplete`; rules emphasize citing section IDs/policies, calling lookupPolicy for policy numbers, and mentioning amendment dates (`observational_memory_and_policy_guidance.md`, `nc_medicaid_navigator_agent.md`).

### CLI Runner & Guardrails (agent_architecture/nc_medicaid_agent)

- **Entry & Flow:** `packages/agent/src/index.ts` exposes a `/chat` Mastra API and a CLI (`npx tsx src/index.ts "your question"`) that loads Mastra, storage, memory, tools, and observational memory; each run generates `thread=cli-${Date.now()}` and resource “cli”, then calls `agent.generate(question, {maxSteps: 99, memory, onIterationComplete})`, prints `---ANSWER---`, and closes the Neo4j driver (`cli_runner.md`).
- **Memory Hooks & Guardrails:** The CLI must supply `{ thread, resource }` memory payload (threadId/resourceId no longer allowed), rely on the Mastra memory field (matching the web UI handshake), log answers/errors, and enforce narration after tool batches plus the forced-iteration warning near MAX_STEPS to guarantee a final answer (`cli_runner_memory_guardrails.md`).
- **Anticipated Behavior:** Observational memory captures tool-call history, working memory collects user profile/preferences, and logging (Pino) plus the system prompt’s anti-hallucination guardrails (detailed citation requirements) keep responses factual; onIterationComplete warns when steps are low and forces synthesis (`cli_runner.md`).

### Deployment Storage Fix (agent_architecture/nc_medicaid_agent)

- **Railway Compatibility:** Railway Alpine/musl containers lack `ld-linux-x86-64.so.2`, so DuckDB/ MastraCompositeStore (glibc-linked) was removed; a single `LibSQLStore` now backs both Mastra memory and observability, ensuring deployments succeed without native DLL issues (`libsql_storage_fix_for_railway.md`).
- **Observability Continuity:** LibSQL continues to host observability export spans, while observational memory still runs on openai/gpt-5.4-mini and memory configuration uses the same LibSQL instance previously tied to DuckDB (`libsql_storage_fix_for_railway.md`).