---
children_hash: 31fb5a5ce899b6877f5b9003b409ef485ca8528a231264f7fd77293446cdb3b3
compression_ratio: 0.27716972406351165
condensation_order: 3
covers: [agent_architecture/_index.md, amendment_detection/_index.md, auth_integration/_index.md, database_operations/_index.md, evaluation/_index.md, facts/_index.md, frontend_ui/_index.md, packages/_index.md, qa/_index.md]
covers_token_total: 12974
summary_level: d3
token_count: 3596
type: summary
---
# Level d3 Structural Summary

## Cross-cluster architectural pattern
These entries collectively describe a system built around **runtime correctness, staged retrieval, durable curation, and end-to-end trust enforcement**. The recurring design choice is to avoid single-step assumptions: instead, the system resolves runtime state dynamically, retrieves broadly and filters/reranks later, and validates outputs before they are treated as authoritative.

## 1) Agent architecture and operational knowledge
**Entry:** `agent_architecture/_index.md`

- This cluster covers the NC Medicaid Navigator’s core architecture: amendment interpretation, local dev setup, Mastra server tuning, navigation tools, agent runtime hardening, Neo4j validation, retrieval pipeline behavior, and hybrid search.
- Dominant theme: **runtime-boundary correctness**. Fixes repeatedly address failures caused by treating build-time config as if it were runtime state.
- Key subareas:
  - `context/` — durable curation workflow and knowledge preservation
  - `amendment_pipeline_and_prompt/` — amendment graph interpretation and guardrails
  - `local_dev_setup/` — env consolidation, CI gates, and local runtime setup
  - `mastra_server_configuration/` — timeout tuning for long-running workflows
  - `navigate_tools/` — amendment retrieval behavior for `getAmendments`
  - `nc_medicaid_agent/` — agent runtime, storage, citation, and CLI hardening
  - `neo4j_tool_output_validation/` — payload validation and structured query normalization
  - `packages_pipeline/` — retrieval backend, crawl sync, SSA parsing fixes
  - `search_tooling/` — hybrid policy search and ranking fusion
- Shared architectural pattern: **runtime and deployment boundaries matter**. Auth callback resolution, Neo4j initialization, and local env consistency are all treated as runtime concerns, not static ones.
- Retrieval-related work in this cluster consistently emphasizes **overscan, dedupe, and rerank/fuse** rather than trusting naive top-k search.
- Drill-down priority: `context/`, `amendment_pipeline_and_prompt/`, `local_dev_setup/`, `nc_medicaid_agent/`, `packages_pipeline/`, `search_tooling/`.

## 2) Amendment detection pipeline
**Entry:** `amendment_detection/_index.md`

- Domain purpose: detect DHHS amendment relationships in Medicaid documents, extract surrounding context, and write `AMENDS` edges into Neo4j.
- Primary implementation: `packages/pipeline/src/pipeline/references/amendments.py` via `detect_amendments()`.
- Core flow:
  1. scan documents for amendment-relevant sources
  2. detect change notices and revised SPAs
  3. extract MA/SPA references and sentence context
  4. create batched `AMENDS` edges
  5. update originating docs to `status="amendment"`
- Important behaviors:
  - helper predicates such as `_is_change_notice`, `_is_revised_spa`, `_is_signal_section`, `_is_sentence_boundary`
  - batching via `GRAPH_BATCH_SIZE` and graph session/query helpers
  - sentence splitting was fixed so periods inside MA-style identifiers do not break context
  - `_extract_context` preserves full sentences even with dotted identifiers like `MA-2180.IV.I`
  - `change_description` entries are deduplicated per `(source, target)` before `MERGE_AMENDS_BATCH`
  - signal sections are preferred over fallback body content
- Detection patterns:
  - change notices like `CHANGE NOTICE FOR MANUAL NO. ...`
  - MA-series policy numbers via `((?:MA|DMA|DHB|DSS)-\d+)`
  - SPA identifiers via `SPA\s+(\d+[\s\-]+\d+)`

## 3) Auth integration and runtime boundary fixes
**Entry:** `auth_integration/_index.md`

- This cluster centers on auth/deployment reliability problems caused by mixing build-time and runtime assumptions.
- Core issue: **public vs internal runtime resolution**. Auth callbacks must use a stable public origin rather than internal hosts like `0.0.0.0`.
- Resolution order for callback origin:
  1. `NEXT_PUBLIC_WORKOS_REDIRECT_URI`
  2. `WORKOS_REDIRECT_URI`
  3. `RAILWAY_PUBLIC_DOMAIN`
- The WorkOS AuthKit flow uses an explicit `baseURL` override in `handleAuth` to keep redirects public-facing.
- `workos_authkit_nextjs/_index.md` is the drill-down for the callback fix in `packages/web/src/app/auth/callback/route.ts`.
- Configuration ownership is centralized:
  - root `.env` is the source of truth
  - app/package env files are symlinked to it
- Database-state boundary:
  - `NEO4J_AUTH` only initializes credentials on first volume setup
  - existing Neo4j instances require live password changes via bolt proxy
- Reusable pattern: **resolve public values at runtime, centralize config, and treat initialization state separately from live state**.

## 4) Database operations and Neo4j reliability
**Entry:** `database_operations/_index.md`

- This domain covers Neo4j deployments, auth handling, graph refresh workflows, and schema-aware validation safeguards.
- Main clusters:
  - `neo4j_auth/` — Railway-specific auth behavior and safe production refresh path
  - `neo4j_hybrid_search/` — hybrid retrieval design and remote reload workflow
  - `neo4j_write_read_consistency/` — incremental write cleanup and consistency boundaries
- `neo4j_auth/` key points:
  - Railway URL-decodes env vars, so `+` can become a space and corrupt passwords
  - safe remediation is rotating to an alphanumeric-only password and applying it with `ALTER CURRENT USER SET PASSWORD` via bolt TCP proxy
  - `NEO4J_AUTH` only applies on first initialization
  - the Railway TCP proxy is central to both auth remediation and production refresh
- `neo4j_hybrid_search/` key points:
  - hybrid retrieval combines vector, chunk, concept-graph, and keyword/fulltext signals
  - indexing uses `ensure_vector_index`, `section_fulltext`, per document-type grouping, dedupe by `section_id`, and `_rrf_fuse` with `RRF_K = 60`
  - `deploy_data_script_and_refresh_workflow.md` documents destructive reload via `scripts/deploy-data.sh` and requires `NEO4J_HOST`, Railway auth, Railway CLI login, and an enabled TCP proxy
- `neo4j_write_read_consistency/` centers on `CorpusGraphWriter` as the write-side boundary:
  - merge document
  - write sections
  - delete stale sections
  - clear changed embeddings
  - merge relationships
- Relationship handling is split into reference edges, amendment edges, supersessions, and concept links.
- Cross-cutting rule: **normalize and validate first, then trust downstream**. This appears across graph writes, retrieval, and evaluation.

## 5) Evaluation pipeline
**Entry:** `evaluation/_index.md`

- Central evaluation domain for answer quality and cross-reference resolution.
- Shared pattern: golden entries drive agent execution, then Neo4j evidence retrieval, then scoring or relationship validation.
- Core topics:
  - `answer_quality/` — level 3 answer scoring
  - `cross_reference_resolution/` — level 2 graph relationship validation
  - `pipeline_overview/` — shared module boundaries and failure modes
- Answer-quality flow:
  - golden entries
  - `_invoke_agent` via HTTP with CLI fallback
  - fetch primary/supporting evidence from Neo4j
  - `judge_answer`
  - build metrics
- Important behavior:
  - answer extraction happens after `---ANSWER---`
  - judge failures produce `None` scores and are excluded
  - agent failures produce zero scores and an error explanation
  - timeouts occur after 180 seconds
  - `primary_hit` is true when overall score is at least 2
- A/B finding:
  - `voyage-law-2` vs `voyage-4-large` showed a small MRR gain but no meaningful overall improvement
  - conclusion: the bottleneck is structural, not model choice
- Cross-reference resolution:
  - validates `REFERENCES_DOCUMENT`, `AMENDS`, `HAS_SECTION`, and `REFERENCES`
  - tracks resolved vs missed references
  - remaining failures were attributed to missing extraction coverage
- Drill-down map: `answer_quality/_index.md`, `cross_reference_resolution/_index.md`, `pipeline_overview/_index.md`.

## 6) Facts and curation guidance
**Entry:** `facts/_index.md`

- This is project-level curation guidance rather than domain facts.
- The knowledge model is two-part:
  - `rawConcept` for essential metadata and traceable structure
  - `narrative` for descriptive structure, dependencies, highlights, and rules
- Curated entries should include:
  - a clear `task`
  - at least one of `changes`, `files`, or `flow`
  - at least one narrative field
- Canonical workflow:
  - recon
  - extract facts/context
  - curate with `UPSERT`
  - verify applied file paths
- Preservation rules:
  - keep exact rule text
  - preserve regex patterns
  - preserve timestamps and source references
- Facts should be stored durably, with standalone `facts/` domains for uncategorized personal, project, or convention knowledge.
- Key entities: `ByteRover context engineer`, `rawConcept`, `narrative`, `changes`, `files`, `flow`.

## 7) Frontend UI chat stability and feedback
**Entry:** `frontend_ui/_index.md`

- This cluster documents the chat page as a tightly coupled system of UI, transport, persistence, and feedback behaviors.
- Main recurring pattern: **runtime identity**. `threadId`, auth-derived `resourceId`, and token readiness determine when transport, memory, cache restoration, and sidebar fetching must refresh.
- Core subareas:
  - `chat_page_review_fixes/` — page component boundaries and UI hardening
  - `chat_page_scroll_stability/` — viewport-safe scrolling during streaming and thread switching
  - `chat_page_thread_cache/` — per-thread cache restoration
  - `chat_page_transport/` — auth-bound transport reinitialization
  - `chat_streaming_error_handling/` — SSE streaming and error behavior
  - `message_feedback/` — feedback persistence, API routing, and UI integration
  - `message_persistence_cache/` — cache race fix for async persistence
  - `message_persistence_parsing/` — reconstruct persisted messages into UI payloads
  - `proxy_handling/` — Next.js 16 proxy migration for AuthKit
  - `scroll_area_sidebar_stability/` — sidebar scroll fix
  - `thread_sidebar/` — sidebar fetch resilience and auth retry
- Major architectural decisions:
  - keep `viewport.scrollTo` instead of `scrollIntoView`
  - add `min-h-0` to scroll containers for flex correctness
  - memoize transport on `threadId`, `resourceId`, and token getter
  - use `threadId:resourceId` as chat identity
  - buffer cache restores via `pendingRestore` to avoid stale-instance writes
  - use a temporary cache to bridge async persistence timing gaps
- Streaming/error behavior:
  - AI SDK v6 SSE builder emits the full lifecycle
  - mock routes centralize chat and memory endpoints
  - reruns reuse original user text
  - failure state shows a destructive error alert
- Feedback flow:
  - `FeedbackRepository` in `packages/agent/src/feedback/repository.ts`
  - `/feedback` routes via `registerApiRoute`
  - web client helpers in `packages/web/src/lib/feedback-client.ts`
  - UI integration through `MessageActions.tsx` and `chat/page.tsx`
- Proxy/auth routing:
  - Next.js 16 `proxy.ts` replaces middleware
  - named `proxy` forwards to `authkitProxy`
  - matcher excludes static assets and metadata routes

## 8) Packages and staged retrieval
**Entry:** `packages/_index.md`

- This cluster explains staged retrieval as a shared architectural pattern across packages, database operations, agent architecture, and QA.
- Canonical retrieval sequence:
  1. overscan broadly
  2. filter by intent/type/coverage
  3. dedupe by stable identity
  4. rerank/fuse/verify
- Core principles:
  - single global top-k is insufficient
  - stable deduplication by `sectionId` / `section_id` is required
  - reranking and fusion happen after broad candidate collection
- Policy-corpus stack:
  - `pipeline/_index.md` — A/B harness, embeddings, reranker, verifier gates, `EVAL_REGRESSION_THRESHOLD = 0.05`
  - `policy_corpus/_index.md` — coverage routing, authoritative documents, primary/supporting/avoid evidence buckets
  - `retrieval_quality/_index.md` — query intent, vector overscan, topical filtering, group-specific ranking, RRF merge, decontamination rules
- The repeated system-level conclusion: correctness comes from **broad candidate collection plus staged narrowing**, not from a single top-k pass.

## 9) QA trust chain
**Entry:** `qa/_index.md`

- This domain covers Playwright testing for the Medicaid navigator agent UI and the broader trust chain from retrieval to final scoring.
- Core test infrastructure:
  - `context.md` defines scope and ownership for QA/Automation
  - `playwright_e2e/_index.md` describes mocked vs smoke execution, shared helpers, and test architecture
- Hallucination verification:
  - verification runs only on final answers
  - tool-scoped evidence collection
  - failure handling is rewrite-based
  - stable stdout markers: `---EVIDENCE---`, `---VERIFIER---`, `---ANSWER---`
- Evaluation and cross-reference fidelity:
  - answer scoring in `packages/pipeline/src/pipeline/eval/levels/answer.py`
  - cross-reference validation in `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`
  - unresolved dataset failures were attributed to reference extraction, not scoring logic
- The domain’s central principle: **trust is enforced as a chain, not a single score**:
  - retrieve correct evidence
  - verify or rewrite unsupported claims
  - score only grounded outputs

## Cross-cluster relationships
- **Runtime-boundary theme** links `agent_architecture`, `auth_integration`, `database_operations`, and `frontend_ui`.
- **Staged retrieval theme** links `agent_architecture`, `packages`, `database_operations`, `evaluation`, and `qa`.
- **Trust and validation theme** links `evaluation`, `qa`, and graph/retrieval safeguards in `database_operations`.
- **Durable curation theme** links `agent_architecture/context` and `facts` via the same knowledge-preservation workflow.

## Drill-down priorities
- For operational curation and durable context: `agent_architecture/context/`
- For amendment interpretation: `agent_architecture/amendment_pipeline_and_prompt/`
- For auth/runtime boundary fixes: `auth_integration/`
- For Neo4j auth, refresh, and hybrid search: `database_operations/`
- For evaluation and answer quality: `evaluation/`
- For curated knowledge model and facts handling: `facts/`
- For chat UI identity, transport, and persistence: `frontend_ui/`
- For staged retrieval architecture: `packages/`
- For QA trust, verifier behavior, and Playwright flows: `qa/`