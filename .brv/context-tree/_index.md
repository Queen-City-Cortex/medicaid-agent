---
children_hash: 94dedc379768f7bf8a48ca354d58b10a1d8e7a023ecd8ff8d990c75c84efff62
compression_ratio: 0.19284802043422733
condensation_order: 3
covers: [agent_architecture/_index.md, amendment_detection/_index.md, auth_integration/_index.md, database_operations/_index.md, evaluation/_index.md, facts/_index.md, frontend_ui/_index.md, packages/_index.md, packages_pipeline/_index.md, qa/_index.md]
covers_token_total: 16443
summary_level: d3
token_count: 3171
type: summary
---
# Structural Summary: d3

This set of entries describes the project’s core reliability contract across architecture, retrieval, evaluation, QA, and operational setup: **preserve runtime correctness, stage retrieval instead of trusting naive top-k, and verify grounded output before it is trusted**. The child entries repeatedly reinforce the same pattern: detailed implementation knowledge is organized into drill-down topics, while higher-level summaries preserve the architectural decisions, fixed rules, and cross-domain relationships.

## 1) Agent architecture, runtime boundaries, and operational guardrails

### `agent_architecture/_index.md`
- Central architecture layer for the NC Medicaid Navigator, covering amendment interpretation, durable context curation, server configuration, local development setup, Neo4j tool validation, search tooling, and deep research workflow.
- Recurring principle: **context and runtime state must be handled deliberately**, with durable knowledge captured in structured topics rather than left in chat memory.
- Key drill-down topics:
  - `amendment_pipeline_and_prompt/_index.md` → amendment detection and prompt guardrails
  - `context.md` / `context/_index.md` → curation workflow and durable operational knowledge
  - `local_dev_setup/_index.md` → repository setup, CI gates, and env consolidation
  - `mastra_server_configuration/_index.md` → long-running SSE / timeout tuning
  - `navigate_tools/_index.md` → `getAmendments` OPTIONAL MATCH behavior
  - `nc_medicaid_agent/_index.md` → agent startup, CLI runner, storage, and citation fixes
  - `neo4j_tool_output_validation/_index.md` → schema-valid read-tool output
  - `packages_pipeline/_index.md` → retrieval/parsing pipeline behavior
  - `search_tooling/_index.md` → hybrid policy search stack
- Important architectural decision: long-running research needs a **10-minute Mastra server timeout** to support SSE workflows exceeding 180 seconds.

### `auth_integration/_index.md`
- Shared architectural rule: **do not trust build-time values for runtime-only identity and origin data**.
- Core fix pattern:
  - resolve callback origin dynamically at runtime
  - keep env ownership centralized
  - treat runtime transport/auth state as mutable and re-resolved
- Key relationships:
  - `auth-and-deployment-fixes-are-driven-by-runtime-environment-boundaries.md` → callback origin resolution flow
  - `workos_authkit_nextjs/_index.md` → computed `baseURL` for `handleAuth`
  - `runtime-boundary-correctness-is-the-shared-fix-for-auth-chat-transport-and-datab.md` → auth-aware chat transport identity
  - `runtime-boundary-bugs-cluster-around-deployment-auth-and-database-initialization.md` → shared runtime-boundary failure class
- Shared conclusion: public callback origins, app transport identity, and database auth behavior all depend on **live runtime context**, not static defaults.

### `database_operations/_index.md`
- Operational database knowledge for Neo4j deployments, auth handling, incremental writes, and retrieval consistency.
- Strong emphasis on **environment-sensitive Neo4j operations** plus **schema-aware validation**.
- Core clusters:
  - `neo4j_auth/_index.md` → Railway password handling, `NEO4J_AUTH`, production refresh flow
  - `neo4j_hybrid_search/_index.md` → hybrid retrieval stack and embedding migration
  - `neo4j_write_read_consistency/_index.md` → managed writes, cleanup, and rerun safety
- Key facts:
  - Railway URL-decodes env vars, so `+` may become a space and corrupt passwords.
  - `NEO4J_AUTH` only applies on first volume initialization.
  - Safe remediation is rotating to an alphanumeric password via live password change.
- Cross-cutting synthesis entries tie graph writes, retrieval, and QA together through a common rule: **normalize, filter, validate, then trust**.

### `amendment_detection/_index.md`
- Graph-based DHHS amendment detection for Medicaid documentation.
- Core flow:
  - scan documents
  - detect change notices / revised SPAs
  - extract MA/SPA references and surrounding sentence context
  - write batched `AMENDS` relationships into Neo4j
  - mark source documents as `status="amendment"`
- Important behavior:
  - sentence boundary detection avoids splitting inside MA-series identifiers
  - signal sections are preferred over fallback bodies
  - `(source, target)` change descriptions are deduplicated before merge
- Drill-down: `pipeline_detection/_index.md` and `amendment_detection_pipeline.md`

## 2) Agent runtime, CLI, storage, and startup hardening

### `nc_medicaid_agent/_index.md`
- Consolidates the main agent implementation and hardening notes.
- Main topics:
  - `startup_and_web_ui_hardening.md` → startup checks, Mastra config, UI constraints
  - `cli_runner.md` → iteration behavior, memory payloads, cleanup, thread naming
  - `libsql_storage_fix_for_railway.md` → LibSQL replacement for DuckDB/MastraCompositeStore
  - `ssa_and_cfr_reference_resolution_fixes.md` → citation and parser resolution fixes
  - `nc_medicaid_navigator_agent.md` → prompt and metadata guidance
- Key decisions:
  - LibSQL is the durable persistence backend used to avoid Alpine/musl DuckDB crashes.
  - CLI iteration must preserve memory, avoid unsafe retries, and shut down cleanly.
  - Citation correctness depends on SSA/CFR reference resolution fixes and metadata guidance.

### `runtime_boundary_bugs_cluster_around_deploy_auth_and_database_initialization.md`
- Recurrent failure mode across auth, deployment, chat transport, and Neo4j initialization:
  - build-time assumptions used where runtime state is required
  - callback origin resolution must happen live
  - database auth differs between first initialization and existing volumes
- This cluster reinforces the same project-wide rule: **runtime boundaries are a correctness boundary**.

## 3) Local development, CI, and environment ownership

### `local_dev_setup/_index.md`
- Repository-level operational guidance for bringing up and validating the local environment.
- Main child topics:
  - `local_development_setup.md`
  - `ci_workflow_concurrency_and_test_gates.md`
  - `env_consolidation/_index.md`
  - `repository_doc_audit_findings.md`
- Key decisions:
  - CI is split into a main `test` job and a parallel `docker-build` job.
  - Branch/PR jobs may be canceled, but main runs must remain active because Railway deploys are commit-specific.
  - The root `.env` is the single source of truth; package env files are symlinked.
- `env_consolidation/_index.md` preserves the rule that package env files must stay synchronized with the root env, removing prior circular symlink behavior.
- `repository_doc_audit_findings.md` records documentation audit results and corrections, including stale README content and theme persistence behavior.

## 4) Retrieval, parsing, crawler, and policy-corpus pipeline

### `packages_pipeline/_index.md`
- Structural overview of retrieval and parsing knowledge.
- Major topic split:
  - `retrieval_fixes/_index.md` → retrieval collector and finalization behavior
  - `crawler_cli_and_package_docs.md` → crawler CLI and package documentation conventions
  - `crawler_sync_behavior/_index.md` → sync lifecycle and lazy filename tracking
  - `ssa_parser_subsection_splitting_fix.md` → stable SSA subsection identities
- Core architecture:
  - retrieval is **staged**, not one-shot
  - `queryNodes(k)` is global top-k and therefore insufficient alone
  - overscan per group, dedupe by `sectionId`, and rerank/fuse at the end
- The crawler layer preserves runtime semantics while making fetch behavior safe under Node 26.
- `search_tooling/_index.md` documents the hybrid policy search stack using Voyage embeddings, concept graph matching, reciprocal rank fusion, and Neo4j indexes.

### `packages_pipeline/retrieval_fixes/_index.md`
- Focuses on `collectHybridHitMap` and `finalizeHybridHits`.
- Locked-in behavior:
  - stage-1 backends merge into a section map
  - fulltext recovery adds `FULLTEXT_BOOST`
  - merge-max semantics determine winner per `sectionId`
  - final ranking truncates by `topK` when reranking is absent
- The test suite preserves deterministic collection/ranking behavior and clearly separates injected backends from the fulltext stage.

### `packages/_index.md`
- Broad contract across crawler, retrieval quality, policy corpus, and evaluation:
  - **overscan / isolate / filter / dedupe / rerank / verify**
- Key subdomains:
  - `crawler/_index.md` → undici redirect interceptor fix and Node 26 hardening
  - `retrieval_quality/_index.md` → staged retrieval with vector overscan and RRF
  - `policy_corpus/_index.md` → staged retrieval, coverage boosts, reranker gates, and scoring
  - `pipeline/_index.md` → CLI package split and A/B evaluation harness
- Important policy-corpus rules:
  - `mergeMax` keeps the best hit per `sectionId`
  - `computeDocumentCoverageBoosts()` is intentionally called twice
  - reranking is gated and fail-open unless conditions justify it
  - selection and narrowing must respect ordering constraints
- Evaluation results in this family show that retrieval quality is structural, not solely model-dependent.

## 5) Evaluation, QA, and trust enforcement

### `evaluation/_index.md`
- Central evaluation domain for answer-quality scoring and cross-reference resolution.
- Shared pipeline:
  - golden entries → agent execution → Neo4j evidence lookup → judgment/scoring → aggregation
- Main topics:
  - `answer_quality/_index.md`
  - `cross_reference_resolution/_index.md`
  - `pipeline_overview/_index.md`
- Key answer-quality facts:
  - implemented in `packages/pipeline/src/pipeline/eval/levels/answer.py`
  - agent invocation is HTTP-first with CLI fallback
  - answer extraction reads content after `---ANSWER---`
  - failures are handled distinctly: judge failures become `None`, agent failures become `0`
- Cross-reference resolution validates `REFERENCES_DOCUMENT`, `AMENDS`, `HAS_SECTION`, and `REFERENCES` relationships.
- The embedded embedding comparison showed `voyage-4-large` was effectively a wash versus `voyage-law-2`, suggesting the bottleneck is structural rather than model choice.

### `qa/_index.md`
- QA domain for Playwright E2E infrastructure and the broader trust chain.
- Core scope:
  - mocked and smoke Playwright suites
  - Mastra streaming and memory API mocks
  - chat and thread-sidebar page objects
- The trust pipeline is consistent across QA, evaluation, and hallucination verification:
  - retrieve evidence
  - verify or rewrite unsupported output
  - score only grounded answers
- Drill-down:
  - `playwright_e2e/_index.md`
  - `hallucination_verifier/_index.md`
  - `evaluation_pipeline/_index.md`
  - `launch_blockers/_index.md`

### `frontend_ui/_index.md`
- Chat UI stability depends on **runtime identity alignment** across transport, cache, parsing, and sidebar operations.
- Main clusters:
  - chat page layout and scroll stability
  - thread cache restoration and auth retries
  - streaming and error handling
  - design system and proxy/auth handling
- Key architectural decisions:
  - `useChat` identity expands from `threadId` to `threadId:resourceId`
  - `DefaultChatTransport` must be memoized on auth-sensitive inputs
  - thread cache restoration must wait for a fresh `useChat` instance
  - theme persistence is cookie-first, with WorkOS used for sync/backfill
- Design system topic preserves the Document of Record editorial language, including typography, paper-grain presentation, and `data-testid` stability.

## 6) Shared theme across domains

Across the entries, the same structural rules recur:
- **Runtime correctness beats build-time assumptions**
- **Staged retrieval beats naive global top-k**
- **Ordering and gating rules are contractual**
- **Validation must happen before trust**
- **Durable knowledge should be curated into structured drill-down topics**

### Best drill-down entry names by theme
- Runtime boundaries and auth: `auth-and-deployment-fixes-are-driven-by-runtime-environment-boundaries.md`, `workos_authkit_nextjs/_index.md`
- Agent and CLI hardening: `nc_medicaid_agent/_index.md`, `startup_and_web_ui_hardening.md`, `cli_runner.md`
- Retrieval and ranking: `retrieval_fixes/_index.md`, `retrieval_quality/_index.md`, `hybrid_policy_search_tool.md`
- Policy corpus structure: `policy_corpus/_index.md`, `coverage_frame_assembly/_index.md`, `reranker_gate_logic_and_a_b_evaluation.md`
- Evaluation and QA trust chain: `evaluation/_index.md`, `qa/_index.md`, `hallucination_verifier/_index.md`, `evaluation_pipeline/_index.md`
- Frontend runtime identity: `chat_page_thread_cache/_index.md`, `chat_page_transport/_index.md`, `thread_sidebar/_index.md`, `proxy_handling/_index.md`