---
children_hash: 423d889ce43cdfaaa714301f1fb6298564cb7d97b880b5917b07630ba01a7054
compression_ratio: 0.31170318344911824
condensation_order: 3
covers: [agent_architecture/_index.md, amendment_detection/_index.md, auth_integration/_index.md, database_operations/_index.md, evaluation/_index.md, facts/_index.md, frontend_ui/_index.md, packages/_index.md, qa/_index.md]
covers_token_total: 13099
summary_level: d3
token_count: 4083
type: summary
---
# Structural Summary: Agent Architecture, Retrieval, Runtime Boundaries, and Trust Evaluation

## Top-level structure

These entries describe the system as a set of connected safety and correctness layers:

- **Agent architecture**: canonical NC Medicaid Navigator behavior, prompt guardrails, startup/runtime hardening, and durable curation workflow.
- **Amendment detection**: graph-based detection of policy change relationships and context extraction.
- **Auth integration**: runtime boundary correctness across auth, chat transport, and database state.
- **Database operations**: Neo4j auth, hybrid search, write/read consistency, and schema-aware validation.
- **Evaluation**: answer-quality scoring and cross-reference resolution against Neo4j evidence.
- **Facts**: durable curation rules and project knowledge preservation patterns.
- **Frontend UI**: chat page structure, thread identity, cache restoration, streaming, persistence, feedback, proxy handling, and design language.
- **Packages**: staged retrieval, crawl hardening, policy corpus routing, and evaluation harness behavior.
- **QA**: Playwright E2E architecture and the end-to-end trust chain from retrieval to final answer verification.

## Shared architectural themes

### Runtime boundary correctness
A repeated system-wide rule is that **live runtime state must not be inferred from build-time or first-run assumptions**. This shows up in:
- auth callback origin resolution,
- chat transport reinitialization,
- Neo4j credential handling on fresh vs existing volumes,
- and crawler fetcher isolation from global dispatcher state.

### Staged retrieval over global top-k
Retrieval is consistently treated as a **multi-stage process**:
1. query intent / candidate generation
2. overscan
3. filtering and deduplication
4. reranking or fusion

This appears across policy search, graph retrieval, evaluation, and crawl/pipeline behavior. Identity-based deduplication, coverage-preserving overscan, and ranking after assembly are recurring requirements.

### Trust as a chain
QA and evaluation work together to enforce trust as a pipeline:
- retrieve evidence,
- verify or rewrite unsupported output,
- score only grounded answers,
- validate cross-references against Neo4j relationships.

## Domain summaries

### `agent_architecture`
Core reference for the NC Medicaid Navigator agent’s architecture and operational knowledge.

- `context.md` defines the domain scope: bootstrapping, memory/storage, tool wiring, and policy-focused system prompts.
- `nc_medicaid_agent/_index.md` captures the canonical agent implementation and hardening notes:
  - `startup_and_web_ui_hardening.md`
  - `cli_runner.md`
  - `libsql_storage_fix_for_railway.md`
  - `ssa_and_cfr_reference_resolution_fixes.md`
  - `nc_medicaid_navigator_agent.md`
- `amendment_pipeline_and_prompt/_index.md` focuses on authoritative amendment interpretation, traversal heuristics, and system-prompt guardrails.
- `packages_pipeline/_index.md` covers retrieval backend behavior, crawler sync rules, and SSA parser stability.
- `navigate_tools/_index.md` documents `getAmendments` as the source of truth for Neo4j amendment retrieval and the `OPTIONAL MATCH` + null-filtering pattern.
- `neo4j_tool_output_validation/_index.md` preserves Neo4j-backed read-tool validation rules, including numeric normalization and Zod-compatible payloads.
- `search_tooling/_index.md` records the authoritative hybrid policy search tool, including Voyage embeddings, concept graph matching, RRF, and `searchSections`.

**Key pattern:** runtime correctness, durable curation, and policy-safe retrieval all depend on explicit guardrails and stable tool output shapes.

### `amendment_detection`
Graph-based DHHS amendment detection.

- Primary implementation: `packages/pipeline/src/pipeline/references/amendments.py` via `detect_amendments()`.
- Core flow: scan documents → detect change notices and revised SPAs → extract MA/SPA references and sentence context → write `AMENDS` edges → mark documents as `status="amendment"`.
- Important behaviors:
  - uses `_is_change_notice`, `_is_revised_spa`, `_is_signal_section`, `_is_sentence_boundary`
  - sentence boundary fix prevents periods inside MA identifiers from splitting context incorrectly
  - `_extract_context` preserves full sentences containing dotted MA numbers such as `MA-2180.IV.I`
  - `change_description` is deduplicated per `(source, target)` before `MERGE_AMENDS_BATCH`
  - signal sections are preferred over fallback bodies
- Detection patterns include:
  - `CHANGE NOTICE FOR MANUAL NO. ...`
  - MA-series identifiers: `((?:MA|DMA|DHB|DSS)-\d+)`
  - SPA identifiers: `SPA\s+(\d+[\s\-]+\d+)`

**Drill-down:** `pipeline_detection/_index.md`, `amendment_detection_pipeline.md`

### `auth_integration`
Shared runtime-boundary model across auth, transport, and database behavior.

- Public origins, callbacks, credentials, and chat identity must come from **runtime context**, not static hostnames or first-run assumptions.
- `auth-and-deployment-fixes-are-driven-by-runtime-environment-boundaries.md`
  - WorkOS callback routing computes public origin dynamically
  - environment-driven resolution order protects Railway/Docker deployments
  - Next.js middleware is replaced with `proxy.ts` for Authkit compatibility
  - root `.env` is the source of truth, with package envs mirroring it
- `environment-boundaries-drive-both-deployment-fixes-and-auth-reliability.md`
  - auth callback bugs and database issues share the same boundary confusion pattern
- `runtime-boundaries-are-the-root-cause-behind-auth-and-deployment-reliability.md`
  - root `.env` remains authoritative
  - `NEO4J_AUTH` only applies on first initialization
- `runtime-boundary-correctness-is-the-shared-fix-for-auth-chat-transport-and-datab...md`
  - extends the model into chat transport
  - `DefaultChatTransport` is memoized on `threadId`, `resourceId`, and `getAccessToken`
  - chat identity is tied to `threadId:resourceId`

**Drill-down:** `workos_authkit_nextjs/_index.md`

### `database_operations`
Operational knowledge for Neo4j deployment, authentication, retrieval, and consistency.

#### `neo4j_auth`
- Railway URL-decodes env vars, so `+` can become a space and corrupt passwords.
- `NEO4J_AUTH` only sets the password on first volume initialization.
- Safe fix: rotate to an alphanumeric password and use `ALTER CURRENT USER SET PASSWORD` through the bolt TCP proxy.
- Production refresh guidance:
  - do **not** use `deploy-data.sh load --reset`
  - safe sequence is Railway TCP proxy → set `NEO4J_URI` and `NEO4J_PASSWORD` → ingest SSA/CFR → extract references → embed incrementally → disable proxy

#### `neo4j_hybrid_search`
- Hybrid retrieval combines:
  - vector embeddings per document-type group
  - chunk embeddings
  - keyword fulltext search over `Section.title` and `Section.content_text`
  - concept graph matches gated by `query_text`
- Fusion uses Reciprocal Rank Fusion with `RRF_K = 60`.
- Important rules:
  - `ensure_vector_index` requires `section_embeddings`, `chunk_embeddings`, and `section_fulltext`
  - deduplicate by `section_id` before fusion
  - concept matches use `CONCEPT_MATCH_SCORE = 0.70`

#### `neo4j_write_read_consistency`
- `CorpusGraphWriter` uses managed Neo4j writes with idempotent MERGE-based behavior.
- Incremental cleanup preserves embeddings for unchanged sections while removing stale sections.
- Key flow: merge document → write sections → delete stale sections → clear changed embeddings → merge relationships.
- Reruns should not force full re-embedding.

#### Cross-cutting synthesis
- Normalize output before validation.
- Filter null rows after `OPTIONAL MATCH`.
- Validate against schema-compatible structures before trusting downstream search, scoring, or QA results.

**Drill-down:** `neo4j_auth/_index.md`, `neo4j_hybrid_search/_index.md`, `neo4j_write_read_consistency/_index.md`

### `evaluation`
Central evaluation domain for the Medicaid Navigator.

- Shared structure: golden entries → agent execution → Neo4j evidence lookup → judgment/scoring → metrics.
- `answer_quality/_index.md`
  - Level 3 answer-quality evaluation in `packages/pipeline/src/pipeline/eval/levels/answer.py`
  - HTTP-first agent invocation with CLI fallback
  - answer extraction after `---ANSWER---`
  - failures: judge failures become `None`, agent failures become `0`
  - `primary_hit` is set when overall score is at least 2
- Retrieval-model finding:
  - `voyage-law-2` vs `voyage-4-large` showed a small MRR gain but no meaningful overall improvement
  - conclusion: bottleneck is structural, not just embedding-model choice
- `cross_reference_resolution/_index.md`
  - Level 2 validation in `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`
  - resolution order: document-level `REFERENCES_DOCUMENT` and `AMENDS`, then section-level `REFERENCES`
  - tracks precision/recall via resolved vs missed cross-refs
- `pipeline_overview/_index.md`
  - two primary modules: `answer.py` and `cross_ref.py`
  - shared dependency on Neo4j and `judge_answer`
  - 180-second agent timeout

**Drill-down:** `answer_quality_evaluation.md`, `cross_reference_resolution_evaluation.md`, `evaluation_pipeline_overview.md`

### `facts`
Project curation rules and durable knowledge model.

- The main child entry defines the project’s durable curation approach: convert snippets into structured facts, preserve timestamps, and keep knowledge reusable.
- Standard workflow: **recon → extract salient facts/context → curate with UPSERT → verify applied files and failures**.
- Two-part context model:
  - `rawConcept`
  - `narrative`
- Every curated context must include:
  - a clear `task`
  - at least one of `changes`, `files`, or `flow`
  - at least one narrative field
- Preservation rules:
  - exact timestamps
  - exact rule text
  - intact regex patterns
  - avoid vague contexts
- UPSERT is the preferred update mode.

**Drill-down:** `curated_context_snippet.md`

### `frontend_ui`
Chat UI architecture and its runtime coupling to identity, persistence, and transport.

#### Chat page structure and testing
- `chat_page_review_fixes`
  - refactors `packages/web/src/app/chat/page.tsx` into smaller components: `EmptyState`, `MessageList`, `ChatInput`, `ResearchTrace`
  - layout centers on a collapsible `ThreadSidebar`, main `ScrollArea`, and conditional message rendering
- `live_ui_testing_without_workos_auth_wall`
  - sanctioned test paths:
    1. dev-only `/preview`
    2. Playwright `design` project against real `/chat` with mocked backend calls
  - do **not** add env-based auth bypass in `proxy.ts`

#### Scroll and layout stability
- `chat_page_scroll_stability`
  - uses `viewport.scrollTo` instead of `scrollIntoView`
  - adds `min-h-0` to the main `ScrollArea`
  - uses `preventScroll: true` to avoid focus-driven jumps
- `scroll_area_sidebar_stability`
  - fixes sidebar displacement caused by `scrollIntoView`
  - outer layout changes from `overflow-hidden` to `overflow-clip`

#### Thread identity, cache, and transport
- `chat_page_transport`
  - `useChat` ID expanded from `threadId` to `threadId:resourceId`
  - `DefaultChatTransport` memoized on `threadId`, `resourceId`, and `getAccessToken`
- `chat_page_thread_cache`
  - per-thread cache restoration survives transport changes
  - `messageCache` keyed by `threadId`
  - `pendingRestore` is applied after the new `useChat` instance mounts
- `message_persistence_cache`
  - fixes a race between UI restoration and async `savePerStep`
  - restores cached messages before calling `loadThread`
- Shared rule: runtime identity and auth-derived resource identity must propagate through transport, cache restoration, and memory loading.

#### Streaming and error handling
- `chat_streaming_error_handling`
  - SSE streaming centered on `AISdkStreamBuilder` and `ChatPage`
  - flow: request → stream opens → chunks render → errors handled → stream closes

#### Message persistence, parsing, and citation styling
- `message_persistence_parsing`
  - reconstructs persisted Mastra thread messages into `UIMessage`
  - converts `MastraMessageContentV2` and legacy content formats
  - citation styling routes markdown links through `normalizeCitationUrl` and source index lookup

#### Feedback and sidebar resilience
- `message_feedback`
  - feedback is message-centric and tied to persisted chat state
  - optimistic updates are rolled back on failures
  - `registerApiRoute` paths must not begin with `"/api/"`
- `thread_sidebar_fetch_resilience`
  - uses `AbortController` to cancel stale thread fetches
  - treats `401` as non-error while `useMastraReady` is false

#### Proxy handling and design language
- `proxy_handling`
  - Next.js 16 `proxy.ts` uses `authkitProxy`
  - auth gated to `/auth/callback`
  - excludes static and metadata routes
  - theme persistence is cookie-first, with WorkOS metadata as secondary sync/backfill
- `design_system`
  - “Document of Record” design language
  - typography: `Fraunces`, `Newsreader`, `IBM Plex Mono`
  - light theme = parchment, dark theme = library at night
  - fixed paper-grain overlay at `z-index: 10`
  - preserve `data-testid` attributes

### `packages`
Retrieval, crawl, and evaluation systems organized around staged ranking and runtime isolation.

#### Main theme
- Avoid single-pass global top-k.
- Use staged retrieval with overscan, filtering, deduplication, and reranking/fusion.
- Preserve behavior under refactors and runtime changes.

#### Policy corpus and retrieval
- `policy_corpus/_index.md` and related entries describe:
  - staged collector pipeline
  - `mergeMax`
  - fulltext recovery
  - `finalizeHybridHits`
  - setting-aware routing before narrowing
  - rerank scoring split into ordered `HitScorer` functions
- `retrieval_quality/_index.md` and synthesis notes emphasize decontamination plus staged ranking.
- `staged-retrieval-*` synthesis entries define the retrieval contract across search, graph assembly, and evaluation.

#### Evaluation and A/B harness
- `pipeline/_index.md`
  - CLI refactor into `pipeline.cli`
  - package entry-point imports preserve command registration
  - validation remained clean, with 301 passed and 2 skipped
- A/B harness:
  - `scripts/eval-ab.sh` supports embeddings, reranker, and verifier gates
  - evaluation uses a `0.05` regression threshold
  - `voyage-4` is preferred over `voyage-law-2` on cost/quality grounds

#### Crawler hardening
- `crawler/_index.md`
  - crawler fetch failures came from global dispatcher mutation, not isolated `request()` calls
  - `createFetcher()` now owns a private undici dispatcher
  - redirects use `new Agent().compose(interceptors.redirect({ maxRedirections }))`
  - behavior preserved: serialization, rate limiting, retry/backoff, file streaming

### `qa`
Playwright E2E infrastructure and the trust chain for final-answer correctness.

- Core scope:
  - mocked and smoke suites
  - Mastra streaming and memory API mocking
  - chat interaction and thread sidebar page objects
- `playwright_e2e/_index.md`
  - two Playwright projects:
    - mocked: 15s timeouts
    - smoke: 120s timeouts
  - helpers include:
    - `MastraStreamBuilder`
    - `mockMastraAPI`
    - `ChatPage`
- Trust chain:
  - retrieval → verification/rewrite → evaluation
  - `HallucinationVerifier` builds prioritized source text from `getSection`, `getDocument`, `getAmendments`, `lookupPolicy`, and `followReferences`
  - verification is final-answer only and rewrite-based
- `evaluation_pipeline/_index.md`
  - Level 3 answer scoring
  - Level 2 cross-reference validation
  - shared dependence on live mastra HTTP service and Neo4j evidence

**Drill-down:** `playwright_e2e/_index.md`, `hallucination_verifier/_index.md`, `evaluation_pipeline/_index.md`, `launch_blockers/_index.md`

## Cross-entry drill-down map

- **Agent hardening and runtime behavior**
  - `nc_medicaid_agent`
  - `amendment_pipeline_and_prompt`
  - `local_dev_setup`
- **Retrieval and graph safety**
  - `packages_pipeline`
  - `navigate_tools`
  - `search_tooling`
  - `neo4j_tool_output_validation`
- **Runtime boundary fixes**
  - `auth_integration`
  - `frontend_ui/chat_page_transport`
  - `database_operations/neo4j_auth`
- **Evaluation and trust**
  - `evaluation`
  - `qa`
- **Durable curation discipline**
  - `facts/project/curated_context_snippet.md`