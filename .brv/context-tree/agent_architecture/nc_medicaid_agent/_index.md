---
children_hash: 31579e41e22c4ccd1f79d28db09b2ff66fef533b3ada359a19e607c75d175430
compression_ratio: 0.17505433873934126
condensation_order: 1
covers: [cli_runner.md, cli_runner_memory_guardrails.md, context.md, libsql_storage_fix_for_railway.md, mastra_nc_medicaid_navigator_configuration.md, nc_medicaid_navigator_agent.md, observational_memory_and_policy_guidance.md, startup_and_web_ui_hardening.md]
covers_token_total: 5981
summary_level: d1
token_count: 1047
type: summary
---
# NC Medicaid Navigator Agent Surface (Level d1)

## Core Architecture and Startup (`context.md`, `startup_and_web_ui_hardening.md`)
- **Overall agent stack**: Mastra server (`packages/agent/src/index.ts`) wires LibSQL-backed storage, observational memory (openai/gpt-5.4-mini), resource-scoped working memory, model providers (OpenAI for gpt-series, Anthropic otherwise), observability/exporter tooling, and the `nc_medicaid_agent`.
- **Guardrails and workflows**: System prompt enforces tool-first research (searchSections → getSection → getAmendments → followReferences), exact citation rules (section IDs, policy numbers, amendments), anti-hallucination constraints (verbatim facts, distinguish plan types, admit missing data), and MAX_STEPS limits with forced synthesis.
- **Startup requirements**: Environment validation ensures VOYAGE_API_KEY plus either OPENAI_API_KEY or ANTHROPIC_API_KEY; health probe `/healthz` performs Neo4j check; CLI mirrors HTTP chat behavior; web UI (`packages/web/src/app/...`) uses AGENT_ID `nc-medicaid-navigator`, DefaultChatTransport targeting `${MASTRA_URL}/chat`, enforces chat input constraints, and wraps rendering in a global error boundary.

## Agent Initialization and Memory (`nc_medicaid_navigator_agent.md`, `mastra_nc_medicaid_navigator_configuration.md`, `observational_memory_and_policy_guidance.md`)
- **Memory layers**: LibSQLStore is shared between observational memory (prefers openai/gpt-5.4-mini) and working memory (resource scope seeded with Medicaid profile/preference template); instructions are generated per request with current date/time, removing hardcoded tool counts.
- **Toolset & processors**: Agent bundles searchSections, getSection, getDocument, getSectionContext, followReferences, getAmendments, findConceptSections, lookupPolicy, plus HallucinationVerifier to enforce citation fidelity and policy-aware output.
- **Instructional flow**: Incoming question → searchSections (document-type routing) → getSection → consult amendments/context → answer citing section/policy IDs → log observations → respond in markdown with enforced rules (lookupPolicy on policy numbers, start with searchSections, mention updates).

## CLI Runner and Guardrails (`cli_runner.md`, `cli_runner_memory_guardrails.md`)
- **Invocation flow**: `npx tsx src/index.ts "question"` initializes Mastra/agent/tools, sets `agent.generate(..., maxSteps=99, memory: { thread: cli-${Date.now()}, resource: "cli" }, onIterationComplete)`, prints `---ANSWER---`, logs findings, and closes the Neo4j driver.
- **Memory payload**: CLI passes `{ thread: cli-${Date.now()}, resource: "cli" }` because threadId/resourceId are deprecated; this payload aligns with web UI MastraAgentChatTransport usage.
- **Guardrails**: `onIterationComplete` warns near MAX_STEPS (40 in agent context) and forces a final answer; tool-call batches must be narrated before resuming; CLI enforces logging/driver cleanup and anti-hallucination response conventions (headings/bullets/bold, cite policy sections).

## Deployment Fixes (`libsql_storage_fix_for_railway.md`)
- **Railway compatibility**: Removed DuckDB/ MastraCompositeStore (glibc dependency) replaced with LibSQLStore for both persistence and observability, removing `@mastra/duckdb` dependency to avoid `ld-linux-x86-64.so.2` failures on Alpine/musl.
- **Storage consolidation**: LibSQLStore now powers Memory, observational memory, and observability exporters, stabilizing Railway deployments without native bindings.

## Policy Fidelity and Observational Memory (`observational_memory_and_policy_guidance.md`)
- **Dependencies & environment**: Requires `@mastra/core`, `@mastra/memory >= 1.1.0` with libsql/pg/mongodb adapters, AI SDKs, Neo4j cleanup utilities, and hallucination-verifier processors.
- **Policies & rules enforcement**: Eight agent tools manage document routing; system prompt demands policy citations (Section IDs, policy numbers, effective dates), amendment awareness, tool order (search → section → amendment), lookupPolicy when policy numbers appear, and mentions of policy updates or scope mismatches. Observational memory compresses long tool-call conversations for context retention.