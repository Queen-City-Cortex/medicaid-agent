---
children_hash: 66875ccea88f63e23a4d1d4ec6735b4a1e37fc199baf043f543d2fe56d6a41b9
compression_ratio: 0.1967862133209129
condensation_order: 1
covers: [cli_runner.md, cli_runner_memory_guardrails.md, context.md, mastra_nc_medicaid_navigator_configuration.md, nc_medicaid_navigator_agent.md, observational_memory_and_policy_guidance.md]
covers_token_total: 4294
summary_level: d1
token_count: 845
type: summary
---
### NC Medicaid Navigator Agent (agent_architecture/nc_medicaid_agent)

- **Architecture & Flow**  
  - `packages/agent/src/index.ts` boots Mastra with LibSQL storage, Mastra Memory (observational + resource-scoped working memory), toolset, and server/CLI runner that exposes the `/chat` API and CLI interface (`npx tsx src/index.ts "question"`).  
  - Workflow: CLI/web input → `searchSections` (document-type routing) → pick section via `getSection` → call `getAmendments`/`followReferences` → enforce citation/amendment guidance in the dynamic instructions function → answer with enforced anti-hallucination guardrails → log observations via observational memory → respond while closing the Neo4j driver.

- **Memory & Instructions**  
  - Observational memory uses OpenAI GPT-5.4-mini, backed by @mastra/memory ≥1.1.0 with LibSQL (but supporting pg/mongodb) to compress tool-heavy conversations and prevent context drift.  
  - Working memory is resource-scoped, seeded with a Medicaid user profile/preference template (role, organization, region, detail level, topics) and rebuilt per run.  
  - Instructions are now an `instructions()` function that prepends the current date/time before injecting policy guidance, removes the static tool count (Mastra injects actual tools at runtime), and keeps instructions aligned with incoming context.

- **Tools & Guardrails**  
  - Agent bundles eight tools: `searchSections`, `getSection`, `getDocument`, `getSectionContext`, `followReferences`, `getAmendments`, `findConceptSections`, `lookupPolicy`, plus the `HallucinationVerifier` processor.  
  - System prompt enforces citation of exact section IDs/policy numbers, amendment awareness (cite change notices and effective dates), policy-type routing (e.g., `dhhs_policy` for eligibility, `clinical_policy` for medical necessity), and mandates `lookupPolicy` when policy numbers appear.  
  - MAX_STEPS is set to 40 with `onIterationComplete` forcing synthesis near the limit and emitting warning text.

- **CLI Runner Specifics (cli_runner.md & cli_runner_memory_guardrails.md)**  
  - CLI invocation: `npx tsx src/index.ts "question"` → loads Mastra, storage, memory, tools, and injects observational memory payload `{ thread: cli-${Date.now()}, resource: "cli" }` since top-level `threadId/resourceId` are deprecated.  
  - CLI ensures a unique thread per run, uses Pino logging, warns via `onIterationComplete` when approaching `MAX_STEPS`, and always calls `closeDriver()` after printing the answer.  
  - Guardrails require narration after tool batches (per rule text), and usage instructions emphasize emitting summary messages, tool limits, markdown responses, and explicit references to policy sections.  
  - Observational memory payload pattern matches the web UI’s MastraAgentChatTransport handshake for consistent memory association.

- **Key Relationships & Dependencies**  
  - Mastra server (host 0.0.0.0, default port 4111 with env-driven CORS) hosts the agent and observer/reflector loops.  
  - Dependencies include @mastra/core, @mastra/memory, @mastra/libsql, AI SDKs (OpenAI/Anthropic), custom tools (`search.js`, `read.js`, `navigate.js`, `concepts.js`, `lookup.js`), and processors like `hallucination-verifier`.  
  - Stress on closing the Neo4j driver per run ensures resource cleanup, and DuckDB + LibSQL + Neo4j form the observability/storage stack.