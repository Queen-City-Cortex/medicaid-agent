---
children_hash: ea322ce20999489b0cff3edbe15c7b688093f0aac943934dc81a176f334f9dd3
compression_ratio: 0.4164368450082736
condensation_order: 2
covers: [amendment_pipeline_and_prompt/_index.md, context.md, local_dev_setup/_index.md, mastra_server_configuration/_index.md, navigate_tools/_index.md, nc_medicaid_agent/_index.md, neo4j_tool_output_validation/_index.md]
covers_token_total: 3626
summary_level: d2
token_count: 1510
type: summary
---
### agent_architecture domain overview
- **Purpose & Scope (context.md)**: Captures NC Medicaid policy agent architecture, memory/toolchain setup, and policy prompt guardrails. Ownership/usage tied to NC Medicaid Agent team for onboarding and audits.
- **Key child entry references**:
  - `amendment_pipeline_and_prompt/_index.md`
  - `local_dev_setup/_index.md`
  - `mastra_server_configuration/_index.md`
  - `navigate_tools/_index.md`
  - `nc_medicaid_agent/_index.md`
  - `neo4j_tool_output_validation/_index.md`  

### amendment_pipeline_and_prompt
- **Pipeline flow & guardrails**:
  - Emphasizes depth-1 `getAmendments` traversals with ordered docs, signal-first filtering, regex-based notice parsing (`_CHANGE_NOTICE_RE`, `_MA_SERIES_RE`, `_REVISED_SPA_RE`), and batching (`GRAPH_BATCH_SIZE`).
  - System prompt enumerates tools, mandates `getAmendments`, enforces citations/verification, routes HCWD questions to `dhhs_policy` MA-2180, calls out LTC Partnership nuances, and insists on policy-difference reminders (see `context.md`, `amendment_pipeline_and_prompt_guardrails.md`).
- **Infrastructure/dependencies**: Navigator helpers, LibSQLStore/DuckDB storage, Anthropic/OpenAI clients, Mastra settings, HallucinationVerifier, CLI runner narrative tying tool batches to citation-rich markdown output.

### local_dev_setup
- **Local workflow (local_development_setup.md)**:
  - Root `npm run dev` orchestrates Neo4j + `@nc-medicaid/web` + `@nc-medicaid/agent` via Docker Compose and Turbo workspace management; infra scripts (`dev:infra`, `dev:stop`, `dev:web`, `dev:agent`) control service lifecycles.
  - `.env` symlink in `packages/agent/` ensures Mastra sees credentials; depends on npm 11.11.0 workspaces, Turbo ^2.0.0, TypeScript 5.5.0, Docker Compose.
- **Neo4j specifics**: Docker Compose spins Neo4j 5 on ports 7474/7687, persisting `neo4j-data`, authenticating as `neo4j/medicaid-dev`.
- **Rules**: Always maintain `.env` symlink, prefer consolidated `npm run dev`, and use infra scripts for Docker lifecycle (refer `context.md`).

### mastra_server_configuration
- **Motivation**: NC Medicaid Navigator agent’s multi-step SSE research exceeds 3-minute Mastra default, so timeout bumped to 10 minutes in `packages/agent/src/index.ts`.
- **Configuration**: Server block now explicitly sets `server.timeout = 10 * 60 * 1000` alongside host/port/cors, guaranteeing long-running tool sequences keep SSE streams alive (see `mastra_server_timeout_tuning.md`).
- **Impact**: Prevents silent SSE termination otherwise triggered by 3-minute cap, aligning stream longevity with agent workloads.

### navigate_tools
- **Neo4j query hygiene (getamendments_optional_match_filtering.md)**:
  - `navigate.ts` filters null-`id` rows emitted by `OPTIONAL MATCH` before handing records to `mapDocumentMetadataRecord`/Zod; failure to filter causes validation errors due to required non-null IDs.
  - Amendment rows ordered by `effective_date` desc + `id` asc; first row becomes authoritative document.
  - Fact: Neo4j returns an all-null row when no amendments exist; filtering prevents Zod failure.
- **Relations**: Connects to Neo4j validation practices under `neo4j_tool_output_validation`.

### nc_medicaid_agent
- **Architecture & flow**:
  - Mastra boot (packages/agent/src/index.ts) wires LibSQL storage, observational/resource-scoped working memory, eight tools + `HallucinationVerifier`, and exposes `/chat` + CLI (`npx tsx src/index.ts`).
  - Workflow: input → `searchSections` → `getSection` → `getAmendments`/`followReferences` → dynamic instructions → citation/guardrail-enforced answer → observer memory logging → Neo4j driver close.
- **Memory & instructions**:
  - Observational memory uses OpenAI GPT-5.4-mini + @mastra/memory ≥1.1.0 (LibSQL/DuckDB/Neo4j backend) for tool-heavy conversations; working memory seeded with Medicaid profile attributes per run.
  - Instructions function prepends current datetime, omits fixed tool count, and injects policy guidance contextually.
- **Tools & guardrails**:
  - Tools: `searchSections`, `getSection`, `getDocument`, `getSectionContext`, `followReferences`, `getAmendments`, `findConceptSections`, `lookupPolicy`, plus `HallucinationVerifier`.
  - Guardrails enforce exact section IDs/policy numbers, amendment notices, policy-type routing, `lookupPolicy` for policy numbers, MAX_STEPS=40 with warnings via `onIterationComplete`.
- **CLI runner specifics** (`cli_runner.md`, `cli_runner_memory_guardrails.md`):
  - Invocation: `npx tsx src/index.ts "question"`; injects observational memory payload `{ thread: cli-${Date.now()}, resource: "cli" }`, unique thread per run, Pino logging, warning text near step limit, ensures `closeDriver()`.
  - Guardrails require narration post-tool batches, markdown responses with policy references, and consistent memory handshake mirroring web UI transport.
- **Dependencies**: @mastra/core/memory/libsql, AI SDKs (OpenAI/Anthropic), custom tool modules, processors (hallucination-verifier), DuckDB, LibSQL, Neo4j for observability/storage.

### neo4j_tool_output_validation
- **Purpose**: Ensures Neo4j-backed tools (`tools/read.ts`) return normalized metadata for Zod validation and provide dependable structural navigation.
- **Architectural decisions**:
  - Convert Neo4j `Integer` fields to JS numbers before schema validation (`DocumentMetadataSchema`), averting silent retries.
  - `getSection` aggregates child content for empty container headings (up to 6,000 chars) with truncation notes.
  - `getSectionContext` queries ancestors (by path length), children, and siblings (`NEXT_SIBLING`) to map relationships.
- **Flow**: Inputs → `withSession` → Neo4j queries → record normalization → container/structural logic → schema validation → agent payload.
- **Dependencies**: `withSession`, `DocumentMetadataSchema`, `documentMetadataReturn`, `mapDocumentMetadataRecord`.
- **Outcome**: Reliable numeric metadata, richer container sections, and documented structural navigation (see `neo4j_tool_output_validation.md` and `context.md`).