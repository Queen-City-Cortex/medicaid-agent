---
children_hash: e72af59cac62e10cf238e84a4bdc2b092af9307eeecfffab35aba674442719a9
compression_ratio: 0.4356318437407517
condensation_order: 3
covers: [README.md, agent_architecture/_index.md, amendment_detection/_index.md, auth_integration/_index.md, database_operations/_index.md, evaluation/_index.md, frontend_ui/_index.md, qa/_index.md]
covers_token_total: 6758
summary_level: d3
token_count: 2944
type: summary
---
# Structural Knowledge Summary (Level D3)

## ByteRover Overview
- **README.md**: Anchor for ByteRover system identity; no additional structure provided beyond the root label.

## Agent Architecture Domain (`agent_architecture/_index.md`)
- **Domain Scope**: Frames NC Medicaid policy agent stack—bootstrapping of Mastra + Neo4j tooling, storage/memory (LibSQLStore, DuckDB fallback), hallucination verification, Mastra config, and CLI/web server guardrails; excludes unrelated agents/tutorials.
- **Amendment Pipeline & Prompt Guardrails** (`amendment_pipeline_and_prompt/_index.md`, `amendment_pipeline_and_prompt_guardrails.md`, `context.md`)
  - Graph signal detection prioritizes `getAmendments` traversals, enforces regex-driven notice parsing, batches via `GRAPH_BATCH_SIZE`, and delivers policy-difference summaries with citation requirements plus policy-specific guardrails.
  - System prompt lists allowed tools, demands document-first reasoning, enforces citation structure (section IDs/policy refs/MA numbers), routes DHHS policy questions to MA-2180, warns on LTC Partnership amendments, and mandates plain-language policy differences.
- **Local Development Environment** (`local_dev_setup/_index.md`, related entries)
  - Docker Compose with Neo4j/volume setup, npm@11.11 workspaces (`dev`, `dev:infra`, `dev:web`, `dev:agent`) manage Neo4j + Mastra web+agent servers; commands must run from repo root.
  - Centralized `.env` aggregates OpenAI/Anthropic/Voyage/WorkOS secrets; root-managed symlinks keep package env files in sync; stale symlinks removed before restarts.
- **Mastra Server Tuning** (`mastra_server_configuration/_index.md`)
  - `packages/agent/src/index.ts` raises `server.timeout` from 3 to 10 minutes to keep SSEs alive across long tool-assisted research flows.
- **Navigate Tools** (`navigate_tools/_index.md`, `getamendments_optional_match_filtering.md`)
  - `getAmendments` filters null optional matches before metadata mapping, orders amendments by `effective_date`/`id`, and aligns with Neo4j output validation.
- **NC Medicaid Navigator Agent Surface** (`nc_medicaid_agent/_index.md`, multiple deep files)
  - Startup wires LibSQL storage, observational/working memory, toolset (searchSections/getSection/getDocument/getSectionContext/followReferences/findConceptSections/getAmendments/lookupPolicy/HallucinationVerifier), and CLI runner mirroring chat guardrails.
  - System prompt enforces tool-first actions, citation rules (section IDs, policy numbers, changelog awareness), MAX_STEPS (40) warnings, policy-difference statements, and plain-language answers; environment requires VOYAGE plus OpenAI or Anthropic keys; `/healthz` validates Neo4j; CLI uses `npx tsx src/index.ts`, emits `---ANSWER---`, and narrates tool usage.
  - Memory backed by LibSQLStore replaces DuckDB (fixes Railway musl issues) for observational + working memory plus observability exports.
- **Neo4j Tool Output Validation** (`neo4j_tool_output_validation/_index.md`)
  - Numeric fields converted via `toNumber()` before Zod validation to avoid retries.
  - `getSection` aggregates empty container headings with child text (up to 6k chars, truncated notes) for completeness.
  - `getSectionContext` documents ancestor/child/sibling queries so clients can rely on hierarchical traversal.
- **Search Tooling** (`search_tooling/_index.md`, `hybrid_policy_search_tool.md`)
  - `searchSections` fuses Voyage embeddings, section/chunk vector searches, concept graph hits, and keyword lookups using Neo4j indexes (`section_embeddings`, `chunk_embeddings`, `PolicyConcept`, `section_fulltext`) with helper utilities (`recordToHit`, `dedup`, `rrfFuse`).
  - Flow: Zod validation → `embedQuery` → per-type-group vector/chunk queries (filters default `clinical_policy`, `dhhs_policy`, `federal statute cluster`) → optional concept/full-text hits → dedup by `sectionId` → RRF fusion (`RRF_K=60`, per-group K = `topK` or `max(topK,10)`) → ranked metadata outputs.
  - Constraints: Dedup before fusion; concept matches require `content_length > 200` and valid `section_number`; minimum per-group candidates enforced; depends on Voyage + Neo4j indexes for policy-accurate ranking.

## Amendment Detection Domain (`amendment_detection/_index.md`)
- **Purpose**: Graph-based detection of DHHS amendment relationships, focusing on sanitizing change notices, revised SPAs, and updating Neo4j AMENDS edges.
- **Pipeline Detection** (`pipeline_detection/_index.md`)
  - `packages/pipeline/src/pipeline/references/amendments.py`: Document query → section filtering via `_is_change_notice`, `_is_revised_spa`, `_is_signal_section`, `_is_sentence_boundary` → sentence context extraction → MA/SPA ID capture → deduplicated `change_description` edges.
  - Architectural decisions: Signal sections take precedence (e.g., “CONTENT OF CHANGE”), sentence boundary handling preserves references like `MA-2180.IV.I`, batching via `pipeline.utils.batching.chunked`, Neo4j merges through `queries.MERGE_AMENDS_BATCH`/`SET_DOCUMENT_STATUS_BATCH`, and logging uses `rich.console.Console`.
  - Linked to Neo4j validation (`agent_architecture/neo4j_tool_output_validation`) for ensuring reliable writes.

## Auth Integration Domain (`auth_integration/_index.md`)
- **Purpose**: Deployment-specific fixes for auth handlers in constrained hosts (Docker/Railway); excludes general auth documentation.
- **WorkOS AuthKit Next.js Topic** (`workos_authkit_nextjs/_index.md`)
  - Context: `handleAuth` needs stable public origin before invocation; links callback behavior with deployment constraints.
  - `callback_base_url_resolution.md`: GET `/auth/callback` uses `NEXT_PUBLIC_WORKOS_REDIRECT_URI`, falls back to `WORKOS_REDIRECT_URI`, then `RAILWAY_PUBLIC_DOMAIN`, supplying final origin to `handleAuth` so runtime-only vars remain valid and avoid `0.0.0.0`.
  - `handleauth_docker_redirect_fix.md`: Docker/Railway fix parses redirect URIs for external host, overrides `handleAuth.baseURL`, and returns `/chat` to prevent callbacks hitting internal hostnames.

## Database Operations Domain (`database_operations/_index.md`)
- **Purpose**: Document recovery paths for database auth/connectivity issues in constrained environments.
- **Neo4j Auth** (`neo4j_auth/_index.md`)
  - Railway decodes `+` to spaces, so use strictly alphanumeric passwords; `NEO4J_AUTH` only applies at volume boot—live rotation must run `ALTER CURRENT USER SET PASSWORD` via bolt TCP proxy.
  - Password rotation workflow: deploy with env vars → Railway decodes `+` → rotation to safe string (e.g., `***REDACTED***`) via proxy command.
- **Neo4j Hybrid Search** (`neo4j_hybrid_search/_index.md`)
  - Hybrid pipeline fuses vector/chunk embeddings, concept matches (score ≥ 0.70, `max(top_k,5)`), and keyword hits, all merged through RRF (`RRF_K=60`, per-group k = `top_k` or `max(top_k,10)`).
  - Schema ensures `section_fulltext` index; vector searches iterate document-type groups via `ensure_vector_index`, `vector_search`, `_rrf_fuse`, deduplicate by `section_id`, and rely on `PolicyConcept` filters (`content_length`, `section_number`).
  - Implementation ties to `pipeline.config.EMBEDDING_DIMENSIONS`, Neo4j sessions (`pipeline.graph.connection.get_session`), embeddings indexer files, and schema definitions.

## Evaluation Domain (`evaluation/_index.md`)
- **Purpose**: Hosts Level 2/3 evaluation flows, heuristics, and instrumentation for answer/cross-reference scoring; owned by Evaluation Engineering.
- **Level 3 Answer Quality** (`answer_quality/_index.md`)
  - `packages/pipeline/src/pipeline/eval/levels/answer.py`: HTTP-first answering (CLI fallback), 180s timeout, passes `OPENAI_API_KEY/AGENT_MODEL` overrides; fetches Neo4j sections, scores via `judge_answer`, handles judge failures by returning `None`, treats agent/process errors as zeros.
  - Primary hits flagged for score ≥ 2; non-available judge scores excluded from aggregates.
- **Level 2 Cross-Reference Resolution** (`cross_reference_resolution/_index.md`)
  - `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`: Iterates `cross_refs`, skips missing IDs, matches Neo4j edges (`REFERENCES_DOCUMENT`, `AMENDS`, `HAS_SECTION`, `REFERENCES`) to count resolved/missed; precision/recall derived from resolved ÷ total; unresolved references persist for q-004, q-009, q-020.
- **Pipeline Overview** (`pipeline_overview/_index.md`)
  - Shows Level 2/3 sequence: golden entries → agent invocation → Neo4j evidence retrieval → judge scoring → cross-reference checks → aggregates; details error handling (judge timeouts/errors, missing docs), Neo4j dependency, and ties to QA metrics.
  - Links to `qa/hallucination_verifier` for verification work.

## Frontend UI Domain (`frontend_ui/_index.md`)
- **Domain Focus**: Captures Navigator chat UI layout, scroll stabilization, sidebar behavior, and proxy handling for next.js frontend.
- **Chat Page Review Fixes** (`chat_page_review_fixes/_index.md`)
  - Layout tweaks: collapsible `ThreadSidebar`, `ScrollArea` maintenance, `ResearchTrace` for policy tool states, improved empty states, accessible actions, Lucide icon buttons, consistent emoji handling, and CSS adjustments.
- **Chat Page Scroll Stability** (`chat_page_scroll_stability/_index.md`)
  - Ensures ScrollArea viewport isolation, manual `scrollTo` operations, prevents `scrollIntoView` from shifting layout, maintains `overflow-hidden` ancestors, and integrates mastraClient lifecycle/focus hooks.
- **Scroll Area Sidebar Stability** (`scroll_area_sidebar_stability/_index.md`)
  - `TuneScrollArea` effect animates viewport scroll to bottom, flex container uses `overflow-clip`, works with `useAgentStream` data to keep sidebar visible despite ScrollArea updates.
- **Proxy Handling** (`proxy_handling/_index.md`)
  - Migrates to Next.js 16 `proxy.ts`: exported `proxy(NextRequest)` forwards to `authkitProxy`, includes authkit middleware logic, excludes `_next/static`, `_next/image`, `favicon.ico`, `sitemap.xml`, `robots.txt`, and aligns with WorkOS Authkit requirements for `/auth/callback`.

## QA Domain (`qa/_index.md`)
- **Purpose**: QA/Automation focus on Playwright-driven end-to-end tests for the Medicaid navigator agent UI.
- **Evaluation Pipeline** (`evaluation_pipeline/_index.md`)
  - Coordinates Level 3 answer quality and Level 2 cross-reference evaluations, shares Mastra dev server (localhost:4111), Neo4j sessions, and pipelines; docs cite persistent unresolved references and judge error handling logic.
- **Hallucination Verifier** (`hallucination_verifier/_index.md`)
  - Processor verifies terminal assistant outputs: builds prioritized source texts (`getSection`, `getDocument`, `getAmendments`, `lookupPolicy`, `followReferences`), runs `verifyAnswer`, rewrites via `writer.custom` when verification fails, caps source chars, and returns `VERIFICATION_UNAVAILABLE` upon errors; integrates with Mastra processor hooks.
- **Launch Blockers** (`launch_blockers/_index.md`)
  - Issues addressed pre-launch: proxy middleware signature alignment, Cypher relationship whitelists (`COVERS`, `DEFINES`, etc.), hallucination verifier limits/disclaimers, and search test robustness covering dedup, top-K constraints, snippet truncation, embedding failures, concept filters, and Voyage errors.
- **Playwright E2E** (`playwright_e2e/_index.md`)
  - Two suites: mocked (short timeouts, desktop Chrome) and smoke (120s timeouts hitting live agent + Neo4j); both depend on `npm run dev` for `http://localhost:3000`.
  - Helpers: `MastraStreamBuilder` (`stream-builder.ts`) creates SSE frames; `mockMastraAPI` intercepts SSE/memory APIs; `chat-page.ts` centralizes selectors/actions for navigation, messaging, trace views, and thread sidebar interactions; suites stub streams/requests and exercise chat flows.