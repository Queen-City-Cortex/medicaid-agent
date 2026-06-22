---
children_hash: 6b2217fe4239c9c6a279fee49b37f16dd13f023bd115e794f495fe33c0da951f
compression_ratio: 0.33653429602888085
condensation_order: 3
covers: [agent_architecture/_index.md, amendment_detection/_index.md, auth_integration/_index.md, database_operations/_index.md, evaluation/_index.md, facts/_index.md, frontend_ui/_index.md, packages/_index.md, qa/_index.md]
covers_token_total: 13850
summary_level: d3
token_count: 4661
type: summary
---
# Structural Summary: Level d3

This tree captures the project’s main operational spine: architecture and runtime boundaries, database/search correctness, evaluation and QA trust chains, and the durable curation workflow that preserves these decisions as structured knowledge. Across the entries, the recurring design pattern is **staged processing with explicit guardrails**: resolve runtime values dynamically, preserve stable identities, validate shaped outputs, and only then trust downstream scoring or UI behavior.

## 1) Agent architecture and operational guardrails

### `agent_architecture/_index.md`
The agent architecture domain collects the core knowledge for the NC Medicaid Navigator’s retrieval, amendment interpretation, runtime hardening, and curation workflow.

- `context/_index.md` is the durable knowledge anchor for the RLM curation pattern:
  - recon → single-pass extraction when compact enough → dedup/group → UPSERT curate → verify by applied file paths
  - stores operational knowledge as durable context instead of chat memory
- `amendment_pipeline_and_prompt/_index.md` documents amendment-graph interpretation and prompt guardrails:
  - authoritative change-summary extraction
  - policy QA prompt constraints
  - traversal and pipeline rules preserved for drill-down
- `mastra_server_configuration/_index.md` preserves the long-running server configuration decision:
  - Mastra server timeout set to **10 minutes**
  - driven by **SSE lifecycle**
  - supports multi-step tool research beyond **180 seconds**
- `navigate_tools/_index.md` defines `getAmendments` behavior:
  - uses **OPTIONAL MATCH**
  - applies **null-row filtering**
  - preserves metadata mapping and authoritative document selection
- `neo4j_tool_output_validation/_index.md` covers Neo4j read-tool output shaping:
  - numeric normalization / `Integer` conversion
  - Zod-compatible payloads
  - container-heading expansion
  - structured context query organization
- `runtime-boundary-bugs-cluster-around-deploy-auth-and-database-initialization.md` ties together recurring failures where build-time assumptions replace live runtime state.

### Shared architectural rule
The tree repeatedly reinforces that runtime-correct behavior depends on **live resolution at request time**, not static configuration assumptions.

---

## 2) Agent runtime, CLI, storage, and citation correctness

### `nc_medicaid_agent/_index.md`
This topic consolidates the main agent implementation and the hardening work around it.

- `startup_and_web_ui_hardening.md`
  - startup checks, Mastra config, web UI constraints, and system prompt rules
- `cli_runner.md`
  - CLI iteration behavior
  - memory payload requirements
  - `cli-${Date.now()}` thread behavior
  - `onIterationComplete` guardrail and cleanup
- `libsql_storage_fix_for_railway.md`
  - Railway persistence fix replacing **DuckDB/MastraCompositeStore** with **LibSQL**
- `ssa_and_cfr_reference_resolution_fixes.md`
  - SSA/CFR parser and citation resolution fixes
- `nc_medicaid_navigator_agent.md`
  - agent prompt and metadata guidance

### Core decisions
- LibSQL is the persistence backend used to avoid Alpine/musl DuckDB crashes.
- The CLI runner must preserve memory, finish iterations safely, and shut down cleanly.
- Citation correctness depends on SSA/CFR reference resolution fixes plus prompt guidance.

### Cross-entry relation
The runtime-boundary cluster in `auth_integration` reinforces the same principle here: do not rely on first-run or build-time state when the system needs live runtime correctness.

---

## 3) Runtime environment boundaries: auth, transport, and database init

### `auth_integration/_index.md`
This domain captures the recurring failure mode where build-time or initialization state is confused with live runtime state.

#### `workos_authkit_nextjs/_index.md`
- Documents the Railway/Docker callback fix for `@workos-inc/authkit-nextjs`
- `handleAuth` must receive a **public baseURL**, not an internal host like `0.0.0.0`
- `getBaseURL` resolution order:
  1. `NEXT_PUBLIC_WORKOS_REDIRECT_URI`
  2. `WORKOS_REDIRECT_URI`
  3. `RAILWAY_PUBLIC_DOMAIN`
- The callback route at `packages/web/src/app/auth/callback/route.ts` passes the resolved public origin so redirects return users to `/chat`

#### Clustered runtime-boundary themes
- Auth reliability depends on resolving callback origins dynamically from deploy-time/runtime env fallbacks.
- The repo root `.env` is treated as the source of truth, with package env files symlinked to it.
- Chat transport must reinitialize when auth/runtime identity changes:
  - `useChat` identity expands from `threadId` to `threadId:resourceId`
  - `DefaultChatTransport` is memoized on `threadId`, `resourceId`, and `getAccessToken`
- Neo4j initialization vs live credential updates:
  - `NEO4J_AUTH` only sets credentials on first volume initialization
  - existing volumes require runtime password updates, not init flags

### Structural takeaway
The shared fix across auth, chat transport, and database handling is: **resolve public/runtime values when needed, and treat first-run initialization as distinct from ongoing state changes**.

---

## 4) Database operations and graph safety

### `database_operations/_index.md`
Operational knowledge for database deployment and auth incidents is centralized here, with ownership by the Platform Infrastructure Team.

#### `neo4j_auth/_index.md`
- Railway URL-decodes env vars, so `+` can become a space and corrupt Neo4j passwords
- `NEO4J_AUTH` only initializes the password on first volume setup
- Safe remediation:
  - rotate to an alphanumeric-only password
  - apply with `ALTER CURRENT USER SET PASSWORD` through the bolt TCP proxy
- Production refresh guidance:
  - do **not** use destructive `deploy-data.sh load --reset`
  - use the TCP proxy, set `NEO4J_URI` / `NEO4J_PASSWORD`, ingest SSA/CFR, extract references, embed incrementally, then disable the proxy

#### `neo4j_hybrid_search/_index.md`
- Documents the Neo4j hybrid retrieval stack
- Retrieval combines:
  - vector embeddings per document-type group
  - chunk embeddings
  - fulltext search over `Section.title` and `Section.content_text`
  - concept graph matches gated by `query_text`
- Fusion uses **Reciprocal Rank Fusion** with `RRF_K = 60`
- Important rules:
  - `ensure_vector_index` requires `section_embeddings`, `chunk_embeddings`, and `section_fulltext`
  - results are deduplicated by `section_id` before fusion
  - concept matches use fixed `CONCEPT_MATCH_SCORE = 0.70`

#### `neo4j_write_read_consistency/_index.md`
- Captures write-side behavior of `CorpusGraphWriter` and incremental crawl cleanup
- Key flow:
  - merge document → write sections → delete stale sections → clear changed embeddings → merge relationships
- Idempotent MERGE-based writes and doc-scoped cleanup make reruns safe
- Unchanged sections retain prior embeddings/chunks
- Relationship paths are separated into:
  - `merge_reference_edges`
  - `merge_amendments`
  - `merge_supersessions`
  - `merge_concept_links`
- `incremental_crawl_ingest_run_19.md` records crawl run #19:
  - 34 targeted docs
  - corpus grew from 6693 to 6725 docs
  - 1533 sections added
  - multiprocessing spawn from stdin/heredoc is a gotcha

### Cross-cutting safety rule
The database domain consistently favors **incremental, environment-aware mutation** plus **schema-aware validation** before output is trusted by search, evaluation, or QA.

---

## 5) Retrieval, crawler, and pipeline hardening

### `packages/_index.md`
This cluster shows the project’s retrieval contract: avoid naive global top-k, stage candidate selection, and validate under controlled conditions.

#### `crawler/_index.md`
- Node 26 crawl fetcher hardening in `packages/crawler/src/crawl/fetcher.ts`
- Uses a **private undici dispatcher** created in `createFetcher()`
- Redirect handling via `interceptors.redirect({ maxRedirections })`
- Key guarantees:
  - per-domain serialization
  - rate limiting
  - retry/backoff
  - file streaming
- Root cause: `cheerio` imports mutate undici global state via `setGlobalDispatcher()`
- Outcome: forward-compatible with undici 7 and verified on a dry run that discovered **177 clinical_policy docs**

#### `retrieval_quality/_index.md` and related staged-retrieval entries
- Retrieval is a **staged contract**, not single-pass global top-k
- Common sequence:
  - overscan candidates
  - filter by intent or type
  - dedupe by stable identity (`sectionId` / `section_id`)
  - rerank or fuse at the end
- This is necessary because Neo4j `queryNodes(k)` is **global top-k**

#### `policy_corpus/_index.md`
- Most complete structural map of the policy-corpus pipeline
- Retrieval stages:
  - backends + fulltext
  - amendment-title expansion
  - document expansion
  - change-notice expansion
  - final rerank
- `mergeMax` keeps the highest-scored hit per `sectionId`
- `computeDocumentCoverageBoosts()` runs twice: pre-expansion and post-expansion
- Rerank is selective and fail-open

#### `frame/_index.md`, `document_selection/_index.md`, `coverage_routing/_index.md`
- Coverage selection moved from score-field driven to positional selection
- Setting-aware narrowing happens before `narrowInferredCoverageDocuments`
- If a query names a care setting, matching documents are preferred
- Federal authority handling pairs statute and regulation when citation lookup is intended

#### `rerank_scoring/_index.md`
- `rerankRetrievalHit` was decomposed into about 20 ordered `HitScorer` functions
- `deriveHitFeatures` computes per-hit features once
- `HIT_SCORERS` order matters and floating-point behavior must stay pinned

#### `pipeline/_index.md`
- CLI split preserved `python -m pipeline.cli`
- Validation reported clean build, `ruff` clean, **301 passed**, **2 skipped**, and **25 commands** still registered
- Eval A/B gates now separate embeddings, reranker, and verifier
- `EVAL_REGRESSION_THRESHOLD = 0.05`

### Structural takeaway
The retrieval stack repeatedly converges on one rule: **staged overscan + filtering + deduplication + reranking/fusion** is the project’s retrieval contract.

---

## 6) Deep research workflow and fixes

### `agent_architecture/deep_research_workflow/_index.md`
This topic documents the Mastra vNext deep research pipeline and its later hardening.

- Core flow:
  - **plan → plan-approval → research → synthesize → verify**
- Plan approval is human-in-the-loop and suspends before research begins
- Research performs parallel fan-out over sub-questions with bounded reflection and novelty-based stopping
- Synthesize produces a cited markdown report
- Verify can rewrite or score output against sources

### Important implementation facts
- `agent.generate(...)` returns `FullOutput` with `.object`, `.text`, and `.toolResults`
- `createStep` receives `{ inputData, resumeData, suspend, writer, mastra, bail }`
- `writer.write(data)` must be awaited
- suspend payloads are keyed by step ID
- model type export must be `ReturnType<ReturnType<typeof createOpenAI>>`

### `deep_research_workflow_fixes.md`
- Worker guard via `onIterationComplete`
- `WORKER_MAX_STEPS` increased from 12 to 16
- Deterministic `validateAnswerUrls` grounding replaces chat-tuned verification
- `decline()` now sets cancelled immediately
- `sourceLabel(SourceEntry)` converts raw corpus evidence into human-readable labels

### Shared surfaces
- `packages/agent/src/deep-research/workflow.ts`
- `packages/agent/src/deep-research/agents.ts`
- `packages/agent/src/deep-research/config.ts`
- `packages/agent/src/deep-research/schemas.ts`
- `packages/agent/src/model.ts`
- `packages/web/src/lib/use-deep-research.ts`

### Structural takeaway
The workflow is designed to stay **cited, bounded, and resumable**, with fixes focused on deterministic verification and worker safety.

---

## 7) Evaluation, QA, and trust as a chain

### `evaluation/_index.md`
This domain is the formal evaluation layer for the Medicaid Navigator.

- `answer_quality/_index.md`
  - Level 3 answer-quality scoring for `ncMedicaidAgent`
  - flow: golden entries → `_invoke_agent` → Neo4j evidence lookup → `judge_answer` → metrics
  - agent invocation is HTTP-first with CLI fallback
  - failures are handled explicitly: judge failures yield `None`, agent failures yield `0`
- `cross_reference_resolution/_index.md`
  - Level 2 graph relationship validation
  - resolution order:
    - document-level `REFERENCES_DOCUMENT` and `AMENDS`
    - fallback to section-level `REFERENCES` via `HAS_SECTION`
  - tracks resolved vs missed cross-refs
- `pipeline_overview/_index.md`
  - summarizes the shared evaluation flow and module boundaries

### Retrieval-model finding
The A/B test comparing `voyage-law-2` vs `voyage-4-large` showed a small MRR gain but no meaningful overall improvement, pointing to a structural bottleneck rather than a model-choice bottleneck.

### `qa/_index.md`
The QA domain captures Playwright test infrastructure and the broader trust pipeline.

#### `playwright_e2e/_index.md`
- Playwright config defines:
  - **Mocked** suite with 15s timeouts
  - **Smoke** suite with 120s timeouts
- Shared helpers:
  - `MastraStreamBuilder`
  - `mockMastraAPI`
  - `ChatPage`
- Depends on `npm run dev` from `../packages/web` and `http://localhost:3000`

#### `hallucination_verifier/_index.md`
- Verification is **final-answer only**
- Runs only when `finishReason` is `stop`
- Requires no pending tool calls and requires text
- Failure handling is **rewrite-based**, not retry-based
- CLI output is machine-parsed using stable blocks:
  - `---EVIDENCE---`
  - `---VERIFIER---`
  - `---ANSWER---`
- The verifier schema includes:
  - `supported`
  - `relevant`
  - `unsupportedClaims`
  - `relevanceIssues`
  - `correctedAnswer`

#### `evaluation_pipeline/_index.md`
- Links Level 3 answer scoring and Level 2 cross-reference checks into one trust chain
- Shares the same dependencies:
  - mastra dev HTTP service on `localhost:4111`
  - Neo4j evidence retrieval
  - metadata like difficulty, reasoning type, and primary hit

### Structural takeaway
QA, verification, and evaluation are organized as a single correctness chain:
**retrieve evidence → verify or rewrite unsupported output → score only grounded answers**.

---

## 8) Frontend UI: chat runtime, cache, streaming, and design

### `frontend_ui/_index.md`
This layer groups the stabilized chat-page experience and the testing/proxy/design infrastructure around it.

#### `chat_page_review_fixes.md`
- `packages/web/src/app/chat/page.tsx` was refactored into:
  - `EmptyState`
  - `MessageList`
  - `ChatInput`
  - `ResearchTrace`
- Layout centers on a flex container with:
  - collapsible `ThreadSidebar`
  - main `ScrollArea`
  - conditional `MessageList` vs `EmptyState`
- Chat uses `useChat` with `DefaultChatTransport` targeting `${MASTRA_URL}/chat`, plus `getAccessToken` and `mastraClient` thread management

#### `live_ui_testing_without_workos_auth_wall.md`
- Two approved local testing paths:
  1. Dev-only `/preview` gallery
  2. Playwright `design` project against real `/chat`
- Key rule: **do not add an env-gated auth bypass in `proxy.ts`**

#### `chat_page_scroll_stability.md`
- Scrolling uses `viewport.scrollTo` on the scroll-area viewport element instead of `scrollIntoView`
- Requires `min-h-0` on the main `ScrollArea`
- Focus changes use `preventScroll: true`
- `overflow-clip` is not a substitute for `overflow-hidden`

#### `chat_page_thread_cache_restoration.md`
- `messageCache` is keyed by `threadId`
- `handleSelectThread` restores cached messages immediately, then still calls `loadThread`
- `pendingRestore` delays applying cached messages until the new `useChat` instance mounts

#### `authenticated_chat_transport_reinitialization.md`
- `useChat` identity expands from `threadId` to `threadId:resourceId`
- `resourceId` defaults to `anonymous` until auth loads
- `DefaultChatTransport` is memoized on `threadId`, `resourceId`, and `getAccessToken`

#### `ai_sdk_v6_sse_streaming_and_error_handling.md`
- Streaming now uses `AISdkStreamBuilder` instead of `MastraStreamBuilder`
- Flow:
  - request → SSE stream opens → chunks stream to UI → errors handled → stream closes

#### `message_persistence_parsing.md`, `message_feedback_flow.md`
- Persisted Mastra messages are reconstructed into `UIMessage` payloads
- `convertV4PartsToV5` preserves tool-invocation semantics
- Feedback is message-centric and flows through persistence, API routes, web client helpers, and optimistic UI updates

#### `thread_sidebar_fetch_resilience.md`
- Thread loading uses `AbortController`
- `401` responses are suppressed while `useMastraReady` is false
- `useMastraClient` recreates `mastraClient` when access token changes

#### `document_of_record_design_language.md`, `web_theme_persistence.md`
- Design system uses a **Document of Record** editorial language
- Theme persistence is cookie-first:
  - cookie determines first paint
  - WorkOS metadata is secondary for sync/backfill
  - server read in `layout.tsx` plus pre-paint client read prevent a flash of incorrect theme

### Structural takeaway
The frontend layer is organized around one hidden coupling: **thread/auth identity must stay aligned across chat transport, cache restoration, streaming, and theme state**.

---

## 9) Facts and curation workflow

### `facts/_index.md`
This domain captures the project’s durable curation rules and canonical snippet workflow.

#### `conventions/_index.md`
- The RLM curation flow is:
  - recon → extraction → curate apply
- Prefer **UPSERT**
- For chunked extraction, use `tools.curation.mapExtract()` with a bare `taskId`
- `mapExtract` calls require `timeout: 300000`
- Do not print raw context during curation
- Do not rerun recon when precomputed recon already exists
- Context quality rules require:
  - a clear `task`
  - at least one of `changes` / `files` / `flow`
  - at least one narrative field
  - minimum 2–4 sentences
- Preserve exact rule text, regex patterns, and enumerated items

#### `project/_index.md`
- Documents the structured durable-knowledge snippet model
- `rawConcept` fields:
  - task, changes, files, flow, timestamp, author, patterns
- `narrative` fields:
  - structure, dependencies, highlights, rules, examples
- Facts must be extracted and preserved
- Temporal information must be retained exactly
- Avoid vague contexts and nested subtopics
- Verify curation using `result.summary.failed` and `result.applied`

### Structural takeaway
This domain is the project’s memory discipline: **turn operational knowledge into durable structured entries with preserved facts, exact rules, and verified file-path outcomes**.