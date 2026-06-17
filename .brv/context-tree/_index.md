---
children_hash: 283709a4da4bbbfda2b3daf09fd7d8ef532b4939ea36488d4ea70d8b0ffa77ba
compression_ratio: 0.14323144104803492
condensation_order: 3
covers: [agent_architecture/_index.md, amendment_detection/_index.md, auth_integration/_index.md, database_operations/_index.md, evaluation/_index.md, facts/_index.md, frontend_ui/_index.md, packages/_index.md, qa/_index.md]
covers_token_total: 14885
summary_level: d3
token_count: 2132
type: summary
---
# Level d3 Structural Summary

This cluster organizes the Medicaid Navigator knowledge base around a few repeated system boundaries: **runtime correctness**, **retrieval quality**, **graph/database safety**, **UI identity stability**, and **end-to-end trust/citation enforcement**. The child entries are mostly level-d2 summaries, so this overview highlights how their subclusters connect and where to drill down.

## Main structural domains

### `agent_architecture/`
Architecture, curation, local setup, runtime hardening, and retrieval tooling for the core NC Medicaid Navigator agent stack.
- Strongest recurring pattern: **runtime-boundary correctness** — avoid build-time assumptions for auth, DB state, config, and deployment behavior.
- Key subareas:
  - `context/` — durable curation workflow, single-pass recon/extract/UPSERT/verify pattern, and operational knowledge preservation.
  - `amendment_pipeline_and_prompt/` — amendment-graph interpretation and prompt guardrails.
  - `local_dev_setup/` — local runtime + CI contract, env consolidation, and test gates.
  - `nc_medicaid_agent/` — agent startup, CLI behavior, storage fixes, citation rules, and anti-hallucination guardrails.
  - `packages_pipeline/` and `search_tooling/` — retrieval backend stability, SSA parsing, hybrid policy search, ranking, and fusion.
- Drill-down priority: `context/`, `nc_medicaid_agent/`, `packages_pipeline/`, `search_tooling/`.

### `amendment_detection/`
Graph-based amendment detection for DHHS Medicaid documents.
- Core flow: scan documents → detect change notices / revised SPAs → extract contextual sentences and references → write `AMENDS` edges in Neo4j → update originating document status.
- Important behaviors:
  - sentence boundary handling preserves dotted MA identifiers like `MA-2180.IV.I`
  - `change_description` entries deduplicate per `(source, target)`
  - signal sections are preferred over fallback bodies
- Drill-down: `pipeline_detection/_index.md`, `amendment_detection_pipeline.md`.

### `auth_integration/`
Shared auth/deployment reliability pattern centered on runtime resolution of public origins and environment boundaries.
- Main principle: **resolve public-facing values at runtime**, not from build-time assumptions.
- Key issues:
  - WorkOS callback origin must resolve through runtime env precedence, not internal hosts like `0.0.0.0`
  - root `.env` acts as the single source of truth; package envs are symlinked
  - Neo4j credential state differs between first initialization and existing mounted volumes
- Closely related to `frontend_ui/` auth transport and `database_operations/` Neo4j auth handling.

### `database_operations/`
Operational Neo4j knowledge: auth incidents, safe refreshes, write/read consistency, and hybrid search indexing.
- Core clusters:
  - `neo4j_auth/` — Railway password encoding issues, `NEO4J_AUTH` initialization limits, and safe password rotation.
  - `neo4j_hybrid_search/` — hybrid search architecture, RRF fusion, per-group overscan, destructive refresh workflow, and Voyage-4 migration.
  - `neo4j_write_read_consistency/` — incremental cleanup, transaction boundaries, relationship merge paths, and targeted ingest behavior.
- Cross-cutting rule: **schema-aware validation** protects graph writes, retrieval, and evaluation from malformed data.
- Drill-down: `neo4j_auth/`, `neo4j_hybrid_search/`, `neo4j_write_read_consistency/`.

### `evaluation/`
Evaluation pipeline for answer quality and cross-reference resolution.
- Two main tracks:
  - **Answer quality**: invoke agent, gather Neo4j evidence, judge output, aggregate metrics.
  - **Cross-reference resolution**: validate `REFERENCES_DOCUMENT`, `AMENDS`, `HAS_SECTION`, and `REFERENCES`.
- Important shared facts:
  - agent invocation has HTTP-first + CLI fallback behavior
  - timeouts and error normalization are explicit
  - remaining failures are attributed to reference extraction coverage, not scoring logic
- Drill-down: `answer_quality/`, `cross_reference_resolution/`, `pipeline_overview/`.

### `facts/`
Project-level curation guidance and durable facts handling.
- Central idea: knowledge is stored as **rawConcept + narrative**, organized by **domain → topic → subtopic**.
- Canonical workflow: recon → extract facts/context → curate with UPSERT → verify applied paths.
- Preserves exact rules, regexes, timestamps, and source references.
- Drill-down: `project/_index.md` / `curated_context_snippet.md`.

### `frontend_ui/`
Chat UI stability, transport, message persistence, feedback, proxy/auth routing, and thread/sidebar behavior.
- Dominant theme: **runtime identity** — `threadId`, auth-derived `resourceId`, and token readiness must stay aligned across transport, cache restoration, memory, and sidebar fetches.
- Key subareas:
  - `chat_page_review_fixes/` — component boundaries, chat layout, accessibility, and UI hardening.
  - `chat_page_scroll_stability/` and `scroll_area_sidebar_stability/` — viewport-safe scrolling and sidebar preservation.
  - `chat_page_transport/` — auth-scoped transport reinitialization.
  - `chat_page_thread_cache/` and `message_persistence_cache/` — thread restoration and async persistence race handling.
  - `message_persistence_parsing/` — reconstruct persisted messages into `UIMessage`.
  - `chat_streaming_error_handling/` — deterministic SSE mocks and destructive error UI.
  - `thread_sidebar/` — resilient thread list loading and auth-aware retries.
  - `message_feedback/` — feedback persistence/API/client/UI integration.
  - `proxy_handling/` — Next.js 16 `proxy.ts` migration with WorkOS Authkit.
- Cross-entry synthesis reinforces one principle: **auth, transport, memory, and persistence are coupled through identity**.

### `packages/`
Retrieval and evaluation stack for policy corpus and crawler behavior.
- Central pattern: **staged retrieval** with overscan, filtering, deduplication, and reranking/fusion; do not trust raw top-k results.
- Major pieces:
  - `crawler/` — Node/undici redirect hardening and crawl semantics preservation.
  - `pipeline/` — A/B embedding evaluation harness, gates, and regression thresholds.
  - `policy_corpus/` — coverage routing, document selection, frame assembly, authority handling, and reranking logic.
  - `retrieval_quality/` — decontamination, staged ranking, and contamination-aware retrieval.
- Shared rule across subclusters: specialized routing/filtering must happen **before** generic narrowing.

### `qa/`
End-to-end testing for the Medicaid navigator agent UI and its trust chain.
- This domain links Playwright testing with hallucination verification and answer evaluation.
- Key subareas:
  - `playwright_e2e/` — mocked vs smoke test split, helpers for streaming and thread sidebar behavior.
  - `hallucination_verifier/` — final-answer-only verification, tool-scoped evidence gathering, rewrite-based failure handling.
  - `evaluation_pipeline/` — level 3 answer scoring and level 2 cross-reference resolution.
  - `launch_blockers/` and trust synthesis entries — enforce a chain of evidence retrieval → verification/rewriting → scoring.
- Core principle: **trust is structural and cumulative, not a single score**.

## Cross-cluster relationships

- **Runtime boundary theme** spans:
  - `agent_architecture/`
  - `auth_integration/`
  - `database_operations/`
  - `frontend_ui/`
- **Retrieval correctness theme** spans:
  - `agent_architecture/packages_pipeline`
  - `agent_architecture/search_tooling`
  - `database_operations/neo4j_hybrid_search`
  - `packages/`
  - `evaluation/`
  - `qa/`
- **Graph consistency and validation** spans:
  - `database_operations/neo4j_write_read_consistency`
  - `amendment_detection/`
  - `evaluation/`
  - `qa/`
- **Identity/state coupling** is especially strong in `frontend_ui/` and mirrors the runtime-boundary pattern in auth and database layers.
- **Curation and durable recall** are centralized in `agent_architecture/context/` and formalized in `facts/`.

## Drill-down map

- For core agent architecture and durable curation: `agent_architecture/context/`, `agent_architecture/nc_medicaid_agent/`
- For auth/runtime boundary fixes: `auth_integration/`
- For Neo4j auth, refresh, and search internals: `database_operations/`
- For UI identity, chat state, and streaming stability: `frontend_ui/`
- For retrieval pipeline and policy corpus behavior: `packages/`
- For test architecture and trust enforcement: `qa/`
- For amendment detection mechanics: `amendment_detection/`
- For curation policy and facts handling: `facts/`