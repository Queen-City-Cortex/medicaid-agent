---
children_hash: e9802388e0e8897a4ce2e7d7856439e2d23fb51aeb178d3558cde56528f228d4
compression_ratio: 0.3099848139711465
condensation_order: 2
covers: [amendment_pipeline_and_prompt/_index.md, context.md, local_dev_setup/_index.md, mastra_server_configuration/_index.md, navigate_tools/_index.md, nc_medicaid_agent/_index.md, neo4j_tool_output_validation/_index.md, search_tooling/_index.md]
covers_token_total: 5268
summary_level: d2
token_count: 1633
type: summary
---
# Agent Architecture Structural Summary (d2)

## Domain Overview (`context.md`)
- Captures NC Medicaid Navigator agent architecture: bootstrapping, memory/storage, policy guardrails, and citation rules; excludes unrelated Mastra tutorials and non-policy services.
- Owned by NC Medicaid Agent team; serves onboarding and policy audit needs.

## Amendment Pipeline & Prompt Guardrails (`amendment_pipeline_and_prompt/_index.md`)
- **Pipeline Flow**: Signals prefer depth-1 `getAmendments` traversals, aggregate long sections and `change_description`, sort doc hits by effective date/distance, and emit stats while filtering noisy body-only edges (`amendment_signal_extraction`, `get_amendments_selection`).
- **System Prompt Rules**: Lists available tools, mandates `getAmendments`, routes HCWD questions to dhhs_policy MA-2180, cautions on LTC partnership amendments, and enforces plain-language, policy-difference, and verification messaging (`system_prompt_rules`).
- **Infrastructure Dependencies**: Regex-driven change detection (`_CHANGE_NOTICE_RE`, `_MA_SERIES_RE`, `_REVISED_SPA_RE`), `GRAPH_BATCH_SIZE` batching, Navigator/metadata helpers, Anthropic/OpenAI clients, LibSQLStore/DuckDB storage, memory templates, HallucinationVerifier/Mastra settings, CLI runner flow that ends with markdown responses citing policy differences.

## Local Development Setup (`local_dev_setup/_index.md`)
- **Workflow**: Root `package.json` scripts (`npm run dev`, `dev:infra`, `dev:stop`, etc.) orchestrate Neo4j 5 (`ports 7474/7687`, `neo4j-data` volume) via Docker Compose and parallel @nc-medicaid web/agent dev servers using npm workspaces, Turbo, and TypeScript tooling.
- **Environment Consolidation**: Root `.env` now centralizes LLM (OpenAI, Anthropic, Voyage) and WorkOS credentials (client ID/key/cookie/redirects), WorkOS test user `Testing@queencitycortex.com`, and shared secrets; agent/web `.env` files symlink to it to keep credentials synchronized, requiring root updates before restarts.

## Mastra Server Configuration (`mastra_server_configuration/_index.md`)
- **Timeout Tuning**: `packages/agent/src/index.ts` raises `server.timeout` from 3 minutes to `10 * 60 * 1000` to keep SSE streams alive during multi-step navigator research, documenting the safeguard in the server block alongside host/port/CORS/API routes.

## Navigate Tools (`navigate_tools/_index.md`)
- **Neo4j Query Guardrails**: `packages/agent/src/tools/navigate.ts` filters null-`id` rows immediately after `OPTIONAL MATCH` to satisfy `mapDocumentMetadataRecord` and Zod schemas, ensuring authoritative document selection uses ordered amendment rows (`effective_date` desc, `id` asc) while preventing validation failures.

## NC Medicaid Navigator Agent (`nc_medicaid_agent/_index.md`)
- **CLI Runner & Memory Guardrails** (`cli_runner.md`, `cli_runner_memory_guardrails.md`): `src/index.ts` binds Mastra, tools, LibSQL/DuckDB storage, Neo4j cleanup, and models (Anthropic/OpenAI); CLI runs via `npx tsx src/index.ts`, uses unique `cli-${Date.now()}` threads, enforces `maxSteps=99`, onIterationComplete finalization, Mastra-compliant memory payloads, and anti-hallucination guardrails.
- **Agent Configuration & Prompting** (`nc_medicaid_navigator_agent.md`, `document_metadata_and_agent_prompt/_index.md`, `observational_memory_and_policy_guidance.md`, `mastra_nc_medicaid_navigator_configuration.md`):
  - Memory built on LibSQL with observational memory (`gpt-5.4-mini`) plus resource-scoped templates seeded with Medicaid profile details.
  - Instructions function rebuilds prompts per request, injecting current datetime, stripping hardcoded tool counts (Mastra provides tools), and enforcing tool-first workflows, citation duties (section IDs, policy numbers, effective dates, URLs), amendment checks, and forced synthesis warnings.
  - Metadata helpers expose fields (`id`, `title`, `type`, `policy_number`, `effective_date`, `url`, `status`, `source_url`) for citations while system prompts demand `getAmendments` usage and markdown formatting.
- **Observational Memory & UI** (`startup_and_web_ui_hardening.md`): Server exposes `/chat` and `/healthz`, validates Neo4j status, and configures web UI (`AGENT_ID=nc-medicaid-navigator`, `DefaultChatTransport` to `${MASTRA_URL}/chat`, AGENT_URL fallback, thread/memory metadata, input limits/auto-resize, spinner states). UI enforces tool-first policies, anti-hallucination mandates (verbatim facts, plan distinctions) and re-run behaviors.
- **LibSQL Fix** (`libsql_storage_fix_for_railway.md`): Railway Alpine lacked `ld-linux-x86-64.so.2`, so DuckDB and MastraCompositeStore removed; LibSQLStore now handles persistence and observational memory, avoiding glibc dependencies.

## Neo4j Tool Output Validation (`neo4j_tool_output_validation/_index.md`)
- **Integer Normalization**: All numeric Neo4j properties (e.g., `content_length`, `chars`) convert from `Integer` to JS numbers before Zod validation to stop silent retries and satisfy `DocumentMetadataSchema`.
- **Container Heading Expansion**: `getSection` aggregates up to 6,000 characters from child sections for empty headings and adds truncation notices when needed.
- **Structural Context Queries**: `getSectionContext` retrieves ancestors (by path length), children (`section_number` order), and siblings (`NEXT_SIBLING`), documenting clear navigation relationships for agents.

## Search Tooling (`search_tooling/_index.md`)
- **Hybrid Policy Search** (`hybrid_policy_search_tool.md`): `searchSections` (`packages/agent/src/tools/search.ts`) validates queries with Zod, obtains embeddings via `embedQuery`, executes per-type-group (clinical_policy, dhhs_policy, federal statutes) section/chunk vector searches, optionally adds concept graph/full-text hits, and dedupes by `sectionId` before `rrfFuse` with `RRF_K=60`. Per-group logic uses `perGroupK = max(topK, 10)` when type filters absent, and concept graph hits require `content_length > 200` plus non-null `section_number`. Dependencies include Voyage credentials, Neo4j indexes (`section_embeddings`, `chunk_embeddings`, `PolicyConcept`), and helper utilities (`recordToHit`, `dedup`, `rrfFuse`).

## Relationships & Drill-Down Paths
- Consult `agent_architecture/amendment_pipeline_and_prompt/_index.md`, `local_dev_setup/_index.md`, `mastra_server_configuration/_index.md`, `navigate_tools/_index.md`, `nc_medicaid_agent/_index.md`, `neo4j_tool_output_validation/_index.md`, and `search_tooling/_index.md` for detailed flows, guardrails, infrastructure, and tooling decisions.