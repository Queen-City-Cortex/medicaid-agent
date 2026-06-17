---
children_hash: a461d1c60df2f3580ab665c5546c9d2febbd46f20b5119bc33de0e1d9245b6de
compression_ratio: 0.1713746278411154
condensation_order: 3
covers: [agent_architecture/_index.md, amendment_detection/_index.md, auth_integration/_index.md, database_operations/_index.md, evaluation/_index.md, facts/_index.md, frontend_ui/_index.md, packages/_index.md, qa/_index.md]
covers_token_total: 13771
summary_level: d3
token_count: 2360
type: summary
---
# Level d3 Structural Summary

This cluster spans the repo’s major operational systems: architecture/runtime hardening, auth and deployment boundaries, database operations, frontend UI state coordination, retrieval/pipeline design, evaluation, QA, and durable fact curation. Across domains, the dominant pattern is **staged, runtime-correct, evidence-preserving behavior** rather than build-time assumptions or single-pass shortcuts.

## Cross-cluster themes

### Runtime boundaries are the root cause of many failures
Several domains converge on the same fix pattern: resolve values at runtime, not at build/init time.
- **`auth_integration/_index.md`**: public origin resolution, WorkOS/AuthKit callback handling, and explicit `baseURL` overrides.
- **`frontend_ui/_index.md`**: auth-derived `resourceId`, `threadId:resourceId` identity, and transport reinitialization.
- **`database_operations/_index.md`**: Neo4j credential initialization vs live password changes on existing volumes.
- **`agent_architecture/_index.md`**: deploy/auth/database initialization bugs cluster around runtime-boundary correctness.

### Staged retrieval and validation dominate the knowledge base
Search, ingestion, and evaluation consistently use overscan/filter/dedup/rerank rather than trusting one global pass.
- **`packages/_index.md`**: staged retrieval, intent-aware routing, decontamination, and A/B gating.
- **`database_operations/_index.md`**: hybrid Neo4j retrieval, embedding migration, write/read consistency, and schema-aware validation.
- **`evaluation/_index.md`** and **`qa/_index.md`**: answer scoring and cross-reference validation depend on retrieved Neo4j evidence, not standalone text matching.

### Trust is enforced as a chain, not a single check
Evidence must be retrieved, preserved, verified/rewritten, and only then scored.
- **`qa/_index.md`**: Playwright e2e, hallucination verifier, evaluation pipeline, and trust-chain synthesis entries.
- **`evaluation/_index.md`**: golden entries, agent invocation, Neo4j evidence fetch, judgment, and metrics.
- **`agent_architecture/_index.md`**: citation rules, anti-hallucination constraints, and prompt guardrails.

## Domain summaries

### `agent_architecture/`
Core architecture and operational knowledge for the NC Medicaid Navigator agent stack.
- Major subareas:
  - **`context/`** — single-pass curation workflow, recon/extraction/UPSERT verification, and durable operational knowledge.
  - **`amendment_pipeline_and_prompt/`** — amendment interpretation and guardrails.
  - **`local_dev_setup/`** — env consolidation, local runtime, and CI gates.
  - **`nc_medicaid_agent/`** — agent runtime, CLI behavior, storage fixes, citation rules.
  - **`packages_pipeline/`** — retrieval backend behavior, crawl sync, SSA parsing.
  - **`search_tooling/`** — hybrid policy search and ranking.
- Strong shared theme: keep knowledge and runtime behavior aligned with live state and durable curation.

### `amendment_detection/`
Graph-based DHHS amendment detection for Medicaid documents.
- Focuses on:
  - scanning for change notices and revised SPAs
  - extracting surrounding sentence context
  - writing `AMENDS` relationships into Neo4j
- Important behaviors:
  - helper predicates like `_is_change_notice`, `_is_revised_spa`, `_is_signal_section`
  - sentence boundary fixes so dotted MA identifiers do not split incorrectly
  - deduped `change_description` per `(source, target)`
  - signal sections preferred over fallback bodies

### `auth_integration/`
Runtime-boundary auth and deployment reliability.
- Core fix pattern:
  - resolve a stable public origin at runtime
  - pass it into `handleAuth`
  - keep config centralized in root `.env`
- Key resolution order for callback origin:
  1. `NEXT_PUBLIC_WORKOS_REDIRECT_URI`
  2. `WORKOS_REDIRECT_URI`
  3. `RAILWAY_PUBLIC_DOMAIN`
- Also covers Next.js 16 `proxy.ts` migration and the separation between public runtime values and internal/container hosts.

### `database_operations/`
Operational database knowledge for Neo4j auth, hybrid search, and consistency.
- **`neo4j_auth/`** — Railway auth behavior, safe production refresh path, bolt proxy usage, and `NEO4J_AUTH` first-volume limitation.
- **`neo4j_hybrid_search/`** — vector + fulltext + concept-graph retrieval, reciprocal rank fusion, required indexes, and voyage-4 migration.
- **`neo4j_write_read_consistency/`** — managed write boundaries, incremental cleanup, transient retry, and incremental ingest lessons.
- Cross-cutting safety rule: schema-aware validation and normalization must happen before graph output is trusted.

### `evaluation/`
Central evaluation domain for answer quality and cross-reference resolution.
- **`answer_quality/`** — Level 3 scoring flow: golden entries → agent invocation → Neo4j evidence → `judge_answer` → metrics.
- **`cross_reference_resolution/`** — Level 2 graph relationship validation over `REFERENCES_DOCUMENT`, `AMENDS`, and section-level `REFERENCES`.
- **`pipeline_overview/`** — shared module/dependency and failure-mode overview.
- Key finding: the strongest bottleneck is often structural retrieval/citation behavior, not just embedding choice.

### `facts/`
Durable project facts curation.
- Current content is centered on **`project/curated_context_snippet.md`**.
- Preserves a compact curation model:
  - `rawConcept` for operational metadata
  - `narrative` for descriptive structure
  - prefer UPSERT
  - preserve exact rule text, regex, and timestamps
- Functions as a record of how compact context snippets become durable knowledge.

### `frontend_ui/`
Chat page, streaming, persistence, auth transport, and sidebar coordination.
- Main coupled systems:
  - auth state
  - thread identity
  - streaming transport
  - message persistence
  - sidebar layout
- Key topics:
  - **`chat_page_review_fixes/`** — page refactor, layout, trace rendering, accessibility polish.
  - **`chat_page_scroll_stability/`** and **`scroll_area_sidebar_stability/`** — viewport scrolling without displacing the sidebar.
  - **`chat_page_thread_cache/`** and **`message_persistence_cache/`** — thread restore, cache timing, `pendingRestore`, and short-lived per-thread caches.
  - **`chat_page_transport/`** — `threadId:resourceId` identity and transport recreation.
  - **`chat_streaming_error_handling/`** — SSE flow, mocked AI SDK streams, and UI error handling.
  - **`message_feedback/`** — feedback persistence, API routing, and optimistic UI integration.
  - **`message_persistence_parsing/`** — structured message reloads and tool state normalization.
  - **`proxy_handling/`** and **`thread_sidebar/`** — auth boundary handling and resilient thread fetching.
- Core principle: runtime identity must stay aligned across auth, transport, memory, and thread switching.

### `packages/`
Retrieval, curation, and evaluation patterns across crawler, pipeline, policy corpus, and retrieval quality.
- Dominant pattern: **staged retrieval with overscan, filtering, deduplication, and reranking/fusion**.
- Important subareas:
  - crawler fetcher hardening with private undici dispatcher and redirect interceptors
  - policy corpus routing and frame assembly
  - evaluation harness gating for embeddings/reranker/verifier
  - retrieval quality improvements based on decontamination and staged ranking
- Central design idea: intent-aware candidate collection beats naive global top-k.

### `qa/`
Playwright testing, hallucination verification, and trust-chain enforcement.
- **`playwright_e2e/`** — mocked vs smoke suite split, shared helpers, chat-page objects, and streaming/memory test setup.
- **`hallucination_verifier/`** — final-answer-only verification, tool-scoped evidence gathering, stable stdout markers, and rewrite-based failure handling.
- **`evaluation_pipeline/`** — level 2 and level 3 evaluation structure, Neo4j-backed evidence, and cross-reference metrics.
- Synthesis entries emphasize that reliable output is produced by a chain:
  1. retrieve evidence
  2. verify or rewrite against evidence
  3. score only grounded answers

## Notable cross-domain relationships

- **`agent_architecture/` ↔ `facts/`**: both preserve durable context, but `agent_architecture` focuses on operational/runtime knowledge while `facts` captures compact curation guidance.
- **`auth_integration/` ↔ `frontend_ui/`**: auth callback resolution and proxy behavior feed directly into chat transport and thread sidebar identity.
- **`database_operations/` ↔ `packages/` ↔ `evaluation/`**: ingestion/retrieval integrity, ranking quality, and evaluation correctness are tightly coupled.
- **`qa/` ↔ `evaluation/`**: QA verifies trust end-to-end; evaluation measures it with golden entries and graph-backed evidence.
- **`amendment_detection/` ↔ `agent_architecture/amendment_pipeline_and_prompt/`**: both center on amendment interpretation, but one is graph-detection implementation and the other is prompt/guardrail context.

## Drill-down priorities by intent
- Operational curation and durable context: **`agent_architecture/context/`**, **`facts/project/`**
- Auth/runtime boundary bugs: **`auth_integration/`**, **`frontend_ui/chat_page_transport`**
- Neo4j safety and retrieval: **`database_operations/neo4j_hybrid_search`**, **`neo4j_write_read_consistency`**
- Evaluation and trust scoring: **`evaluation/`**, **`qa/`**
- Retrieval pipeline and ranking: **`packages/`**
- Amendment detection behavior: **`amendment_detection/`**