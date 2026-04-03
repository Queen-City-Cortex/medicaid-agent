---
children_hash: 930253f1a18d4051cd3868208286b9c27711009479ab33d8a7e691091a34fa3b
compression_ratio: 0.5242929659173314
condensation_order: 2
covers: [amendment_pipeline_and_prompt/_index.md, context.md, local_dev_setup/_index.md, mastra_server_configuration/_index.md, navigate_tools/_index.md, nc_medicaid_agent/_index.md, neo4j_tool_output_validation/_index.md, search_tooling/_index.md]
covers_token_total: 4137
summary_level: d2
token_count: 2169
type: summary
---
### agent_architecture
- **Overview (`context.md`)**: Houses NC Medicaid policy agent architecture—bootstrapping, memory, toolchain, system prompts, and guardrails; for onboarding and auditing guardrail enforcement. Scope excludes general Mastra guides and unrelated agents.

#### amendment_pipeline_and_prompt
- **Purpose & Scope**: Describes amendment graph construction, NC Medicaid agent’s reliance on it, and system prompt guardrails (`context.md`, `amendment_pipeline_and_prompt_guardrails.md` must be referenced for detail).
- **Pipeline Flow**: Prefer depth-1 `getAmendments` traversals, include long sections and metadata, order documents by effective date/distance, and flag authoritative sections to cite. Regex-driven change notice parsing (`_CHANGE_NOTICE_RE`, `_MA_SERIES_RE`, `_REVISED_SPA_RE`), batch size tuning (`GRAPH_BATCH_SIZE`), and metadata helpers ensure signal-first detection while suppressing noisy body-only AMENDS edges.
- **Prompt Guardrails**: System prompt enumerates tools, forces `getAmendments`, biases authoritative docs (especially `dhhs_policy` MA-2180 and LTC Partnership amendments), demands citation/verification behavior, and enforces plain-language answers with policy-difference callouts plus verification warnings. Infrastructure wires Anthropic/OpenAI clients, LibSQLStore/DuckDB storage, memory templates, HallucinationVerifier, Mastra settings, and CLI runner behavior to support the workflow.

#### local_dev_setup
- **Purpose**: Guides starting the NC Medicaid Navigator local stack with Neo4j plus web/agent servers via Mastra-aware scripts (`context.md`, `local_development_setup.md`).
- **Workflow**: Ensure `packages/agent/.env` (root symlink) exists, run `npm run dev` at repo root—starts Neo4j container via `docker compose up -d neo4j`, launches both servers concurrently, and relies on Turbo workspace orchestration.
- **Infra controls**: `npm run dev:infra`/`dev:stop` manage Docker lifecycles; `dev:web` & `dev:agent` run standalone servers. Requires Docker Compose, npm workspaces (npm@11.11.0), Turbo ^2.0.0, TypeScript ^5.5.0, and the `.env` symlink. Neo4j 5 container exposes 7474/7687 with persistent `neo4j-data` volume and auth `neo4j/medicaid-dev`.
- **Rules**: Keep `.env` within `packages/agent/` with repository root symlink, always run `npm run dev` for the combined start, and use infra scripts for Docker lifecycle. Related Mastra server details in `mastra_server_configuration/context.md`.

#### mastra_server_configuration
- **Goal**: Explain increasing Mastra server timeout to sustain NC Medicaid Navigator’s long-running SSE research (`context.md`, `mastra_server_timeout_tuning.md`).
- **Timeout change**: `packages/agent/src/index.ts` raised `server.timeout` from 3 minutes to `10 * 60 * 1000`, aligning with multi-step tool research that routinely surpasses the previous limit and prevented silent streaming terminations.
- **Configuration**: Timeout now explicitly set alongside host/port/cors/apiRoutes, with a comment justifying the 10-minute resilience for streaming. Dependencies assume SSE streams remain open long enough for complex conversations.

#### navigate_tools
- **Context**: Details Neo4j query structure for `getAmendments`, optional-match handling, metadata expectations, and authoritative document selection, linking to Neo4j output validation practices (`context.md`, `getamendments_optional_match_filtering.md`).
- **Filtering rule**: After `OPTIONAL MATCH` amendments, immediately `.filter(rec => rec.get('id') != null)` to avoid Zod schema failures—essential because Neo4j emits a null row when no amendments exist.
- **Flow**: Find document → OPTIONAL MATCH → filter null `id` rows → `mapDocumentMetadataRecord` → sort amendments (effective_date desc, id asc) → select base vs. authoritative documents.
- **Dependencies**: Document metadata schema, `mapDocumentMetadataRecord`, Zod enforcement; ordered amendments drive authoritative selection.

#### nc_medicaid_agent
- **Domain overview (`context.md`)**: Captures how the Navigator agent wires Mastra memory, tools, and guardrails with anti-hallucination controls.
- **Memory & instructions**: LibSQL-backed Mastra memory manages observational (OpenAI/GPT-5.4-mini) and working memory seeded with Medicaid templates; instructions rebuilt per request include current date/time and describe runtime tool injection instead of a fixed tool count (`mastra_nc_medicaid_navigator_configuration.md`, `nc_medicaid_navigator_agent.md`).
- **Tooling & guardrails**: Eight tools plus HallucinationVerifier enforce document-type routing, citation/lookup workflows, amendment dating, and forced synthesis near `MAX_STEPS≈40`; iteration hooks call `onIterationComplete` for step warnings and final responses (`observational_memory_and_policy_guidance.md`, `nc_medicaid_navigator_agent.md`).
- **CLI runner**: `/chat` Mastra API and CLI (`npx tsx src/index.ts "your question"`) instantiate Mastra, storage, memory, tools, and observational memory; each run sets `thread=cli-${Date.now()}`, resource “cli”, calls `agent.generate` (maxSteps 99), prints `---ANSWER---`, and closes the Neo4j driver (`cli_runner.md`).
- **CLI guardrails**: CLI must supply `{ thread, resource }`, align with Mastra memory handshake, log answers/errors, narrate after tool batches, and enforce forced-iteration warnings (`cli_runner_memory_guardrails.md`). Observational memory logs tool history, working memory captures user profile/preferences, and system prompt guardrails plus citation rules maintain factual outputs.
- **Deployment storage fix**: Railway Alpine/musl lacked `ld-linux-x86-64.so.2`, so DuckDB/MastraCompositeStore (glibc-linked) was removed; LibSQLStore now powers both Mastra memory and observability, preserving memoization but avoiding native DLL failures (`libsql_storage_fix_for_railway.md`).
- **Observability**: LibSQL continues to store observability spans; observational memory still uses OpenAI/GPT-5.4-mini tied to the same LibSQL instance.

#### neo4j_tool_output_validation
- **Purpose**: Ensures Neo4j-backed policy section reads validate cleanly by normalizing metadata and documenting structure (`context.md`, `neo4j_tool_output_validation.md`).
- **Integer normalization**: Converts every Neo4j `Integer` (e.g., `content_length`, `chars`) to JavaScript numbers via `.toNumber()` before Zod validation (`neo4j_integer_return`/`neo4j_integer_conversion`), preventing silent retries.
- **Container handling**: `getSection` aggregates up to 6,000 characters from child sections when a heading lacks text, appending a truncation note for overflow (`section_container_expansion`).
- **Structural navigation**: `getSectionContext` queries ancestors (by path length), children (by `section_number`), and siblings (follow `NEXT_SIBLING`) to outline hierarchy for clients.
- **Flow**: Inputs (`sectionId`/`documentId`) → `withSession`/Neo4j queries → convert integers → apply container/structure logic → schema validation → payload.
- **Dependencies**: `withSession`, `DocumentMetadataSchema`, `documentMetadataReturn`, `mapDocumentMetadataRecord`; Zod enforces numeric fields as JS numbers.
- **Outcomes**: Eliminates validation errors, surfaces child text for empty headings, and documents relationships so clients can navigate ancestors, siblings, and children with confidence.

#### search_tooling
- **Overview**: Explains how the navigator search tool fuses Voyage embeddings, vector search, concept graph matches, and Neo4j indexes to rank policy sections (`context.md`, links to `navigate_tools`).
- **Signal mix**: Combines Voyage vectors, per-type-group section/chunk searches, optional concept graph/full-text lookups, and RRF fusion to produce reliable retrievals; Neo4j `section_embeddings`, `chunk_embeddings`, `PolicyConcept` relationships, and `section_fulltext` indexes anchor signals.
- **Hybrid search flow**: `searchSections` (in `packages/agent/src/tools/search.ts`) validates queries, embeds them (`embedQuery`), runs per-type-group searches (clinical_policy, dhhs_policy, federal statute clusters or filters), optionally appends concept graph/full-text hits, dedups by `sectionId`, and fuses results via `rrfFuse` (with `RRF_K=60`, smoothing) to return metadata-rich top-K results.
- **Business rules**: Section/chunk hits deduped by `sectionId`; concept graph matches require `content_length > 200` and non-null `section_number`; per-group candidate minimums enforced (`perGroupK = topK` or `max(topK, 10)` without filters).
- **Dependencies**: Voyage API credentials (`VOYAGE_API_*`), `DEFAULT_TOP_K`, Neo4j indexes, and utilities (`recordToHit`, `dedup`, `rrfFuse`) keep execution readable and consistent.