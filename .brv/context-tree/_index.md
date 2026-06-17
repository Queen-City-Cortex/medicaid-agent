---
children_hash: aa3abeb05ea147d63d541e05417782adcb3f50ad965cba43056343f477c6c0ec
compression_ratio: 0.18165316950572466
condensation_order: 3
covers: [agent_architecture/_index.md, amendment_detection/_index.md, auth_integration/_index.md, database_operations/_index.md, evaluation/_index.md, facts/_index.md, frontend_ui/_index.md, packages/_index.md, qa/_index.md]
covers_token_total: 14324
summary_level: d3
token_count: 2602
type: summary
---
# Level d3 Structural Summary

This cluster compresses the project’s main operational systems into a few recurring architectural patterns: **runtime-boundary correctness**, **staged retrieval and validation**, **end-to-end trust/citation chains**, and **durable curation of operational knowledge**. The child entries below should be used for drill-down when specific implementation details are needed.

## 1) Agent architecture and runtime hardening
**Primary entries:** `agent_architecture/_index.md`, `auth_integration/_index.md`, `database_operations/_index.md`

This area captures the NC Medicaid Navigator’s core runtime, deployment, auth, and database reliability rules.

- **Runtime boundaries are a central design constraint**
  - Multiple fixes avoid treating build-time values as live runtime state.
  - Auth, deployment, and database issues are repeatedly traced to the same boundary mistakes: public vs internal origin, `.env` ownership, and initialization-time vs persistent database state.
  - Key drill-downs:
    - `runtime-boundary-bugs-cluster-around-deploy-auth-and-database-initialization.md`
    - `auth-and-deployment-fixes-are-driven-by-runtime-environment-boundaries.md`
    - `runtime-boundaries-are-the-root-cause-behind-auth-and-deployment-reliability.md`

- **Auth integration depends on runtime-resolved public origins**
  - Callback handling uses a runtime-resolved public base URL rather than internal hostnames.
  - WorkOS AuthKit and Next.js proxy/callback handling are treated as a coordinated boundary problem.
  - Drill down:
    - `auth_integration/workos_authkit_nextjs/callback_base_url_resolution.md`
    - `proxy_handling/_index.md` in the frontend cluster

- **Database operations emphasize safe, environment-sensitive Neo4j handling**
  - Neo4j auth, refresh, and production migration behaviors are constrained by Railway and volume initialization rules.
  - Hybrid search uses multiple signals and RRF-style fusion, while write consistency is protected by a single write boundary and transaction-safe incremental ingest.
  - Drill down:
    - `neo4j_auth/_index.md`
    - `neo4j_hybrid_search/_index.md`
    - `neo4j_write_read_consistency/_index.md`

- **Shared pattern: schema-aware validation**
  - Across graph writes, search, and evaluation, uncertain output is normalized and validated before use.
  - Common behaviors include optional-match null filtering, schema validation, and careful relationship handling.

## 2) Retrieval, crawling, and staged ranking
**Primary entries:** `packages/_index.md`, `amendment_detection/_index.md`, `agent_architecture/packages_pipeline/*`, `search_tooling/*`

This cluster is organized around a common retrieval principle: **do not trust raw top-k results; overscan, filter, deduplicate, and rerank**.

- **Crawler hardening**
  - Redirect handling was isolated into a private undici dispatcher to avoid global state conflicts.
  - The crawler preserves per-domain serialization, rate limiting, retries, and streaming behavior.
  - Drill down: `crawler/_index.md` → `fetching/_index.md`

- **Policy corpus and graph-frame assembly use staged retrieval**
  - Retrieval flows collect broadly, filter by intent/type, deduplicate by stable IDs, and then rerank or assemble the final response.
  - Important components:
    - coverage routing
    - document selection
    - frame assembly
    - A/B evaluation harness
    - decontamination rules
  - Drill down: `policy_corpus/_index.md`, `pipeline/_index.md`, `retrieval_quality/_index.md`

- **Hybrid policy search combines multiple retrieval signals**
  - `searchSections` and related flows merge embeddings, chunk signals, concept graph matches, and fulltext hits.
  - Reciprocal Rank Fusion is used for final merging.
  - Drill down: `search_tooling/hybrid_policy_search_tool.md`

- **Amendment detection is graph-based and context-sensitive**
  - The pipeline detects change notices and revised SPAs, extracts sentence-level context, and writes `AMENDS` relationships.
  - It prefers signal sections, deduplicates change descriptions per source/target pair, and preserves MA-series references without sentence-splitting errors.
  - Drill down: `amendment_detection/pipeline_detection/amendment_detection_pipeline.md`

## 3) Frontend UI chat stability and feedback
**Primary entries:** `frontend_ui/_index.md`

The chat UI cluster centers on preserving **runtime identity** across transport, memory, cache restoration, and sidebar behavior.

- **Identity is the unifying boundary**
  - `threadId`, auth-derived `resourceId`, and access-token readiness determine when chat transport and memory must refresh.
  - The same identity boundary must remain aligned across:
    - auth transitions
    - chat transport reinitialization
    - thread cache restore
    - sidebar fetches
    - message persistence
  - Drill down:
    - `chat_page_transport/_index.md`
    - `chat_page_thread_cache/_index.md`
    - `runtime-identity-must-stay-aligned-across-auth-chat-transport-and-memory.md`

- **Layout stability is handled explicitly**
  - Scroll behavior is constrained so the sidebar remains visible during streaming and thread switching.
  - `viewport.scrollTo` is preferred over `scrollIntoView`, and `min-h-0` / overflow choices are treated as structural layout decisions.
  - Drill down:
    - `chat_page_scroll_stability/_index.md`
    - `scroll_area_sidebar_stability/_index.md`

- **Message persistence is durable but race-prone**
  - A short-lived cache bridges async persistence timing gaps.
  - Message parsing reconstructs persisted payloads into `UIMessage` form, preferring structured Mastra formats and normalizing older tool-state shapes.
  - Drill down:
    - `message_persistence_cache/_index.md`
    - `message_persistence_parsing/_index.md`

- **Chat error handling and test behavior are deterministic**
  - Streaming tests use AI SDK v6 SSE builders and a shared mock API.
  - Error behavior is intentionally visible and destructive on failure rather than silently retrying.
  - Drill down:
    - `chat_streaming_error_handling/_index.md`

- **Feedback is end-to-end**
  - Feedback persistence, API routing, client helpers, and UI integration are modeled together.
  - Validation and ownership are explicit: `up/down` ratings, unique `(message_id, resource_id)`, authenticated resource resolution.
  - Drill down: `message_feedback/_index.md`

- **Proxy/auth migration is a framework compatibility boundary**
  - Next.js 16 migration moves auth handling from middleware to `proxy.ts`.
  - Drill down: `proxy_handling/_index.md`

## 4) Evaluation, QA, and trust enforcement
**Primary entries:** `evaluation/_index.md`, `qa/_index.md`, `agent_architecture/` evaluation-related entries

This cluster makes trust measurable through a layered evaluation and verification pipeline.

- **Evaluation is split into two major layers**
  - **Answer quality**: golden entry → agent invocation → Neo4j evidence → judge/scoring → metrics
  - **Cross-reference resolution**: graph relationship validation for document/section links
  - Drill down:
    - `answer_quality/_index.md`
    - `cross_reference_resolution/_index.md`
    - `pipeline_overview/_index.md`

- **Playwright QA tests are split by execution mode**
  - Mocked tests are fast, deterministic, and helper-driven.
  - Smoke tests exercise live backend and Neo4j paths.
  - Shared helpers encapsulate stream building, mock routes, and chat page operations.
  - Drill down: `playwright_e2e/_index.md`

- **Hallucination verification is final-answer only**
  - Evidence gathering is tool-scoped.
  - Verification only runs when the answer is complete and tool calls are settled.
  - Failure handling is rewrite-based, not retry-based.
  - Stable stdout markers are part of the contract.
  - Drill down: `hallucination_verifier/_index.md`

- **Trust is enforced as a chain**
  - Retrieval → evidence → verifier behavior → rewrite/scoring.
  - The system explicitly avoids relying on a single score or a single guardrail.
  - Drill down:
    - `qa-trust-is-enforced-as-a-chain-not-a-single-score.md`
    - `end-to-end-citation-fidelity-is-enforced-from-retrieval-to-evaluation.md`

## 5) Durable curation and project-level knowledge handling
**Primary entries:** `facts/_index.md`, `agent_architecture/context/*`

This area records the rules for turning transient work into durable, structured knowledge.

- **Two-part context model**
  - `rawConcept` stores the essential traceable footprint.
  - `narrative` stores structure, dependencies, highlights, rules, and examples.
  - Content is organized as **domain → topic → subtopic**.

- **Canonical curation workflow**
  - `recon -> extract facts and context -> curate with UPSERT -> verify applied files`
  - UPSERT is preferred for create/update handling.
  - Preserve exact rule text, regex patterns, timestamps, and source references.

- **Facts are first-class durable knowledge**
  - Personal, project, and convention facts can be stored in standalone `facts/` domains when they do not belong to a broader topic.
  - Drill down:
    - `facts/project/curated_context_snippet.md`
    - `agent_architecture/context/curated_operational_knowledge.md`
    - `agent_architecture/context/curated_context_extraction_notes.md`

## Cross-cluster relationships

- **Runtime boundaries connect auth, frontend transport, and database behavior**
  - The same class of bug appears when config, identity, or initialization state is assumed to be static.

- **Staged retrieval connects crawler, policy corpus, search, and evaluation**
  - Broad collection, filtering, stable deduplication, reranking, and guarded verification repeat across the stack.

- **Trust is enforced from retrieval to final answer**
  - QA, evaluation, and hallucination verification form a single chain of correctness rather than isolated checks.

- **Operational knowledge is curated for reuse**
  - Context notes are preserved as durable, structured summaries rather than chat-only memory.

## Drill-down priorities

- Runtime/auth/database hardening: `agent_architecture/`, `auth_integration/`, `database_operations/`
- Retrieval and ranking: `packages/`, `agent_architecture/packages_pipeline/`, `search_tooling/`, `amendment_detection/`
- Chat UI reliability: `frontend_ui/`
- Verification and scoring: `evaluation/`, `qa/`
- Durable knowledge management: `facts/`, `agent_architecture/context/`