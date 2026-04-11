---
children_hash: a98fe5ad0d530ca80e6072638944d3dc6e7a8209221078f93e38e7da8d549d2a
compression_ratio: 0.2465144783208212
condensation_order: 1
covers: [cli_runner.md, cli_runner_memory_guardrails.md, context.md, document_metadata_and_agent_prompt/_index.md, libsql_storage_fix_for_railway.md, mastra_nc_medicaid_navigator_configuration.md, nc_medicaid_navigator_agent.md, observational_memory_and_policy_guidance.md, startup_and_web_ui_hardening.md]
covers_token_total: 6527
summary_level: d1
token_count: 1609
type: summary
---
# NC Medicaid Navigator Agent Overview

## Core Execution Surface
- **CLI Runner (`cli_runner.md`)**  
  - Entry point: `packages/agent/src/index.ts` wires Mastra, ncMedicaidAgent, observability, Neo4j cleanup, and extended tools (searchSections, getSection, getDocument, getSectionContext, followReferences, getAmendments, findConceptSections, lookupPolicy).  
  - Execution: `npx tsx src/index.ts "your question here"` → loads Mastra + memory + tools → `agent.generate(question, { maxSteps: 99, memory: { thread: \`cli-${Date.now()}\`, resource: "cli" }, onIterationComplete })` → log via Pino → print answer and close Neo4j driver.  
  - Dependency surface: ANTHROPIC_API_KEY/OPENAI_API_KEY for model factories, DuckDB for observability store replaced by LibSQL in rail fix, LibSQL for memory, Neo4j driver.  
  - Highlights: unique thread IDs per run, working memory captures user profile/preferences, onIterationComplete enforces final answer, system prompt encodes anti-hallucination guardrails.

- **CLI Memory Guardrails (`cli_runner_memory_guardrails.md`)**  
  - Reinforces memory payload requirements (`memory: { thread, resource }`) to align with MastraObserver expectations and to associate observational memory entries per run.  
  - Flow and dependencies mirror CLI runner, emphasizing `maxSteps=99`, onIterationComplete, and always closing the driver.  
  - Facts: UI memory handshake mirrors CLI payload; Mastra API rejects top-level threadId/resourceId; unique `cli-${Date.now()}` thread per invocation.

## Agent Configuration & Guards
- **NC Medicaid Navigator Agent (`nc_medicaid_navigator_agent.md`)**  
  - Constructs Memory atop LibSQL, enabling observational memory (`openai/gpt-5.4-mini`) plus resource-scoped working memory seeded with Medicaid profile/preferences and detail-level templates.  
  - Instructions function rebuilds system prompt per request, prepending current date/time to static policy guidance while removing hardcoded tool count because Mastra injects tools dynamically.  
  - Tools bundled include searchSections, getSection, getDocument, getSectionContext, followReferences, getAmendments, findConceptSections, lookupPolicy; HallucinationVerifier enforces citations, amendment checks, forced synthesis near MAX_STEPS=40.  
  - Rules enforce tool-first workflow, citation requirements (section IDs, policy numbers, authoritative documents), and forced synthesis warnings.

- **Observational Memory & Policy Guidance (`observational_memory_and_policy_guidance.md`)**  
  - Adds detailed system prompt rules: document-type routing (Eligibility/enrollment → dhhs_policy, Coverage → clinical_policy, etc.), amendment checking with lookupPolicy, citation requirements (section IDs, policy numbers, effective dates, amendments), and anti-hallucination mandates (verbatim facts, plan distinctions, admit uncertainty).  
  - Observational memory compresses tool-heavy conversations using openai/gpt-5.4-mini, requiring @mastra/memory >=1.1.0 with supported adapters (libsql/pg/mongodb).  
  - Server configuration: host 0.0.0.0 port 4111 with env-driven CORS origins; CLI runner mirrors HTTP behavior.

- **Mastra NC Medicaid Navigator Configuration (`mastra_nc_medicaid_navigator_configuration.md`)**  
  - Working memory template captures Medicaid user data (role, org, region, detail level, topics) scoped to each resource.  
  - Instructions function dynamically injects current date/time before policy guidance, keeping tool counts accurate via runtime injection.  
  - System prompt adjustments ensure working memory stays structured and instructions remain current.

- **Document Metadata & Agent Prompt Summary (`document_metadata_and_agent_prompt/_index.md`)**  
  - Validates environment (VOYAGE_API_KEY + OpenAI/Anthropic key) before startup, configures storage (LibSQL, DuckDB observability), SensitiveDataFilter, logging, memory, and server timeouts (10 min).  
  - Metadata helper (`document-metadata.ts`) surfaces policy fields (id, title, type, policy_number, effective_date, url, status, source_url) for citation links.  
  - System prompt mandates calling `getAmendments` for every citation, referencing section IDs/policy numbers, linking to source URLs, and formatting responses using markdown headings/bullets/bold.

## Infrastructure Hardening
- **Startup & Web UI Hardening (`startup_and_web_ui_hardening.md`)**  
  - Startup enforces VOYAGE_API_KEY plus one of OPENAI_API_KEY/ANTHROPIC_API_KEY before agent creation; Mastra config covers models, LibSQL storage, memory, observability, exporters, filters, timeouts, and logging.  
  - Exposes `/chat` and `/healthz` routes plus CLI runner; `/healthz` probes Neo4j and reports status.  
  - Web UI (`packages/web/src/app/error.tsx`, `chat/page.tsx`) uses AGENT_ID `nc-medicaid-navigator`, `DefaultChatTransport` targeting `${MASTRA_URL}/chat`, AGENT_URL fallback `http://localhost:4111`, thread/memory metadata per request, chat input limits (10k chars, auto-resize, spinner), and message/ sidebar UI states.  
  - Highlights: system prompt enforces tool-first policy research, anti-hallucination rules (verbatim facts, plan distinctions, noting updates), forced synthesis via hallucination verifier, and UI behaviors for example cards, reruns, and auto-scroll.

## Deployment Adaptations
- **LibSQL Storage Fix for Railway (`libsql_storage_fix_for_railway.md`)**  
  - Railway’s Alpine/musl environment lacked `ld-linux-x86-64.so.2`; removed DuckDB/@mastra/duckdb (glibc binding) and MastraCompositeStore.  
  - LibSQLStore now powers both persistence and observational memory/observability, eliminating glibc dependencies and stabilizing Railway deployments.  
  - Facts: Railway Alpine containers require LibSQL; LibSQLStore replaces DuckDB for all memory/observability workloads.

## Relationships & Drill-Down Paths
- Drill into `agent_architecture/nc_medicaid_agent/context.md` for the domain overview and pointers to related UI and QA topics.  
- Reference `document_metadata_and_agent_prompt/_index.md` for metadata/system prompt constraints and environment validation.  
- Explore `cli_runner.md` and `cli_runner_memory_guardrails.md` for CLI-specific memory/workflow guardrails.  
- Consult `nc_medicaid_navigator_agent.md`, `observational_memory_and_policy_guidance.md`, `mastra_nc_medicaid_navigator_configuration.md`, and `startup_and_web_ui_hardening.md` for detailed agent, memory, tooling, and UI requirements.