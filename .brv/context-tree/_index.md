---
children_hash: ef04257cbf8fe9870877729677fd1ddcf539fdd2f302e51e89e2d72887f27120
compression_ratio: 0.2041737586028269
condensation_order: 3
covers: [agent_architecture/_index.md, amendment_detection/_index.md, auth_integration/_index.md, database_operations/_index.md, evaluation/_index.md, facts/_index.md, frontend_ui/_index.md, packages/_index.md, qa/_index.md]
covers_token_total: 13513
summary_level: d3
token_count: 2759
type: summary
---
# Level D3 Structural Summary

## Overall pattern
These entries describe a system organized around **runtime correctness, staged retrieval, schema-aware validation, and end-to-end trust**. Across architecture, database operations, frontend UI, retrieval, evaluation, and QA, the same design rule repeats: **do not trust static assumptions; resolve state at runtime, validate structure before use, and preserve grounded evidence through every layer**.

## 1) Architecture and runtime boundary correctness
### `agent_architecture/_index.md`
- Broad architectural cluster for NC Medicaid Navigator covering curation, amendment interpretation, local setup, agent runtime, Neo4j output validation, retrieval pipeline, and search tooling.
- Dominant theme: **runtime-boundary correctness** and durable knowledge curation.
- Key subareas:
  - `context/` — single-pass curation workflow, recon/extract/UPSERT/verify pattern, durable operational knowledge
  - `amendment_pipeline_and_prompt/` — amendment graph interpretation and prompt guardrails
  - `local_dev_setup/` — root `.env` as source of truth, CI concurrency/test gates
  - `nc_medicaid_agent/` — startup hardening, CLI runner behavior, LibSQL storage fix, SSA/CFR resolution, citation rules
  - `packages_pipeline/` and `search_tooling/` — retrieval stability, overscan, ranking, SSA parsing
- Cross-cutting insight: many fixes arise from treating runtime state as if it were build-time config.

### `auth_integration/_index.md`
- Shared pattern across auth, chat transport, and database state: **runtime values must be resolved live, not inferred from build-time or initialization-time assumptions**.
- Important decisions:
  - callback origin must be computed dynamically
  - root `.env` remains authoritative; package envs mirror it
  - `NEO4J_AUTH` only applies on first volume initialization
  - `DefaultChatTransport` and `useChat` identity must reinitialize when auth/runtime identity changes
- Related drill-downs:
  - `auth-and-deployment-fixes-are-driven-by-runtime-environment-boundaries.md`
  - `environment-boundaries-drive-both-deployment-fixes-and-auth-reliability.md`
  - `runtime-boundaries-are-the-root-cause-behind-auth-and-deployment-reliability.md`
  - `runtime-boundary-correctness-is-the-shared-fix-for-auth-chat-transport-and-datab...md`
  - `workos_authkit_nextjs/_index.md`

## 2) Database operations and schema-aware safety
### `database_operations/_index.md`
- Domain covers Neo4j auth, hybrid search, and write/read consistency.
- Main emphasis: **safe production procedures** and **schema-aware guards** that prevent malformed graph data from breaking retrieval and evaluation.
- Important subdomains:
  - `neo4j_auth/` — Railway password decoding issues, first-init vs existing-volume auth semantics, safe production refresh
  - `neo4j_hybrid_search/` — vector/fulltext/concept fusion with Reciprocal Rank Fusion
  - `neo4j_write_read_consistency/` — managed transactions, idempotent MERGE-based writes, incremental cleanup
- Key operational decisions:
  - `NEO4J_AUTH` does not update existing DBs
  - safe refresh avoids destructive `load --reset`
  - hybrid retrieval uses dedup by `section_id`, required indexes, and fixed concept score thresholds
  - incremental ingest preserves unchanged embeddings/chunks

### Cross-cutting schema validation theme
- The listed synthesis entries reinforce one rule: **normalize and validate graph outputs before any downstream use**.
- Shared behaviors:
  - filter null rows after `OPTIONAL MATCH`
  - Zod-compatible validation
  - guard Cypher execution and relationship checks
  - use validated Neo4j evidence for evaluation and QA
- This is the domain’s primary safety net from writes to evaluation.

## 3) Frontend UI: chat identity, persistence, scrolling, and testing
### `frontend_ui/_index.md`
- Captures the production chat shell and safe developer testing workflows.
- Recurring pattern: **thread- and auth-aware UI state**.
- Important subtopics:
  - `chat_page_review_fixes/` — production `/chat` refinement, component splitting, `ResearchTrace`, `DefaultChatTransport`
  - `chat_page_transport/` — `useChat` identity expands to `threadId:resourceId`; transport memoized on auth/runtime identity
  - `chat_page_scroll_stability/` and `scroll_area_sidebar_stability/` — scroll confined to viewport, sidebar remains visible
  - `chat_page_thread_cache/` and `message_persistence_cache/` — cache restoration after `setThreadId`, thread-specific restore flow
  - `message_persistence_parsing/` — reconstruct persisted messages into UI messages, normalize tool states
  - `message_feedback/` — feedback persistence/API/UI contract
  - `chat_streaming_error_handling/` — SSE payloads, error-state handling, input limits
  - `live_testing/` — safe testing paths without the WorkOS wall
  - `proxy_handling/` — Next.js 16 proxy/Authkit migration
- Core design decisions:
  - identity coupling drives transport, memory, and restoration
  - production-safe boundaries avoid auth bypasses in proxy
  - persistence-first UX restores cache before fallback loads

### Relationships
- `chat_page_transport` is tightly linked to thread cache restoration and auth state.
- `message_persistence_cache` resolves race conditions between UI restore and async persistence.
- `scroll_area_sidebar_stability` explains the root cause behind sidebar displacement and the viewport-scoped fix.
- `live_testing` pairs with production UI fixes to validate safely.

## 4) Retrieval, pipeline hardening, and staged ranking
### `packages/_index.md`
- Groups retrieval, evaluation, and crawler hardening.
- Dominant engineering strategy: **staged retrieval instead of single-pass top-k**, plus controlled validation for model or infrastructure changes.
- Main themes:
  - overscan first, then filter, dedupe, and rerank
  - isolate runtime state
  - preserve behavioral compatibility during refactors
  - validate changes in controlled environments

### Key subareas
- **Policy Corpus Retrieval and Frame Assembly**:
  - intent-sensitive document routing
  - setting preference before narrowing
  - primary/supporting/avoid evidence organization
  - hybrid retrieval with document expansion, amendment expansion, and final rerank
- **Retrieval Quality / Staged Ranking**:
  - per-group overscan
  - decontamination
  - stable ranking and coverage selection
- **A/B Evaluation Harness and CLI Split**:
  - `pipeline.cli` package split preserved backward compatibility
  - gated comparisons for embeddings/reranker/verifier
  - regression threshold enforcement
- **Crawler Fetching**:
  - private undici dispatcher
  - Node 26 compatibility
  - preserve rate limiting, serialization, retry/backoff, and streaming

### Shared retrieval rule
- Retrieval quality depends on **decontamination plus staged ranking**, not raw rank scores alone.
- `queryNodes(k)` global top-k is insufficient; overscan and rerank are required for coverage.

## 5) Amendment detection
### `amendment_detection/_index.md`
- Focuses on graph-based DHHS amendment detection in Medicaid documentation.
- Purpose: identify change notices and revised SPAs, extract surrounding context, and write `AMENDS` relationships in Neo4j.
- Core flow:
  - scan documents
  - detect change notices / revised SPAs
  - extract MA/SPA references and sentence context
  - create batched `AMENDS` edges
  - update source documents to `status="amendment"`
- Important fixes and behaviors:
  - sentence boundary handling avoids splitting on dotted MA identifiers
  - `_extract_context` preserves full sentences
  - `change_description` deduplicated per `(source, target)`
  - signal sections preferred over fallback bodies
- Drill-down: `pipeline_detection/_index.md`, `amendment_detection_pipeline.md`

## 6) Evaluation and QA as a trust chain
### `evaluation/_index.md`
- Central evaluation domain for Level 2 cross-reference resolution and Level 3 answer-quality scoring.
- Shared pipeline:
  - golden entries → agent execution → Neo4j evidence → scoring/judgment → metrics
- Key topics:
  - `answer_quality/` — HTTP-first invocation with CLI fallback, evidence retrieval, `judge_answer`, A/B embeddings comparison
  - `cross_reference_resolution/` — graph relationship validation for document/section linkage
  - `pipeline_overview/` — module boundaries, dependencies, failure modes
- Important findings:
  - `voyage-4-large` vs `voyage-law-2` was effectively a wash
  - bottleneck appears structural rather than embedding-model selection
  - cross-reference improvements remain tied to extraction coverage gaps

### `qa/_index.md`
- QA domain ties together Playwright E2E, hallucination verification, and evaluation trust guarantees.
- Core principle: **trust is enforced as a chain**:
  1. retrieve evidence
  2. verify or rewrite unsupported claims
  3. score only grounded results
- Main areas:
  - `playwright_e2e/` — mocked vs smoke suites, `mockMastraAPI`, `ChatPage`
  - `hallucination_verifier/` — final-answer-only verification, evidence builders, rewrite-based failure handling
  - `evaluation_pipeline/` — answer scoring and cross-reference validation
- June 11–12, 2026 remediation thread highlights:
  - decontamination
  - SSA ingestion rules
  - citation fidelity
  - paraphrase rebaseline metrics
  - staged P0–P3 remediation roadmap

## 7) Project facts and durable curation
### `facts/_index.md`
- Stores durable project facts and curation rules.
- Core workflow:
  - recon → extract salient facts/context → UPSERT → verify applied files and failures
- Structural requirements:
  - clear `task`
  - at least one of `changes`, `files`, or `flow`
  - at least one narrative field
- Preserves exact timestamps, rules, regex patterns, and other high-value details for recall.
- Captured facts include named helper functions such as:
  - `scoreCoverageSections(...)`
  - `collectCoverageSectionGroups(...)`
  - `buildCoverageAnchors(...)`
  - `assembleCoverageSections(...)`
  - `selectCoveragePrimarySections(...)`
- Deduplication uses `uniqueBy(section.id)`.

## Cross-cluster relationships
- **Runtime boundaries** link `agent_architecture`, `auth_integration`, `frontend_ui`, and `database_operations`.
- **Schema-aware validation** links `database_operations`, `evaluation`, and `qa`.
- **Staged retrieval** links `packages`, `evaluation`, and `qa`.
- **Durable curation** in `facts` and `agent_architecture/context` underpins the entire knowledge system.
- **Trust enforcement** in `qa` depends on the same Neo4j-backed evidence and retrieval correctness described in `database_operations` and `packages`.

## Best drill-down path
1. `agent_architecture/context/` and `facts/` for durable curation and operational knowledge
2. `auth_integration/` and `frontend_ui/` for runtime identity and transport/state coherence
3. `database_operations/` and `packages/` for Neo4j safety and staged retrieval
4. `amendment_detection/` for amendment-graph extraction and `AMENDS` writes
5. `evaluation/` and `qa/` for scoring, verification, and end-to-end trust guarantees