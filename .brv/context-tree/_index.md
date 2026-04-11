---
children_hash: 1ab72116364ee090f1f24e942f729b6c1ee2fe70da6a341e6688cf4f725f1252
compression_ratio: 0.34430489389346036
condensation_order: 3
covers: [README.md, agent_architecture/_index.md, amendment_detection/_index.md, auth_integration/_index.md, database_operations/_index.md, evaluation/_index.md, frontend_ui/_index.md, qa/_index.md]
covers_token_total: 6927
summary_level: d3
token_count: 2385
type: summary
---
# ByteRover Knowledge Structural Summary (level d3)

## Agent Architecture Domain
- **Overview (`agent_architecture/context.md`)**: NC Medicaid Navigator agent stack covers bootstrapping, memory/storage strategy, guardrails, and citation policies; excludes unrelated Mastra tutorials.
- **Amendment Pipeline & Guardrails (`agent_architecture/amendment_pipeline_and_prompt/_index.md`)**: `getAmendments` signal flow prioritizes depth-1 traversals, long-section aggregation, and sorting by effective date/distance, backed by regex detectors (`_CHANGE_NOTICE_RE`, `_MA_SERIES_RE`, `_REVISED_SPA_RE`), LibSQL/DuckDB storage, Anthropic/OpenAI clients, and CLI-to-markdown responses emphasizing policy differences.
- **Local Dev Environment (`agent_architecture/local_dev_setup/_index.md`)**: Root scripts orchestrate Neo4j 5 via Docker Compose and parallel workspaces (Turbo, TypeScript), while a consolidated root `.env` syncs LLM, WorkOS credentials, and shared secrets through symlinked agent/web files.
- **Mastra Server Timeout (`mastra_server_configuration/_index.md`)**: `packages/agent/src/index.ts` extends SSE timeout to 10 minutes within documented server block to sustain multi-step research.
- **Navigate Tools (`agent_architecture/navigate_tools/_index.md`)**: `navigate.ts` filters null Neo4j rows post-`OPTIONAL MATCH`, orders amendments by `effective_date` desc/`id` asc, and enforces Zod schema compliance.
- **NC Medicaid Navigator Agent (`agent_architecture/nc_medicaid_agent/_index.md` & subentries)**: CLI runner (`src/index.ts`) wires Mastra tools, LibSQL/DuckDB stores (LibSQL now sole storage for Railway), and Neo4j cleanup while enforcing `maxSteps=99`, memory guardrails, and anti-hallucination messaging; memory/instructions rebuild per request with current datetime, tool-first requirement, citation metadata (`id`, `title`, `policy_number`, `effective_date`, `url`, `status`, `source_url`), and enforced `getAmendments` use; UI (`startup_and_web_ui_hardening.md`) exposes `/chat`/`/healthz`, validates Neo4j, configures `AGENT_ID`, transports, and spinner/input limits while reiterating tool-first/anti-hallucination rules.
- **Neo4j Output Validation (`agent_architecture/neo4j_tool_output_validation/_index.md`)**: Numeric properties normalized to JS numbers before Zod validation, `getSection` expands headings to 6K chars with truncation notices, and `getSectionContext` provides ancestor/child/sibling navigation metadata.
- **Search Tooling (`agent_architecture/search_tooling/_index.md`)**: Hybrid search (`searchSections` in `tools/search.ts`) validates with Zod, embeds per document-type group, optionally adds concept graph/full-text hits, dedupes by `sectionId`, and applies RRF fusion (`RRF_K=60`) with per-group `perGroupK = max(topK, 10)` without filters; concept hits require `content_length > 200` and `section_number`, relying on Voyage creds, Neo4j indexes (`section_embeddings`, `chunk_embeddings`, `PolicyConcept`), and helpers (`recordToHit`, `dedup`, `rrfFuse`).

## Amendment Detection Domain
- **Domain Context (`amendment_detection/context.md`)**: Graph-based detection of DHHS amendment relationships, sanitizing change notices/SPAs, context heuristics, and AMENDS edge updates.
- **Pipeline Detection Topic (`amendment_detection/pipeline_detection/_index.md`)**: `packages/pipeline/src/pipeline/references/amendments.py` orchestrates signal sections (`_is_change_notice`, `_is_revised_spa`, etc.), sentence-boundary aware extraction (preserving references like `MA-2180.IV.I`), MA/SPA identifier capture, Neo4j AMENDS edge creation (`queries.MERGE_AMENDS_BATCH`, `queries.SET_DOCUMENT_STATUS_BATCH`), batching utilities, and deduplication of `change_description`. Relationships reference `agent_architecture/neo4j_tool_output_validation` for Neo4j verification.

## Auth Integration Domain
- **WorkOS Authkit Next.js Topic (`auth_integration/workos_authkit_nextjs`)**:
  - **Context**: `handleAuth` callback requires derived public origin for constrained hosts.
  - **Callback Base URL Resolution (`callback_base_url_resolution.md`)**: `getBaseURL` falls back from `NEXT_PUBLIC_WORKOS_REDIRECT_URI` → `WORKOS_REDIRECT_URI` → `RAILWAY_PUBLIC_DOMAIN`, ensuring production-safe origins.
  - **Docker Redirect Fix (`handleauth_docker_redirect_fix.md`)**: Parses `NEXT_PUBLIC` redirect for actual host, overrides `handleAuth.baseURL`, and redirects to `/chat` to avoid internal `0.0.0.0` callbacks on Railway.

## Database Operations Domain
- **Domain Context (`database_operations/context.md`)**: Captures connectivity/auth fixes for deployments, referencing Platform Infrastructure guidance.
- **Neo4j Auth Topic (`database_operations/neo4j_auth/_index.md` & subentry)**: Railway decodes `+` to spaces, so passwords must be strictly alphanumeric; `NEO4J_AUTH` only applies at volume init, requiring live password rotation via Bolt proxy and `ALTER CURRENT USER SET PASSWORD` to keep running DB reachable (`railway_neo4j_auth_handling.md`).
- **Neo4j Hybrid Search Topic (`database_operations/neo4j_hybrid_search/_index.md` & `_index.md` subentries)**: Hybrid pipeline ensures vector/chunk/concept/keyword signals with `section_fulltext` index, group-aware chunk sizing (`per_group_k = max(top_k, 10)` without filters), concept matches constrained by score/section limits, deduped by `section_id`, and fused via `_rrf_fuse` with `RRF_K=60`; implementation spans embedding indexers and graph schema definitions.

## Evaluation Domain
- **Domain Overview (`evaluation/context.md`)**: Houses Level 2/3 answer quality, cross-reference resolution, evidence relationships, and QA instrumentation.
- **Answer Quality (`evaluation/answer_quality/_index.md`)**: `packages/pipeline/src/pipeline/eval/levels/answer.py` executes HTTP-first agent/CLI fallback with 180s timeout, propagates OpenAI/agent overrides, fetches Neo4j evidence, and applies `judge_answer` (errors yield `None` scores).
- **Cross-reference Resolution (`evaluation/cross_reference_resolution/_index.md`)**: `cross_ref.py` iterates entries, skips missing docs, resolves via `REFERENCES_DOCUMENT`, `AMENDS`, `HAS_SECTION`, `REFERENCES`, and tracks resolved/missed counts (q-004, q-009, q-020 unresolved).
- **Pipeline Overview (`evaluation/pipeline_overview/_index.md`)**: Links Level 3 scoring → Neo4j evidence → `judge_answer` → Level 2 cross-reference checking, explaining error handling, missing doc skips, and aggregated metric behavior.

## Frontend UI Domain
- **Domain Purpose (`frontend_ui/context.md`)**: Web UI fixes for chat layout, scroll handling, and sidebar stability; excludes backend stream logic.
- **Chat Layout & Stability**:
  - `chat_page_review_fixes`: Synthesizes collapsible layout, CTAs, rerun/stream handling, and shared transports.
  - `chat_page_scroll_stability` & `scroll_area_sidebar_stability`: Replace `scrollIntoView` with viewport `scrollTo`, enforce `preventScroll` and flex constraints to keep sidebar visible.
- **Transport & Streaming**:
  - `chat_page_transport`: Identity includes `threadId` + auth `resourceId`, and `DefaultChatTransport` memoizes over key identifiers for fresh transports.
  - `chat_streaming_error_handling`: Introduces `AISdkStreamBuilder`, SSE lifecycle (start → deltas → tool events → finish), mocks in Playwright, input blocking during streaming, and rerun caps.
- **Message Persistence & Parsing**:
  - `message_persistence_cache` & `chat_page_thread_cache`: Per-thread caches with `pendingRestore` to rehydrate replies across thread switches.
  - `message_persistence_parsing`: Converts `MastraMessageContentV2` to UI messages, emitting tool-related states while aligning ResearchTrace metadata.
- **Feedback & Thread Management**:
  - `message_feedback`: LibSQL-backed feedback persistence, zod-validated APIs, `MessageActions` with optimistic updates, and UI sync.
  - `thread_sidebar`: Resilient fetches with abortable requests, contextual menus (create/rename/delete), timestamps, and `nc-medicaid-navigator` anchoring.
  - `proxy_handling`: Next.js 16 `proxy.ts` forwarding authkit routes (excluding `/auth/callback`), aligning middleware exports with `authkitProxy`.

## QA Domain
- **Domain Context (`qa/context.md`)**: Playwright-based e2e suites, Mastra stream/memory mocks, chat/thread page objects, and test helpers specific to the Medicaid navigator UI.
- **Evaluation Pipeline (`qa/evaluation_pipeline/_index.md`)**: Level 3 answer scoring (via HTTP/CLI agent, Neo4j evidence, `judge_answer`) feeds Level 2 cross-reference resolution (`cross_ref.py`) to yield metrics; unresolved refs q-004/q-009/q-020 persist.
- **Hallucination Verifier (`qa/hallucination_verifier/_index.md`)**: Intercepts final assistant messages, builds prioritized `sourceText` (with truncation up to `maxSourceChars`), verifies via `verifyAnswer`, and rewrites failures via `writer.custom`, returning `VERIFICATION_UNAVAILABLE` when needed.
- **Launch Blockers (`qa/launch_blockers/_index.md`)**: Fixes include Next.js 16 proxy signature, guarded Cypher concept handling, hallucination verifier caps/disclaimers, and strengthened search tests (deduping, snippet limits, embedding failure handling).
- **Playwright E2E (`qa/playwright_e2e/_index.md`)**: Configures mocked (+15s) and smoke (+120s) suites, helpers (`MastraStreamBuilder`, `mockMastraAPI`, `ChatPage` page object), and `message_persistence_smoke_test` that validates `savePerStep`, research-trace persistence, and UI consistency post-reload (requires `MASTRA_URL`, `SaveQueueManager`, specific assertion timing).