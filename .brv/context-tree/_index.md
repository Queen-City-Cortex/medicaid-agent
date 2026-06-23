---
children_hash: 5f73c0a1ea865c075a7979105cad728d5b1bffbeaa32f0c3375303e0b1c4e905
compression_ratio: 0.30822929252248626
condensation_order: 3
covers: [agent_architecture/_index.md, amendment_detection/_index.md, auth_integration/_index.md, database_operations/_index.md, evaluation/_index.md, facts/_index.md, frontend_ui/_index.md, packages/_index.md, qa/_index.md]
covers_token_total: 14898
summary_level: d3
token_count: 4592
type: summary
---
# d3 Structural Summary

This level consolidates the project’s durable architectural knowledge into a few recurring system patterns: **runtime-boundary correctness, staged retrieval, schema-aware validation, and end-to-end trust enforcement**. The child entries below describe how those patterns appear across agent architecture, database operations, UI reliability, evaluation, QA, and curation workflow.

## 1) Agent architecture and operational guardrails

### `agent_architecture/_index.md`
- Central source for the NC Medicaid Navigator’s architecture and maintenance rules.
- Major subareas:
  - `amendment_pipeline_and_prompt/_index.md` — amendment interpretation, prompt guardrails, change-summary extraction
  - `context/_index.md` — RLM curation workflow and durable operational knowledge
  - `deep_research_workflow/_index.md` — Mastra deep research pipeline and fixes
  - `local_dev_setup/_index.md` — local dev, CI, and environment management
  - `mastra_server_configuration/_index.md` — long-running SSE timeout tuning
  - `navigate_tools/_index.md` — `getAmendments` query behavior and null-row filtering
  - `nc_medicaid_agent/_index.md` — main agent runtime, CLI, storage, and citation fixes
  - `neo4j_tool_output_validation/_index.md` — schema-safe Neo4j tool output validation
  - `packages_pipeline/_index.md` — retrieval, parsing, and crawler pipeline
  - `search_tooling/_index.md` — hybrid policy search stack
- Shared theme: preserve implementation facts, workflow decisions, and guardrails as curated knowledge rather than chat-only context.

### Key architectural threads
- **`context/_index.md`** documents the curation pattern:
  - recon → single-pass or chunked extraction → dedup/group → UPSERT curate → verify by applied file paths.
  - Durable operational knowledge is kept in the context tree, not memory.
- **`mastra_server_configuration/_index.md`** preserves the 10-minute server timeout driven by SSE lifecycle and long-running research.
- **`navigate_tools/_index.md`** preserves `OPTIONAL MATCH`, null filtering, and authoritative amendment selection.
- **`neo4j_tool_output_validation/_index.md`** focuses on numeric normalization, Zod-compatible payloads, and structured query output.

## 2) Runtime boundaries, auth, and deployment correctness

### `auth_integration/_index.md`
- Repeated failure mode: bugs occur when build-time or first-run assumptions are used instead of live runtime state.
- Durable fix: resolve public-facing values at request/runtime and centralize shared configuration.

### Important child entries
- `auth-and-deployment-fixes-are-driven-by-runtime-environment-boundaries.md`
  - WorkOS callback origins resolved dynamically.
  - Next.js proxy handling replaces middleware for compatibility.
  - Root `.env` is the source of truth; app env files are symlinked.
- `environment-boundaries-drive-both-deployment-fixes-and-auth-reliability.md`
  - Extends the same principle across auth and database systems.
- `runtime-boundaries-are-the-root-cause-behind-auth-and-deployment-reliability.md`
  - Frames the core issue as build-time assumptions leaking into runtime configuration.
- `runtime-boundary-bugs-cluster-around-deploy-auth-and-database-initialization.md`
  - Unifies deployment, auth, and Neo4j initialization failures under one boundary problem.
- `runtime-boundary-correctness-is-the-shared-fix-for-auth-chat-transport-and-datab.md`
  - Connects auth, chat transport, and database remediation to runtime-boundary correctness.
- `workos_authkit_nextjs/_index.md`
  - Railway/Docker callback fix; `baseURL` is computed from runtime/public fallback order:
    1. `NEXT_PUBLIC_WORKOS_REDIRECT_URI`
    2. `WORKOS_REDIRECT_URI`
    3. `RAILWAY_PUBLIC_DOMAIN`

### Cross-cutting relation
- `runtime_boundary_fixes/_index.md` is nearby but distinct: it focuses on fresh-token runner behavior for chat/deep research flows, emphasizing runtime reattachment and token refresh resilience.

## 3) Database operations and schema-aware safety nets

### `database_operations/_index.md`
- Operational knowledge for database deployments, authentication incidents, and safe production refresh flows.
- Owned by the Platform Infrastructure Team.
- Core emphasis: environment-sensitive Neo4j behavior plus schema-aware validation.

### Core clusters
#### `neo4j_auth`
- Railway URL-decodes env vars, so `+` can become a space and corrupt passwords.
- `NEO4J_AUTH` only sets the password on first volume initialization.
- Safe production fix: rotate to alphanumeric-only password and apply via `ALTER CURRENT USER SET PASSWORD` through the bolt TCP proxy.
- Production refresh should avoid `deploy-data.sh load --reset`; use the safe staged ingest flow instead.

#### `neo4j_hybrid_search`
- Retrieval stack combines:
  - vector embeddings per document-type group
  - chunk embeddings
  - keyword fulltext search over `Section.title` and `Section.content_text`
  - concept graph matches gated by `query_text`
- Fusion uses Reciprocal Rank Fusion with `RRF_K = 60`.
- Important rules:
  - `ensure_vector_index` requires `section_embeddings`, `chunk_embeddings`, and `section_fulltext`
  - results are deduplicated by `section_id`
  - concept matches use `CONCEPT_MATCH_SCORE = 0.70`
- `voyage_4_embedding_migration_on_railway_production.md` records a non-destructive Railway migration with push `b739229`, `/healthz` verification, and rollback via `voyage-law-2`.

#### `neo4j_write_read_consistency`
- `CorpusGraphWriter` uses managed transactions and MERGE-based idempotent writes.
- Incremental cleanup workflow:
  - merge document → write sections → delete stale sections → clear changed embeddings → merge relationships.
- Unchanged sections retain embeddings/chunks.
- Relationship paths are split by edge type, including `merge_reference_edges`, `merge_amendments`, `merge_supersessions`, and `merge_concept_links`.

### Cross-cutting synthesis
- Multiple synthesis entries tie graph writes, retrieval payload shaping, and evaluation together under one contract:
  - normalize outputs
  - filter null rows after `OPTIONAL MATCH`
  - validate against Zod-compatible schemas
  - only then trust results
- Drill-down entries emphasize that this guardrail applies from graph mutation through QA.

## 4) Retrieval, crawling, and staged candidate selection

### `packages/_index.md`
- Broad structural theme: retrieval quality depends on **staging**, not naive global top-k.
- Common pattern across crawler, policy corpus, retrieval quality, and evaluation:
  - overscan first
  - filter by intent or document type
  - dedupe by stable identity (`sectionId` / `section_id`)
  - rerank or fuse at the end

### Important child areas
- `crawler/_index.md`
  - Node 26 crawl fetcher hardening with private undici dispatcher and redirect interceptor.
  - Preserves per-domain serialization, rate limiting, retry/backoff, and file streaming.
  - Avoids global dispatcher mutation from `cheerio` imports.
- `policy_corpus/_index.md`
  - Full policy-corpus retrieval pipeline:
    - backend/fulltext collection
    - amendment-title expansion
    - document expansion
    - change-notice expansion
    - final rerank
  - `mergeMax` keeps the best hit per `sectionId`.
  - `computeDocumentCoverageBoosts()` runs twice: pre- and post-expansion.
- `retrieval_quality/_index.md` and related synthesis entries
  - Reinforce that `queryNodes(k)` is global top-k, so systems compensate with per-group overscan.
- `frame/_index.md`
  - Frame assembly moved from score-field driven to positional selection.
  - Setting-preferred routing documents are authoritative unless sibling variant frames take precedence.
- `document_selection/_index.md`
  - Care-setting narrowing occurs before `narrowInferredCoverageDocuments`.
- `coverage_routing/_index.md`
  - If a query names a care setting, matching documents are preferred.
- `rerank_scoring/_index.md`
  - `rerankRetrievalHit` decomposed into ordered `HitScorer` functions; scorer order and floating-point behavior matter.
- `staged-retrieval-is-the-project-s-shared-retrieval-contract.md` and related synthesis entries
  - Staged retrieval is the project’s shared contract across search, frame assembly, and evaluation.

### `packages_pipeline/_index.md`
- Captures retrieval/parsing knowledge in the same staged framework.
- Key topics:
  - `retrieval_fixes/_index.md`
  - `crawler_cli_and_package_docs.md`
  - `crawler_sync_behavior/_index.md`
  - `ssa_parser_subsection_splitting_fix.md`
- Important architectural rules:
  - `queryNodes(k)` alone is insufficient.
  - Overscan and `sectionId` deduplication are required for coverage.
  - SSA parser changes preserve stable section identities through ingest and embedding.

### `search_tooling/_index.md`
- Hybrid policy search uses:
  - Voyage embeddings
  - per-type-group vector search
  - concept graph matching
  - reciprocal rank fusion
  - Neo4j indexes
- Drill down into `hybrid_policy_search_tool.md` for `searchSections` flow and rules.

## 5) Deep research workflow and corrections

### `deep_research_workflow/_index.md`
- Documents the Mastra vNext deep research pipeline and later fixes.
- Canonical workflow:
  - plan → plan-approval → research → synthesize → verify
- Key implementation facts:
  - `agent.generate(...)` returns `FullOutput` with `.object`, `.text`, and `.toolResults`
  - `createStep` receives `{ inputData, resumeData, suspend, writer, mastra, bail }`
  - `writer.write(data)` must be awaited
  - suspend payloads are keyed by step ID
  - model type export must be `ReturnType<ReturnType<typeof createOpenAI>>`
- Fixes/hardening:
  - worker guard via `onIterationComplete`
  - `WORKER_MAX_STEPS` increased from 12 to 16
  - deterministic `validateAnswerUrls` grounding replaces chat-tuned verification
  - `decline()` sets cancelled immediately
  - `sourceLabel(SourceEntry)` converts corpus evidence into human-readable labels

### Related surfaces
- `packages/agent/src/deep-research/workflow.ts`
- `packages/agent/src/deep-research/agents.ts`
- `packages/agent/src/deep-research/config.ts`
- `packages/agent/src/deep-research/schemas.ts`
- `packages/agent/src/model.ts`
- `packages/web/src/lib/use-deep-research.ts`

## 6) Frontend UI reliability and runtime identity

### `frontend_ui/_index.md`
- Main theme: chat correctness depends on stable runtime identity, careful scroll/layout containment, and persistence/citation fidelity across reloads and auth transitions.
- Major subtopics:
  - `chat_page_review_fixes/_index.md`
  - `chat_page_scroll_stability/_index.md`
  - `chat_page_thread_cache/_index.md`
  - `chat_page_transport/_index.md`
  - `chat_streaming_error_handling/_index.md`
  - `design_system/_index.md`
  - `live_testing/_index.md`
  - `message_feedback/_index.md`
  - `message_persistence_cache/_index.md`
  - `message_persistence_parsing/_index.md`
  - `proxy_handling/_index.md`
  - `scroll_area_sidebar_stability/_index.md`
  - `thread_sidebar/_index.md`
- Shared invariant: runtime identity is the coordination boundary for chat transport, thread cache, memory loading, and auth-sensitive operations.

### High-value child entries
- `authenticated_chat_transport_reinitialization.md`
  - `useChat` ID expands from `threadId` to `threadId:resourceId`.
  - `DefaultChatTransport` is memoized on `threadId`, `resourceId`, and `getAccessToken`.
- `chat_page_thread_cache_restoration.md`
  - Uses `messageCache` keyed by `threadId`.
  - Delays restoration until the new `useChat` instance mounts.
- `authenticated_thread_operations.md`
  - Adds `runWithFreshAuth(tokens, op)` to refresh tokens on 401 and retry once.
  - `ThreadSidebar` routes list/load/delete/rename/duplicate/export through fresh-auth execution.
- `chat_page_scroll_stability.md`
  - Uses `viewport.scrollTo`, `min-h-0`, and `preventScroll: true`.
- `ai_sdk_v6_sse_streaming_and_error_handling.md`
  - SSE streaming path uses `AISdkStreamBuilder`, not `MastraStreamBuilder`.
- `document_of_record_design_language.md`
  - Fonts: Fraunces, Newsreader, IBM Plex Mono.
  - Themes: parchment light, library-at-night dark.
  - Paper-grain overlay must remain under portaled overlays and sidebar/backdrop layers.
- `message_feedback_flow.md`
  - Feedback spans LibSQL persistence, API routes, web helpers, optimistic UI, and chat page integration.
- `message_persistence_parsing.md`
  - `convertThreadMessageToUIMessage` preserves structured `parts` from `MastraMessageContentV2`.
- `quiet_citation_styling_in_messagelist.md`
  - Mapped citations render quietly; superscript citation button remains the primary affordance.
- `web_theme_persistence.md`
  - Theme is cookie-first for first paint; WorkOS metadata is secondary for sync/backfill.
- `thread_sidebar_fetch_resilience.md`
  - Uses `AbortController`, suppresses 401s while `useMastraReady` is false, and recreates the client when access tokens change.

### Testing and validation
- `live_testing_without_the_workos_wall.md`
  - Safe validation paths:
    - `/preview` component gallery
    - Playwright `design` project with mocked Mastra API and screenshots
  - Production must not gain an env-gated auth bypass.

## 7) Evaluation, QA, and trust as a chain

### `evaluation/_index.md`
- Central evaluation domain for Level 2 cross-reference resolution and Level 3 answer-quality scoring.
- Shared structure:
  - golden entries → agent execution → Neo4j evidence lookup → judgment/scoring → metrics
- Answer-quality evaluation:
  - implemented in `packages/pipeline/src/pipeline/eval/levels/answer.py`
  - `_invoke_agent` uses HTTP first, CLI fallback second
  - answer extraction comes from text after `---ANSWER---`
  - timeouts are 180 seconds
  - judge failures yield `None`, agent failures yield zero plus explanation
- A/B finding:
  - `voyage-4-large` vs `voyage-law-2` was effectively a wash; the bottleneck appears structural, not just embedding choice.
- Cross-reference resolution:
  - `REFERENCES_DOCUMENT` and `AMENDS` are checked before section-level `REFERENCES`
  - remaining failures are attributed to missing extraction coverage.

### `qa/_index.md`
- QA covers Playwright test infrastructure for the UI, while surrounding synthesis entries define the larger trust chain.
- Playwright structure:
  - mocked suite: 15s timeouts
  - smoke suite: 120s timeouts
  - helpers include `stream-builder.ts`, `mock-routes.ts`, and `ChatPage`
- Trust-chain principle:
  - retrieval surfaces evidence
  - verification rejects or rewrites unsupported claims
  - evaluation scores only grounded output

### `hallucination_verifier/_index.md` and related synthesis
- Final-answer-only verifier:
  - runs only when `finishReason` is `stop`
  - requires no pending tool calls
  - requires text to be present
- If verification fails, output is rewritten via `writer.custom` rather than retried.
- CLI output is machine-parsed using fixed markers:
  - `---EVIDENCE---`
  - `---VERIFIER---`
  - `---ANSWER---`
- Verifier schema includes:
  - `supported`
  - `relevant`
  - `unsupportedClaims`
  - `relevanceIssues`
  - `correctedAnswer`

### Evaluation pipeline structure
- `evaluation_pipeline/_index.md`
  - Level 3 answer scoring and Level 2 cross-reference resolution are tightly linked.
  - Uses Neo4j evidence retrieval, answer-level scoring, and relationship validation.
- Cross-cutting synthesis entries assert that **trust is enforced as an end-to-end chain, not a single score**.

## 8) Curation workflow and durable knowledge handling

### `facts/_index.md`
- Captures the curation guardrails and curated snippet workflow.
- Core pattern:
  - recon → extraction → curate apply
  - prefer UPSERT
  - verify via `result.summary.failed` and `result.applied[].filePath`
- `conventions/_index.md`
  - RLM workflow rules, single-pass handling, chunked extraction via `mapExtract`, and strict preservation requirements.
- `project/_index.md`
  - canonical `rawConcept` / `narrative` structure
  - required task + operational detail + narrative field
  - temporal retention and facts extraction
  - avoid vague or nested contexts

### Shared rules
- Preserve exact rule text, regex patterns, timestamps, enumerated items, and authorship.
- Durable notes must be separated from raw snippets.
- Facts should be curated into structured domains such as `facts/personal`, `facts/project`, and `facts/conventions` when they do not belong to a specific domain.

## 9) Amendment detection and document graph updates

### `amendment_detection/_index.md`
- Graph-based DHHS amendment detection for Medicaid documentation.
- Main flow:
  - scan documents for amendment-relevant sources
  - detect change notices and revised SPAs
  - extract MA/SPA references and sentence-level context
  - create batched `AMENDS` edges in Neo4j
  - update origin documents to `status="amendment"`
- Key helpers:
  - `_is_change_notice`
  - `_is_revised_spa`
  - `_is_signal_section`
  - `_is_sentence_boundary`
- Detection patterns:
  - titles like `CHANGE NOTICE FOR MANUAL NO. ...`
  - MA-series policy numbers
  - SPA identifiers
- Important fix:
  - sentence boundary detection was corrected so dotted MA identifiers do not split sentences incorrectly.

## 10) High-level relationships and drill-down map

### Recurring system contracts
- **Runtime boundary correctness** is the shared fix for auth, deployment, chat transport, and database initialization.
- **Staged retrieval** is the shared contract across policy search, graph assembly, crawler behavior, and evaluation.
- **Schema-aware validation** protects graph writes, retrieval payloads, and QA/evaluation inputs.
- **Trust is enforced end-to-end**: evidence retrieval → verification/rewrite → scoring.
- **Runtime identity** coordinates chat state, thread cache, auth, memory, and transport reinitialization.

### Best drill-down order
- For curation and durable memory: `context/_index.md`, `facts/_index.md`
- For runtime/auth/deploy issues: `auth_integration/_index.md`, `runtime_boundary_fixes/_index.md`
- For Neo4j operations: `database_operations/_index.md`
- For retrieval architecture: `packages/_index.md`, `packages_pipeline/_index.md`, `search_tooling/_index.md`
- For deep research: `deep_research_workflow/_index.md`
- For chat UI reliability: `frontend_ui/_index.md`
- For evaluation and QA: `evaluation/_index.md`, `qa/_index.md`
- For amendment graph detection: `amendment_detection/_index.md`