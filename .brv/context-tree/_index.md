---
children_hash: fa31f2adb3258f48715d23351fbde1f55492ea2fc876f4dc3a8518a31d1a0b15
compression_ratio: 0.4987179487179487
condensation_order: 3
covers: [README.md, agent_architecture/_index.md, amendment_detection/_index.md, database_operations/_index.md, frontend_ui/_index.md, qa/_index.md]
covers_token_total: 3900
summary_level: d3
token_count: 1945
type: summary
---
# Structural Summary (Level d3)

## ByteRover Overview
- **README**: Entry point “ByteRover” banner; no further structural details provided.

## Agent Architecture (`agent_architecture`)
- **Domain overview**: Captures NC Medicaid policy agent architecture, tooling, and guardrails; references six subtopics (`amendment_pipeline_and_prompt`, `local_dev_setup`, `mastra_server_configuration`, `navigate_tools`, `nc_medicaid_agent`, `neo4j_tool_output_validation`).
- **Amendment Pipeline & Prompt** (`amendment_pipeline_and_prompt/_index.md`)
  - Pipeline enforces depth-1 `getAmendments` with ordered docs, regex notice parsing, batching, and navigator helpers; system prompt mandates tool usage, cites HCWD/MA policies, and routes LTC Partnership queries via `dhhs_policy`.
  - Infrastructure: Navigator helpers, LibSQLStore/DuckDB storage, Anthropic/OpenAI clients, Mastra settings, HallucinationVerifier, CLI runner ensuring citation-rich markdown outputs.
- **Local Development Setup** (`local_dev_setup/_index.md`)
  - `npm run dev` orchestrates Neo4j + `@nc-medicaid/web` + `@nc-medicaid/agent` through Docker Compose/Turbo; scripts manage infrastructure.
  - `.env` symlink in `packages/agent/` keeps Mastra credentials in sync; Neo4j 5 runs on 7474/7687 with persistent volume and `neo4j/medicaid-dev` auth.
  - Rules: maintain symlink, prefer combined dev command, use infra scripts for Docker lifecycle.
- **Mastra Server Configuration** (`mastra_server_configuration/_index.md`)
  - Raises Mastra SSE timeout from 3 minutes to 10 (`packages/agent/src/index.ts`) to keep long research flows alive; server block explicitly configures host/port/CORS and extended timeout.
- **Navigate Tools** (`navigate_tools/_index.md`)
  - Filters `OPTIONAL MATCH` null rows before `mapDocumentMetadataRecord`/Zod validation; orders amendments by `effective_date` desc, `id` asc; first row authoritative.
  - Notes Neo4j emits all-null row when no amendments exist; relates to Neo4j validation practices in `neo4j_tool_output_validation`.
- **NC Medicaid Agent** (`nc_medicaid_agent/_index.md`)
  - Mastra boot wires LibSQL store, observation/working memory, eight tools plus `HallucinationVerifier`, exposing `/chat` and CLI mode.
  - Workflow: user input → `searchSections` → `getSection` → `getAmendments`/`followReferences` → guardrail-aware response → observer memory log → Neo4j driver close.
  - Memory uses OpenAI GPT-5.4-mini + `@mastra/memory` with LibSQL/DuckDB/Neo4j backend; instructions inject current datetime and policy context dynamically.
  - Tools: includes `searchSections`, `getDocument`, `getSectionContext`, `followReferences`, `getAmendments`, `findConceptSections`, `lookupPolicy`, `HallucinationVerifier`; guardrails enforce section IDs, policy numbers, routing, MAX_STEPS=40 with `onIterationComplete` warnings.
  - CLI runner (`cli_runner.md`, `cli_runner_memory_guardrails.md`): `npx tsx src/index.ts "question"` injects unique thread/memory payload, logs via Pino, warns near step limit, ensures `closeDriver()`, and mirrors web UI memory handshake with markdown/policy references.
  - Dependencies: `@mastra/core/memory/libsql`, AI SDKs (OpenAI/Anthropic), custom tools, `HallucinationVerifier`, DuckDB, LibSQL, Neo4j.
- **Neo4j Tool Output Validation** (`neo4j_tool_output_validation/_index.md`)
  - Normalizes Neo4j `Integer` fields to JS numbers before `DocumentMetadataSchema` validation; augments `getSection` with aggregated child content (up to 6,000 chars).
  - `getSectionContext` queries ancestors, children, siblings (`NEXT_SIBLING`) to map structure; flow: session → queries → normalization → container logic → schema validation.
  - Dependencies: `withSession`, `DocumentMetadataSchema`, `documentMetadataReturn`, `mapDocumentMetadataRecord`; ensures reliable metadata and navigation for agents.

## Amendment Detection (`amendment_detection`)
- **Domain scope** (`context.md`): Graph-based detection of DHHS amendment relationships, sanitizing change notices/SPAs, context heuristics, AMENDS edge updates; excludes unrelated ingestion.
- **Pipeline Detection Topic** (`pipeline_detection/_index.md`)
  - Implementation in `packages/pipeline/src/pipeline/references/amendments.py`: queries documents → filters sections by signals (`_is_change_notice`, `_is_revised_spa`, `_is_signal_section`, `_is_sentence_boundary`) → extracts sentences while preserving MA/SPA identifiers and references (`MA-2180.IV.I`) → deduplicates change descriptions → writes Neo4j AMENDS edges.
  - Uses `pipeline.utils.batching.chunked` and `pipeline.graph.*`, logs via `rich.console.Console`; merges edges with `status="amendment"` via `queries.MERGE_AMENDS_BATCH`, `queries.SET_DOCUMENT_STATUS_BATCH`.
  - Relates to `agent_architecture/neo4j_tool_output_validation` for Neo4j verification.

## Database Operations (`database_operations`)
- **Domain overview** (`context.md`): Database deployment/authentication knowledge for Platform Infrastructure; covers connection/auth incidents, environment quirks, password workflow; excludes non-database infra.
- **Neo4j Authentication Handling** (`neo4j_auth/_index.md`)
  - Railway decodes env vars before Neo4j, turning `+` into spaces and corrupting passwords; `NEO4J_AUTH` only applies during initialization—running clusters require in-database password changes.
  - Password rotation: deploy new creds → decoded `+` fails auth → rotate to alphanumeric password → use bolt TCP proxy plus `ALTER CURRENT USER SET PASSWORD` for live updates.
  - Linked to Medicaid agent’s Neo4j configuration (`agent_architecture/nc_medicaid_agent`).

## Frontend UI (`frontend_ui`)
- **Domain scope** (`context.md`): Layout-level notes for NC Medicaid Navigator web UI (scroll mechanics, overflow rules, chat adjustments); owned by Web Frontend Team; excludes backend and stream logic.
- **Scroll Topics**
  - **Chat Page Scroll Stability** (`chat_page_scroll_stability/_index.md`)
    - Focuses scroll operations on message column viewport; uses `viewport.scrollTo`, `preventScroll: true`, `min-h-0`, `overflow-hidden`; replacing `scrollIntoView` prevents sidebar disruption.
  - **ScrollArea Sidebar Stability** (`scroll_area_sidebar_stability/_index.md`)
    - Fixes sidebar hiding by manually scrolling viewport (`scrollTo({ top: scrollHeight, behavior: "smooth" }`), using `overflow-clip` on flex container, and keeping effects tied to message/stream DOM refs.
- **Proxy Handling** (`proxy_handling/_index.md`)
  - Migrates to Next.js 16 `proxy.ts` with WorkOS Authkit; `packages/web/src/proxy.ts` forwards `NextRequest` through `authkitProxy` with `middlewareAuth`, excluding `_next/static`, `_next/image`, metadata.
  - Adjusts signatures (drops `NextFetchEvent`) to satisfy new adapter requirements; streamlines request → `authkitProxy` → routing flow; dependent on `@workos-inc/authkit-nextjs`.

## QA (`qa`)
- **Domain purpose** (`context.md`): End-to-end Playwright testing knowledge for Medicaid navigator UI; includes configs, streaming/memory helpers, chat/thread page objects; excludes non-Playwright/unit/integration backend work.
- **Playwright E2E Topic** (`playwright_e2e/_index.md`)
  - Config (`e2e/playwright.config.ts`) covers mocked and smoke suites with shared reporters/retries/baseURL; mocked uses desktop Chrome with short timeouts, smoke suite extends to 120s and expects live agent plus Neo4j via `npm run dev` at `http://localhost:3000`.
  - Helpers: `MastraStreamBuilder` crafts SSE frames; `mockMastraAPI` intercepts SSE, thread lifecycle, thread messages via `page.route`; `ChatPage` page object centralizes selectors/actions for navigation, messaging, assistant traces, sidebar.
  - Flow: config launches suites → helpers mock streams → `ChatPage` drives interactions across mocked/smoke scenarios.