---
children_hash: 5fe736d0527ce90dc860fdbc06b342263caf8debfe3e0c2c0720d0af334b748b
compression_ratio: 0.350270087778528
condensation_order: 3
covers: [README.md, agent_architecture/_index.md, amendment_detection/_index.md, auth_integration/_index.md, database_operations/_index.md, frontend_ui/_index.md, qa/_index.md]
covers_token_total: 5924
summary_level: d3
token_count: 2075
type: summary
---
# Structural Summary of Provided Knowledge Entries

## ByteRover Overview
- README.md introduces the ByteRover project foundation; for detailed guidance consult individual domain summaries below.

---

## agent_architecture
### Domain Context
- Houses NC Medicaid Navigator agent architecture, focusing on guardrail-aware bootstrapping, tool orchestration, and memory plumbing tied to Neo4j-backed policy data; not intended for general Mastra documentation.

### Amendment Pipeline & Prompt Guardrails (`amendment_pipeline_and_prompt`)
- Amendment graph prioritized via depth-1 `getAmendments` reads, metadata-enriched ordering, and regex-driven change notice extraction (`_CHANGE_NOTICE_RE`, `_MA_SERIES_RE`, `_REVISED_SPA_RE`); infrastructure stitches Anthropic/OpenAI clients, LibSQLStore/DuckDB storage, and CLI runner behavior.
- System prompt enforces tool enumeration, claim verification, authoritative-document bias (e.g., `dhhs_policy` MA-2180), and plain-language answers citing policy differences.

### Local Development (`local_dev_setup`)
- `npm run dev` at repo root spins up Neo4j (ports 7474/7687, `neo4j-data` volume, `neo4j/medicaid-dev` auth) plus Mastra web/agent servers via Turbo; `.env` must exist in `packages/agent/` with root symlink.
- Support commands (`dev:infra`, `dev:stop`, `dev:web`, `dev:agent`) manage Docker Compose lifecycles; requires Docker Compose, npm 11.11.0 workspaces, Turbo 2.x, TypeScript 5.5.

### Mastra Server Timeout (`mastra_server_configuration`)
- `packages/agent/src/index.ts` raises Mastra SSE server timeout to 10 minutes with explicit host/port/CORS configs, ensuring long-running streams survive previous 3-minute cutoff.

### Navigate Tools (`navigate_tools`)
- `getAmendments` flow: document lookup → OPTIONAL MATCH → filter null `id` rows to avoid Zod failures → metadata mapping → sorting by effective date/id → base vs. authoritative selection; depends on metadata schema, `mapDocumentMetadataRecord`, and Zod enforcement.

### NC Medicaid Agent (`nc_medicaid_agent`)
- Configures LibSQL-backed Mastra memory (observational via OpenAI/GPT-5.4-mini, working memory seeded with Medicaid templates), dynamic instruction rebuilding, eight tools plus HallucinationVerifier, iteration hooks, and forced synthesis near `MAX_STEPS≈40`.
- CLI runner (`/chat`, `npx tsx src/index.ts ...`) ensures `thread=cli-${Date.now()}`, resource tagging, Mastra/memory/tool setup, logging, and Neo4j driver closure; guardrails enforce serialized responses and tool warning notices.
- Railway fix removed DuckDB/MastraCompositeStore due to missing `ld-linux-x86-64.so.2`, consolidating storage on LibSQLStore for memory and observability spans.

### Neo4j Tool Output Validation (`neo4j_tool_output_validation`)
- Normalizes Neo4j `Integer` fields via `.toNumber()` before Zod validation, aggregates up to 6,000 characters for empty headings with truncation notices, and surfaces ancestor/child/sibling context (via `getSectionContext`’s path/section numbering) to guide consumers.

### Search Tooling (`search_tooling`)
- Hybrid search fuses Voyage embeddings, per-type group vector & chunk queries, concept graph matches, and optional full-text hits using RRF (k=60), dedups by `sectionId`, and obeys minimum candidate counts (`topK` or `max(topK,10)`).
- Enforces business rules (e.g., concept hits need `content_length > 200`, `section_number` non-null), relies on Neo4j indexes (`section_embeddings`, `chunk_embeddings`, `section_fulltext`, `PolicyConcept`), and integrates utilities like `recordToHit`, `dedup`, and `rrfFuse`.

---

## amendment_detection
### Domain Context
- Focused on graph-based DHHS amendment detection; excludes unrelated ingestion concerns.

### Pipeline Detection (`pipeline_detection`)
- Implements `packages/pipeline/src/pipeline/references/amendments.py` flow: document querying → signal-section heuristics (`_is_change_notice`, `_is_revised_spa`, `_is_signal_section`, `_is_sentence_boundary`) → sentence-level context extraction → MA/SPA ID capture → Neo4j AMENDS edge creation with deduplicated `change_description`.
- Decision rules: prioritize “CONTENT OF CHANGE”/“POLICY UPDATE” sections, preserve identifiers like `MA-2180.IV.I`, batch via `pipeline.utils.batching.chunked`, instrument logging with `rich.Console`, and set `status="amendment"` after batching updates.

---

## auth_integration
### Domain Context
- Captures deployment-specific adjustments for auth libraries on constrained hosts (Docker/Railway); not general auth design.

### WorkOS Authkit Next.js
- Callback flow (`callback_base_url_resolution`): `getBaseURL` resolves from `NEXT_PUBLIC_WORKOS_REDIRECT_URI` → `WORKOS_REDIRECT_URI` → `RAILWAY_PUBLIC_DOMAIN`, ensuring stable public origin before invoking `handleAuth`.
- Docker redirect fix (`handleauth_docker_redirect_fix`): overrides `handleAuth.baseURL` using parsed `NEXT_PUBLIC_WORKOS_REDIRECT_URI`, preventing callbacks to `HOSTNAME=0.0.0.0` and routing back to `/chat`.

---

## database_operations
### Domain Context
- Operational database guidance for deployment quirks (Railway) and authentication fixes; reference when debugging Neo4j environments.

### Neo4j Authentication (`neo4j_auth`)
- Railway URL-decoding transforms `+` to spaces, so use strictly alphanumeric passwords (e.g., `***REDACTED***`), update live instances via Bolt TCP proxy (`ALTER CURRENT USER SET PASSWORD`), and remember `NEO4J_AUTH` only applies on initial volume creation.

### Neo4j Hybrid Search (`neo4j_hybrid_search`)
- Hybrid pipeline combines vector (`vector_rows`, `chunk_rows`), concept (`PolicyConcept` with `CONCEPT_MATCH_SCORE=0.70`), and keyword (`section_fulltext` index) signals, dedupes by `section_id`, and fuses via `_rrf_fuse` with `RRF_K=60`.
- `per_group_k` equals `top_k` when filters exist or `max(top_k, 10)` otherwise; concept matches cap at `min(top_k, 5)` and require `content_length` plus `section_number`.
- Dependencies include schema indexing for `section_fulltext`, embeddings configs (`EMBEDDING_DIMENSIONS`), Neo4j sessions, and utilities in `packages/pipeline/src/pipeline/embeddings/indexer.py` and `graph/schema.py`.

---

## frontend_ui
### Domain Context
- Contains layout/scrolling patterns specific to the NC Medicaid Navigator UI; not backend logic.

### Chat Scroll Stability (`chat_page_scroll_stability`)
- Scroll handling binds to `[data-slot="scroll-area-viewport"]`, uses `viewport.scrollTo`, enforces `preventScroll: true`, and keeps flex parents at `min-h-0`/`overflow-hidden`; avoids `scrollIntoView` to keep sidebar visible.

### ScrollArea Sidebar Stability (`scroll_area_sidebar_stability`)
- `TuneScrollArea` animates `viewport.scrollTo({ behavior: "smooth" })`, outer flex container uses `overflow-clip`, and fixes prevent upward-propagating scrolls that hid the sidebar when `scrollIntoView` triggered.

### Proxy Handling (`proxy_handling`)
- MIGRATION to Next.js 16 `proxy.ts`: routes through `authkitProxy` (WorkOS) with `middlewareAuth`, keeps `/auth/callback` open, excludes `_next/static`, `_next/image`, metadata paths, and adjusts signatures to the single-argument proxy model.

---

## qa
### Domain Context
- Playwright e2e testing patterns for the Medicaid navigator UI, maintaining Mastra stream/memory helpers; excludes other test types.

### Playwright E2E (`playwright_e2e`)
- Shared `playwright.config.ts` configures reporters/retries/baseURL for mocked (15 s, desktop Chrome) and smoke (120 s, live agent + Neo4j) suites; both require `npm run dev` to serve `http://localhost:3000`.
- Helpers:
  - `MastraStreamBuilder` crafts SSE frames for stream simulation.
  - `mockMastraAPI` intercepts `/api/agents/*/stream`, memory threads, and messages.
  - `chat-page.ts` encapsulates selectors/actions for consistent chat/thread interactions.

### Hallucination Verifier (`hallucination_verifier`)
- Processor verifies final assistant messages via two-step relevance + factual accuracy check using prioritized citations (overrun truncation notices) and applies `writer.custom` rewrites if needed.
- Schema captures `supported`, `relevant`, `unsupportedClaims`, `relevanceIssues`, `correctedAnswer`; depends on `generateObject`, `createOpenAI`, Zod, Mastra processors/memory types, and ensures corrections fire without retries.