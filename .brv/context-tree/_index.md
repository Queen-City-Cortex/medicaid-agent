---
children_hash: 4d6fb52f341595ede28eee0941d76fe53cc351da6f8f71745a1d918e4d9fac73
compression_ratio: 0.22577724117114398
condensation_order: 3
covers: [README.md, agent_architecture/_index.md, amendment_detection/_index.md, auth_integration/_index.md, database_operations/_index.md, evaluation/_index.md, frontend_ui/_index.md, qa/_index.md]
covers_token_total: 6626
summary_level: d3
token_count: 1496
type: summary
---
# Project Structural Summary (Level d3)

## README
- **ByteRover**: Project banner; no additional structure.

## Agent Architecture
- **Domain purpose**: NC Medicaid policy agent bootstrapping, memory, and guardrails; audit-focused (see `agent_architecture/context.md`).
- **Topics for deep dive**:
  - `Amendment Pipeline & Guardrails`: Graph-first getAmendments traversal, regex change notice parsing, batch graph runs, and prompt guardrails demanding tool-first, citation-heavy policy comparisons; check `amendment_pipeline_and_prompt/_index.md` plus guardrail and pipeline detail files.
  - `Local Dev Setup`: Docker Compose Neo4j + Mastra web/agent orchestration, `npm run dev` dependency order, root `.env` consolidation, and symlink hygiene ensuring consistent LLM/WorkOS secrets (`local_dev_setup/_index.md` and subfiles).
  - `Mastra Server Configuration`: SSE timeout extension to 10 minutes in `packages/agent/src/index.ts` for stable navigator tool research (`mastra_server_configuration/_index.md`).
  - `Navigate Tools`: Neo4j getAmendments filtering of null rows before `mapDocumentMetadataRecord`, ordered amendment selection, and tooling aligned with validation practices (`navigate_tools/_index.md`).
  - `NC Medicaid Navigator Agent Surface`: Startup wiring of LibSQL + memory/template providers, toolset (searchSections, HallucinationVerifier, etc.), CLI mirroring chat guardrails, and Railway-friendly LibSQL migration (`nc_medicaid_agent/_index.md` and detailed files).
  - `Neo4j Tool Output Validation`: Enforce numeric conversions, expand empty headings via child aggregation, and document ancestor/child/sibling queries (`neo4j_tool_output_validation/_index.md`).
  - `Search Tooling`: Hybrid `searchSections` fusion of embeddings, chunking, concept graph, and keyword hits with deduplication, RRF fusion, Neo4j indexes, and input validation (`search_tooling/_index.md`).

## Amendment Detection
- **Domain focus**: Graph-based detection of DHHS amendments (sanitization, context extraction, AMENDS edges) per `amendment_detection/context.md`.
- **Pipeline detection**: `packages/pipeline/src/pipeline/references/amendments.py` handles document queries, signal-section filtering, sentence extraction, MA/SPA ID capture, batch graph writes, deduped `change_description`, and `status="amendment"` markings, following `pipeline_detection/_index.md`.

## Auth Integration
- **Purpose**: Deployment-specific WorkOS/authkit adjustments for constrained hosts (`auth_integration/context.md`).
- **Topic** (`workos_authkit_nextjs`):
  - Base URL resolution: fallback chain (`NEXT_PUBLIC_WORKOS_REDIRECT_URI` → `WORKOS_REDIRECT_URI` → `RAILWAY_PUBLIC_DOMAIN`) to derive callback origin (`callback_base_url_resolution.md`).
  - Docker redirect fix: parse external host, override `handleAuth.baseURL`, redirect to `/chat` to prevent 0.0.0.0 callbacks (`handleauth_docker_redirect_fix.md`).
  - See topic context for dependencies and method rationale.

## Database Operations
- **Domain**: Database deploy/auth quirks and search indexing fixes (`database_operations/context.md`).
- **Neo4j Auth**:
  - Railway env decoding replaces `+`; require alphanumeric passwords and bolt TCP proxy for live `ALTER CURRENT USER SET PASSWORD` after mount (`neo4j_auth/_index.md`, `railway_neo4j_auth_handling.md`).
- **Neo4j Hybrid Search**:
  - Vector/chunk embeddings, concept matches, and keyword hits fused via RRF (`RRF_K=60`), per-type-group chunk sizing (`topK` ↔ `max(topK,10)`), and mandatory indexes (`section_embeddings`, `chunk_embeddings`, `section_fulltext`) plus schema/index helpers (`neo4j_hybrid_search/_index.md`, `neo4j_hybrid_search_indexing.md`).
  - Dependencies include embedding configs, Neo4j sessions, and `PolicyConcept` filters.

## Evaluation
- **Domain scope**: Level 2/3 answer quality, cross-reference resolution, Neo4j evidence checks, and pipeline instrumentation (`evaluation/context.md`).
  - **Answer Quality (Level 3)**: `packages/pipeline/src/pipeline/eval/levels/answer.py` enforces 180s timeout, gathers Neo4j documents, and uses `judge_answer` with null handling for failures (`answer_quality/_index.md`).
  - **Cross-reference Resolution (Level 2)**: Matches golden cross-refs via Neo4j edges, skips missing docs, and tracks unresolved (q-004, q-009, q-020) (`cross_reference_resolution/_index.md`).
  - **Pipeline Overview**: Connects agents → Neo4j evidence → judge scoring → cross-ref checks; documents error handling and aggregate impacts (`pipeline_overview/_index.md`).

## Frontend UI
- **Domain**: NC Medicaid Navigator UI layout and scroll behavior (`frontend_ui/context.md`).
  - `chat_page_scroll_stability`: ScrollArea viewport targeted scrolling, focus handling, and layout rules to keep sidebar fixed (`chat_page_scroll_stability/_index.md`).
  - `scroll_area_sidebar_stability`: TuneScrollArea smooth scroll ensures sidebar remains visible; flex container uses `overflow-clip` (`scroll_area_sidebar_stability/_index.md`).
  - `proxy_handling`: Next.js 16 proxy migration with `authkitProxy`, matcher exclusions, and WorkOS integration (`proxy_handling/_index.md`).

## QA
- **Domain**: Playwright-driven QA plus evaluation/tooling verification (`qa/context.md`).
  - **Evaluation Pipeline**: Level 3 answer scoring feeding Level 2 cross-ref resolution, Neo4j evidence aggregation, and judge error handling (`evaluation_pipeline/_index.md` and child topics).
  - **Hallucination Verifier**: Processor intercepts assistant outputs, builds source summaries, verifies via `verifyAnswer`, rewrites with `writer.custom`, and handles truncation/verification failures (`hallucination_verifier/_index.md`).
  - **Launch Blockers**: Proxy middleware export fixes, Cypher relation whitelists, verifier constraints, and hardened search tests ahead of release (`launch_blockers/_index.md`).
  - **Playwright E2E**: Mocked/smoke suites, stream builders, route mocking, and chat page helpers for SSE/API stubs (`playwright_e2e/_index.md`).