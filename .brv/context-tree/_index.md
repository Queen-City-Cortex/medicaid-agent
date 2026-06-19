---
children_hash: 5e9c57cd8cf5c637568b3af697e25cba19cec4c69036112fd9f2fc5333a08252
compression_ratio: 0.21841937087268337
condensation_order: 3
covers: [agent_architecture/_index.md, amendment_detection/_index.md, auth_integration/_index.md, database_operations/_index.md, evaluation/_index.md, facts/_index.md, frontend_ui/_index.md, packages/_index.md, qa/_index.md]
covers_token_total: 14083
summary_level: d3
token_count: 3076
type: summary
---
# Level d3 Structural Summary

This cluster spans the project’s core reliability layers: architecture/runtime hardening, database and retrieval safety, frontend chat coherence, retrieval/evaluation pipelines, and QA trust enforcement. Across the entries, the recurring design principle is **boundary correctness**: resolve live runtime state at the point of use, preserve durable structured knowledge, and validate outputs before they propagate.

## Major domains and what they cover

### `agent_architecture/`
Architecture and operational knowledge for the NC Medicaid Navigator stack.
- **`context/`**: durable curation workflow, single-pass extraction, UPSERT-based updates, verification of applied paths, and preserved operational knowledge.
- **`amendment_pipeline_and_prompt/`**: amendment-graph interpretation, prompt guardrails, and authoritative policy-change extraction.
- **`local_dev_setup/`**: local runtime setup, `.env` consolidation, and CI gate alignment.
- **`mastra_server_configuration/`**: server timeout tuning for long-running SSE / research workflows.
- **`navigate_tools/`**: `getAmendments` retrieval behavior, using `OPTIONAL MATCH` and null-row filtering.
- **`nc_medicaid_agent/`**: CLI runner behavior, startup hardening, citation rules, LibSQL storage switch for Railway, and SSA/CFR resolution fixes.
- **`neo4j_tool_output_validation/`**: structured read-output validation, including numeric normalization and schema-safe payload shaping.
- **`packages_pipeline/`**: crawl sync, retrieval fixes, and SSA subsection splitting correctness.
- **`search_tooling/`**: hybrid policy search ranking and retrieval signal fusion.
- Cluster-wide theme: runtime boundary failures often come from treating static config as live state.

### `amendment_detection/`
Graph-based DHHS amendment detection.
- Primary flow: scan docs → detect change notices/revised SPAs → extract references and context → write batched `AMENDS` edges → mark source docs as amendment status.
- Key behaviors:
  - `_is_change_notice`, `_is_revised_spa`, `_is_signal_section`, `_is_sentence_boundary`
  - sentence boundary logic preserves MA-series identifiers like `MA-2180.IV.I`
  - `change_description` deduplicated per `(source, target)` before batch merge
  - signal sections preferred over fallback bodies
- Drill-down targets:
  - `pipeline_detection/_index.md`
  - `amendment_detection_pipeline.md`

### `auth_integration/`
Runtime boundary correctness across auth, deployment, chat transport, and database state.
- Shared rule: public origins, callbacks, credentials, and chat identity must be resolved from runtime context, not build-time assumptions.
- `auth-and-deployment-fixes-are-driven-by-runtime-environment-boundaries.md`:
  - dynamic WorkOS callback origin resolution
  - env fallback order for deployments
  - Next.js middleware → `proxy.ts` migration
  - root `.env` as source of truth
- `environment-boundaries-drive-both-deployment-fixes-and-auth-reliability.md`:
  - auth and Neo4j issues share the same boundary-confusion root cause
- `runtime-boundaries-are-the-root-cause-behind-auth-and-deployment-reliability.md`:
  - `NEO4J_AUTH` only applies on first initialization
  - root `.env` remains canonical
- `runtime-boundary-correctness-is-the-shared-fix-for-auth-chat-transport-and-datab...md`:
  - extends runtime identity into chat transport
  - `threadId:resourceId` governs `useChat` reinitialization
  - `DefaultChatTransport` memoized on `threadId`, `resourceId`, `getAccessToken`
- Drill-down: `workos_authkit_nextjs/_index.md`

### `database_operations/`
Operational knowledge for Neo4j auth, hybrid search, and write/read consistency.
- `context.md` defines scope around connection/auth issues, password rotation, deployment quirks, and configuration guidance.
- `neo4j_auth/`:
  - Railway password handling can break via URL decoding (`+` → space)
  - safe fix: alphanumeric password, `ALTER CURRENT USER SET PASSWORD`
  - production refresh should be targeted and non-destructive, not `load --reset`
- `neo4j_hybrid_search/`:
  - retrieval stack combines vector, chunk, concept, and keyword fulltext signals via Reciprocal Rank Fusion
  - required indexes: `section_embeddings`, `chunk_embeddings`, `section_fulltext`
  - dedupe by `section_id`; concept matching requires `query_text`; concept threshold `0.70`
  - production migration to `voyage-4` was done non-destructively on Railway
- `neo4j_write_read_consistency/`:
  - `CorpusGraphWriter` uses managed transactions via `session.execute_write(work_fn)`
  - per-method `_work(tx)` closures provide commit/rollback/retry semantics
  - incremental cleanup preserves unchanged embeddings, deletes stale sections, and removes embeddings/chunks only for changed sections
- Cross-cutting synthesis entries emphasize **schema-aware validation** as the safety net from writes through evaluation.

### `evaluation/`
Central evaluation domain for answer quality and cross-reference resolution.
- **`answer_quality/`**:
  - level-3 answer scoring in `packages/pipeline/src/pipeline/eval/levels/answer.py`
  - flow: golden entries → agent invocation → Neo4j evidence fetch → `judge_answer` → per-question metrics
  - agent invocation is HTTP-first, with CLI fallback
  - timeouts at 180s; failures preserve explanations; judge errors become `None`
  - includes embeddings A/B results comparing `voyage-law-2` and `voyage-4-large`
- **`cross_reference_resolution/`**:
  - level-2 graph relationship validation in `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`
  - checks `REFERENCES_DOCUMENT`, `AMENDS`, `HAS_SECTION`, and `REFERENCES`
  - missing document IDs count as missed references
- **`pipeline_overview/`**:
  - shared evaluation flow and module boundaries
  - remediation thread around decontamination, citation fidelity, and staged fixes
- Shared pattern: measurable correctness is tied to Neo4j-backed evidence, not text-only matching.

### `facts/`
Durable project facts and curation rules.
- `project/` stores reusable operational knowledge extracted from snippets and source material.
- Key model:
  - `rawConcept` + `narrative`
  - preserve exact timestamps, rules, regex patterns, and factual details
  - UPSERT is the default curation mechanism
- Important captured facts include helper functions like `scoreCoverageSections(...)`, `collectCoverageSectionGroups(...)`, `buildCoverageAnchors(...)`, `assembleCoverageSections(...)`, `selectCoveragePrimarySections(...)`, plus deduplication via `uniqueBy(section.id)`.

### `frontend_ui/`
Chat page, streaming, persistence, auth-proxy, and sidebar coordination.
- Core theme: runtime identity drives state reuse/reset via `threadId` plus auth-derived `resourceId`.
- **`chat_page_review_fixes/`**:
  - ChatPage split into `EmptyState`, `MessageList`, `ChatInput`
  - `ResearchTrace` centralizes policy-tool trace/status rendering
  - fixed sidebar, main `ScrollArea`, auth loading skeleton, and accessible refinements
- **`chat_page_scroll_stability/`** and **`scroll_area_sidebar_stability/`**:
  - preserve sidebar visibility by scrolling the viewport, not the layout root
  - `min-h-0` on `ScrollArea`
  - `preventScroll: true` to avoid focus jumps
  - `overflow-clip` on outer container prevents sidebar displacement
- **`chat_page_thread_cache/`** and **`message_persistence_cache/`**:
  - per-thread message cache supports thread switching without stale `useChat` instances
  - `pendingRestore` buffers restored messages until the new instance mounts
  - cache is short-lived and consumed on first use
- **`chat_page_transport/`**:
  - `useChat` identity expands to `threadId:resourceId`
  - `DefaultChatTransport` memoized on `threadId`, `resourceId`, `getAccessToken`
- **`chat_streaming_error_handling/`**:
  - AI SDK v6 SSE payload sequence and mock routing for `/chat` and memory endpoints
  - 10k-character input cap and explicit destructive alert on failure
- **`message_feedback/`**:
  - feedback persistence via `FeedbackRepository`
  - Hono routes for `/feedback` and `/feedback/:id`
  - `UNIQUE(message_id, resource_id)` and `up/down` validation
- **`message_persistence_parsing/`**:
  - converts persisted Mastra messages to `UIMessage`
  - structured parts use `convertV4PartsToV5`; fallback text uses `extractText`
  - tool states normalized for `ResearchTrace`
- **`proxy_handling/`**:
  - Next.js 16 `proxy.ts` replaces middleware for WorkOS Authkit
  - callback path is exempt; static paths excluded
- **`thread_sidebar/`**:
  - fetch resilience during auth initialization
  - `401` is non-fatal until `useMastraReady` is true
  - `mastraClient` recreated when access token changes
- Cross-links: transport, cache, parsing, feedback, and proxy handling form one runtime identity/persistence pipeline.

### `packages/`
Retrieval, evaluation, crawler hardening, and staged ranking.
- The dominant pattern is **staged retrieval**:
  - intent → candidate scoring → vector overscan → topical filtering → group ranking → Reciprocal Rank Fusion
- **`crawler/`**:
  - Node 26-compatible fetcher hardening
  - private undici dispatcher with redirect interceptors
  - preserve per-domain serialization, rate limiting, retry/backoff, and file streaming
- **`pipeline/`**:
  - CLI package split preserved command surface and build compatibility
  - eval A/B gate corrections distinguish embeddings, reranker, and verifier gates
- **`policy_corpus/`**:
  - coverage frame assembly, intent-sensitive routing, and staged retrieval behavior
  - setting-preferred routing before inferred narrowing
  - frame assembly blends base hits, HCWD history, routed docs, and section candidates
- **`retrieval_quality/`**:
  - per-type-group overscan and reranking
  - decontamination plus staged ranking as the quality driver
- Cluster-wide: avoid collapsing retrieval into one-pass global top-k; overscan first, then filter and rerank.

### `qa/`
End-to-end testing, hallucination verification, and trust enforcement.
- Trust is enforced as a **chain**: retrieve evidence → verify/rewrite unsupported claims → score grounded outputs.
- **`playwright_e2e/`**:
  - split mocked vs smoke suites
  - `MastraStreamBuilder`, `mockMastraAPI`, `ChatPage`
  - page must be set up with mocks before visiting `/chat`
- **`hallucination_verifier/`**:
  - final-answer-only verification
  - requires `finishReason === "stop"`, no pending tools, non-empty text
  - evidence sourced from `getSection`, `getDocument`, `getAmendments`, `lookupPolicy`, `followReferences`
  - unsupported outputs are rewritten immediately via `correctedAnswer`
- **`evaluation_pipeline/`**:
  - level-3 answer scoring and level-2 cross-reference resolution
  - same Neo4j evidence backbone as the evaluation domain
  - remaining failures are tied to reference extraction, not the scorer
- **`launch_blockers/`**:
  - supports release readiness and operational constraints around trust enforcement
- Cross-cutting goal: citation fidelity is an end-to-end contract from retrieval through final answer evaluation.

## Shared architectural patterns across the cluster

- **Runtime boundary correctness**: auth, callbacks, database initialization, and chat identity must resolve live state, not build-time assumptions.
- **Durable structured knowledge**: curation preserves facts, rules, timestamps, patterns, and file references in reusable form.
- **Staged retrieval**: overscan, filter, dedupe, and rerank instead of relying on a single global top-k pass.
- **Schema-aware validation**: normalize, validate, and reject malformed graph or answer outputs before downstream use.
- **Trust chains**: evidence retrieval, verification/rewrite, and scoring are linked; correctness is never a single check.

## Drill-down priorities

- For architecture and operational curation: `agent_architecture/`
- For amendment detection and graph changes: `amendment_detection/`
- For auth/runtime boundary issues: `auth_integration/`
- For Neo4j operations and retrieval: `database_operations/`
- For evaluation scoring and cross-reference resolution: `evaluation/`
- For durable facts and curation rules: `facts/`
- For chat UI, persistence, and auth-proxy behavior: `frontend_ui/`
- For retrieval, A/B harnesses, and crawler hardening: `packages/`
- For end-to-end QA and hallucination verification: `qa/`