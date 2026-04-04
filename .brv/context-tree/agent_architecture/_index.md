---
children_hash: 33998957bc24e79b4c3c71bab9327a0459f4f3e271256a03f046a8e406642cb7
compression_ratio: 0.3694077545803153
condensation_order: 2
covers: [amendment_pipeline_and_prompt/_index.md, context.md, local_dev_setup/_index.md, mastra_server_configuration/_index.md, navigate_tools/_index.md, nc_medicaid_agent/_index.md, neo4j_tool_output_validation/_index.md, search_tooling/_index.md]
covers_token_total: 4694
summary_level: d2
token_count: 1734
type: summary
---
## Agent Architecture Structural Summary (Domain-level)

- **Domain purpose & scope**: `agent_architecture/context.md` frames the NC Medicaid policy agent’s architecture, covering bootstrapping (model/tool wiring), memory/storage, and policy-specific guardrails; excludes general Mastra tutorials or unrelated agents and is owned by the NC Medicaid Agent team for onboarding/auditing.

### Amendment Pipeline & Guardrails
- **Entry references**: `amendment_pipeline_and_prompt/_index.md`, `amendment_pipeline_and_prompt_guardrails.md`, `context.md`
- **Pipeline decisions**: Graph builds now prioritize `getAmendments` traversals from depth-1 amendment signals, batch emits via `GRAPH_BATCH_SIZE`, and include regex-based change notice parsing (`_CHANGE_NOTICE_RE`/`_MA_SERIES_RE`/`_REVISED_SPA_RE`). Signal-first detection mitigates noisy body-only amendments (~98.5%); summaries include long sections plus `change_description`.
- **Prompt guardrails**: System prompt enumerates tools, mandates `getAmendments`, prefers authoritative docs, enforces citation/verification, routes HCWD questions via dhhs_policy MA-2180, warns on LTC Partnership amendments, and demands plain-language answers with policy-difference callouts.
- **Infrastructure dependencies**: Anthropic/OpenAI clients, LibSQLStore + DuckDB storage, Navigator helpers, memory templates, HallucinationVerifier, Mastra settings, and CLI runner behavior collaborate to deliver batch tool runs whose markdown responses cite policy differences and verification status.

### Local Development Setup
- **Entry references**: `local_dev_setup/_index.md`, `context.md`, `local_development_setup.md`, `environment_variable_consolidation.md`, `env_consolidation/`
- **Workflow & tooling**: Docker Compose (`neo4j:5` ports 7474/7687, `neo4j-data` volume) plus root package scripts (`npm run dev`, `dev:infra`, `dev:web`, `dev:agent`) in npm@11.11 workspaces manage Neo4j + Mastra web/agent dev servers; `npm run dev` must execute from repo root, starting Neo4j before both servers, while `dev:infra`/`dev:stop` control Docker lifecycle.
- **Environment consolidation**: Central root `.env` now houses all LLM (OpenAI/Anthropic/Voyage) and WorkOS secrets (client credentials, `Testing@queencitycortex.com`, redirect URIs); logic deletes stale symlinks and ensures `packages/agent/.env` + `packages/web/.env.local` are absolute symlinks pointing to the root file, keeping updates synchronized before restarting services.

### Mastra Server Configuration
- **Entry references**: `mastra_server_configuration/_index.md`, `mastra_server_timeout_tuning.md`, `context.md`
- **Architecture choice**: `packages/agent/src/index.ts` now sets `server.timeout` to `10 * 60 * 1000` (from 3 minutes) to keep SSE streams alive through NC Medicaid navigator’s multi-step tool research, preserving long-lived conversations without silent termination.

### Navigate Tools
- **Entry references**: `navigate_tools/_index.md`, `getamendments_optional_match_filtering.md`, `context.md`
- **Tooling structure**: `getAmendments` Neo4j queries emit optional matches whose null-`id` rows must be filtered before invoking `mapDocumentMetadataRecord`; ordered amendment rows (by `effective_date` desc, `id` asc) feed authoritative document selection, aligned with Neo4j output validation practices.

### NC Medicaid Navigator Agent Surface
- **Entry references**: `nc_medicaid_agent/_index.md`, multiple detailed files (`context.md`, `startup_and_web_ui_hardening.md`, `nc_medicaid_navigator_agent.md`, `mastra_nc_medicaid_navigator_configuration.md`, `observational_memory_and_policy_guidance.md`, `cli_runner*.md`, `libsql_storage_fix_for_railway.md`)
- **Startup & guardrails**: Mastra server config wires LibSQL storage, observational/working memory, model providers, HallucinationVerifier, and the `nc-medicaid-navigator` agent; system prompt mandates tool-first search/actions, strict citation rules (section IDs, policy numbers/effective dates, amendment awareness), MAX_STEPS warnings, and plain-language policy-difference outputs. Environment checks require VOYAGE_API_KEY plus either OPENAI_API_KEY or ANTHROPIC_API_KEY; `/healthz` probes Neo4j; CLI mirrors chat behavior via `npx tsx src/index.ts` with synchronized memory payloads, forced answer narration, logging, and cleanup.
- **Memory & tools**: Shared LibSQLStore backs observational memory (prefers openai/gpt-5.4-mini) and resource-scoped working memory seeded with Medicaid profiles; toolset includes searchSections, getSection, getDocument, getSectionContext, followReferences, findConceptSections, getAmendments, lookupPolicy, and HallucinationVerifier to enforce citation fidelity and policy-aware outputs.
- **CLI guardrails**: Iterations warn near MAX_STEPS (40), require tool-call narration before resuming, and emit markdown answers (`---ANSWER---` marker) with citations, aligning with MastraAgentChatTransport behavior.
- **Deployment fix**: Railway compatibility achieved by replacing DuckDB/MastraCompositeStore with LibSQLStore to avoid musl/glibc issues; LibSQL now powers memory, observational memory, and observability exporters.

### Neo4j Tool Output Validation
- **Entry references**: `neo4j_tool_output_validation/_index.md`, `neo4j_tool_output_validation.md`, `context.md`
- **Architectural safeguards**:
  - Numeric properties (e.g., `content_length`, `chars`) are converted from Neo4j `Integer` to JS numbers (`toNumber()`) before Zod validation to prevent silent retries.
  - `getSection` expands container headings lacking text by aggregating child text (up to 6,000 chars) with truncation notes.
  - `getSectionContext` documents ordered ancestor/child/sibling queries so clients can traverse hierarchy reliably.
- **Outcome**: Eliminates Zod failures, surfaces child text for empty headings, and clarifies structural navigation in payloads.

### Search Tooling
- **Entry references**: `search_tooling/_index.md`, `hybrid_policy_search_tool.md`, `context.md`
- **Signal architecture**: `searchSections` fuses Voyage embeddings, per-type-group vector searches, concept graph matches, and keyword lookups, relying on Neo4j indexes (`section_embeddings`, `chunk_embeddings`, `PolicyConcept`, `section_fulltext`) plus helper utilities (`recordToHit`, `dedup`, `rrfFuse`).
- **Fusion flow**: Inputs validated via Zod → embeddings via `embedQuery` → per-type-group section/chunk searches (type group filters default to `clinical_policy`, `dhhs_policy`, `federal statute cluster`) → optional concept graph/full-text hits → deduplicate by `sectionId` → RRF (`RRF_K=60`, per-groupK = `topK` or `max(topK, 10)`) → top-K sorted outputs with metadata.
- **Rules & constraints**: Deduplication before fusion, concept graph matches require `content_length > 200` and valid `section_number`, per-group minimum candidates enforced, and tool depends on Voyage API credentials plus Neo4j indexes to deliver policy-accurate rankings.