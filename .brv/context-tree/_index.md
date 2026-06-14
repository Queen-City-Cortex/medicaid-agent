---
children_hash: 67a8985d5e26af379b4fc44956e358cc1e7b28448d86850d3175364cdf040c98
compression_ratio: 0.17570630004532406
condensation_order: 3
covers: [agent_architecture/_index.md, amendment_detection/_index.md, auth_integration/_index.md, database_operations/_index.md, evaluation/_index.md, facts/_index.md, frontend_ui/_index.md, packages/_index.md, qa/_index.md]
covers_token_total: 13238
summary_level: d3
token_count: 2326
type: summary
---
# Level d3 Structural Summary

This cluster describes the Medicaid Navigator’s **core architecture, retrieval stack, runtime boundaries, evaluation/trust pipeline, and QA/e2e harness**. The recurring theme across the child entries is that correctness depends on preserving **runtime identity, schema-aware validation, staged retrieval, and evidence-to-answer continuity**.

## Major structural areas

### `agent_architecture/_index.md`
- The architecture domain splits into five main concerns:
  - **Amendment interpretation** via `amendment_pipeline_and_prompt/_index.md`
  - **Durable context curation** via `context/_index.md`
  - **Local/CI runtime contract** via `local_dev_setup/_index.md`
  - **Agent runtime and hardening** via `nc_medicaid_agent/_index.md`
  - **Retrieval/tool correctness** via `navigate_tools/_index.md`, `neo4j_tool_output_validation/_index.md`, `packages_pipeline/_index.md`, and `search_tooling/_index.md`
- Shared pattern: **single-pass curation/recon for knowledge**, **runtime hardening for startup and CI**, and **retrieval correctness through staged filtering and validation**.
- `mastra_server_configuration/_index.md` adds a long-running server contract: **10-minute timeout** to support multi-step research and SSE workflows.

### `amendment_detection/_index.md`
- Covers **graph-based DHHS amendment detection** and the write path for `AMENDS` edges in Neo4j.
- Primary implementation: `packages/pipeline/src/pipeline/references/amendments.py`, especially `detect_amendments()`.
- Core flow: scan documents → detect change notices and revised SPAs → extract MA/SPA references and surrounding sentence context → batch `AMENDS` writes → mark source docs as `status="amendment"`.
- Key fixes and rules:
  - sentence boundary logic avoids splitting on dotted MA identifiers like `MA-2180.IV.I`
  - signal sections are preferred over fallback bodies
  - duplicate `(source, target)` descriptions are removed before merge
  - detection patterns include `CHANGE NOTICE FOR MANUAL NO. ...`, `((?:MA|DMA|DHB|DSS)-\d+)`, and `SPA\s+(\d+[\s\-]+\d+)`
- Drill down to `pipeline_detection/_index.md` and `amendment_detection_pipeline.md`.

### `auth_integration/_index.md`
- Centers on a shared **runtime-boundary** problem: auth and deployment failures happen when build-time assumptions leak into runtime behavior.
- Main fix pattern: resolve public origin dynamically, centralize env ownership, and distinguish initialization state from live state.
- Key sub-areas:
  - `workos_authkit_nextjs/_index.md` — `/auth/callback` uses computed public origin with `handleAuth`
  - auth callback origin resolution order:
    1. `NEXT_PUBLIC_WORKOS_REDIRECT_URI`
    2. `WORKOS_REDIRECT_URI`
    3. `RAILWAY_PUBLIC_DOMAIN`
- The same principle is extended to config synchronization and Neo4j credential initialization: root `.env` is the source of truth, and `NEO4J_AUTH` only initializes on first volume setup.

### `database_operations/_index.md`
- Documents operational knowledge for **Neo4j deployment, authentication, hybrid search, and write/read consistency**.
- Domain scope: database connection/auth issues, Railway quirks, and graph validation. Ownership: **Platform Infrastructure Team**.
- Major topics:
  - `neo4j_auth` — Railway URL-decoding, password rotation via bolt proxy, production refresh guidance
  - `neo4j_hybrid_search` — hybrid retrieval using embeddings, concept graph matching, fulltext, and **RRF (RRF_K = 60)**
  - `neo4j_write_read_consistency` — `CorpusGraphWriter` as the single write boundary with surgical cleanup of changed sections
- Cross-cutting rule: **schema-aware validation** is the shared guardrail from graph writes to retrieval/evaluation.

### `evaluation/_index.md`
- Evaluation is split into two main pipelines:
  - **Answer quality evaluation**
  - **Cross-reference resolution evaluation**
- Shared pipeline shape: golden entries → agent invocation → Neo4j evidence retrieval → judge/scoring → aggregate metrics.
- Key implementation modules:
  - `packages/pipeline/src/pipeline/eval/levels/answer.py`
  - `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`
- Important behaviors:
  - HTTP-first agent invocation with CLI fallback
  - CLI invocations time out after 180 seconds
  - judge errors become `None` and are excluded from aggregates
  - cross-reference evaluation checks `REFERENCES_DOCUMENT`, `AMENDS`, `HAS_SECTION`, and `REFERENCES`
- Drill into `answer_quality/_index.md`, `cross_reference_resolution/_index.md`, and `pipeline_overview/_index.md`.

### `facts/_index.md`
- Project-level curation guidance for durable knowledge capture.
- Core structure:
  - `rawConcept` for metadata, operations, facts, and traceable structure
  - `narrative` for descriptive structure, dependencies, highlights, and rules
- Canonical workflow: **recon → extract facts/context → curate with UPSERT → verify applied files**.
- Preservation rules emphasize exact rule text, regex patterns, timestamps, and source references.
- Facts should be stored durably, with standalone domains such as `facts/personal`, `facts/project`, and `facts/conventions`.

### `frontend_ui/_index.md`
- The chat UI is organized around **layout stability, runtime identity, message persistence, streaming resilience, and feedback persistence**.
- Main recurring boundary: `threadId` + auth-derived `resourceId` determines when transport, memory, cache restoration, and sidebar fetches must refresh.
- Key subtopics:
  - `chat_page_review_fixes/_index.md` — component boundaries, sidebar layout, `useChat` transport, and UI hardening
  - `chat_page_scroll_stability/_index.md` and `scroll_area_sidebar_stability/_index.md` — viewport-safe scrolling and sidebar visibility
  - `chat_page_transport/_index.md` — transport reinitialization on `threadId:resourceId`
  - `chat_page_thread_cache/_index.md` and `message_persistence_cache/_index.md` — cache restoration and async persistence race handling
  - `message_persistence_parsing/_index.md` — reconstructing `UIMessage` payloads from stored messages
  - `chat_streaming_error_handling/_index.md` — SSE test payloads and deterministic failure behavior
  - `thread_sidebar/_index.md` — auth-aware thread listing and fetch resilience
  - `message_feedback/_index.md` — feedback API, repository, and UI integration
  - `proxy_handling/_index.md` — Next.js 16 `proxy.ts` migration with WorkOS Authkit
- Cross-entry syntheses reinforce that **runtime identity must stay aligned across auth, transport, cache, and memory**.

### `packages/_index.md`
- This layer captures the retrieval principle that **global top-k is not enough**.
- Shared pattern across package retrieval and graph frame assembly:
  - overscan → filter → dedupe → rerank/fuse → assemble
- Major clusters:
  - `policy_corpus/_index.md` — intent-aware selection, care-setting preference, coverage frame assembly, authority pairing/rebalance
  - `retrieval_quality/_index.md` — decontamination plus staged ranking, with per-group overscan compensating for global top-k limits
- Important specifics:
  - `queryNodes(k)` is only a global top-k
  - retrieval uses `sectionId`, `document_type`, RRF, and intent/setting preference
  - authority citation flows preserve statute/regulation pairing and official headings
- The domain highlights that retrieval is **intent-aware, staged, and schema-constrained** rather than purely similarity-based.

### `qa/_index.md`
- QA and trustworthiness are treated as a single chain spanning **Playwright E2E**, **hallucination verification**, **evaluation**, and **launch blockers**.
- `qa/context.md` defines QA scope: Playwright-based end-to-end testing helpers, mocked/smoke suites, Mastra streaming/memory helpers, and page objects.
- `playwright_e2e/_index.md`:
  - two Playwright projects: **Mocked** and **Smoke**
  - helpers: `MastraStreamBuilder`, `mockMastraAPI`, `ChatPage`
  - flow: configure Playwright → build stream payloads → mock APIs → visit `/chat` → drive chat
- Trust pipeline synthesis entries emphasize:
  - retrieval evidence must survive into verification
  - verifier must rewrite unsupported answers
  - evaluation must score only grounded outputs
- `hallucination_verifier/_index.md` defines a final-answer-only verifier with rewrite-based failure handling and stable CLI markers.
- `launch_blockers/_index.md` records remediation priorities and the current blocker set, including proxy migration, concept validation, verifier hardening, and search test coverage.

## Cross-cutting relationships

- **Runtime boundaries** connect `auth_integration`, `frontend_ui`, `agent_architecture`, and `database_operations`: public origin, auth identity, env ownership, and persisted DB state all must be resolved at runtime.
- **Retrieval correctness** spans `navigate_tools`, `search_tooling`, `packages_pipeline`, `database_operations`, and `qa`: use staged retrieval, dedupe by identity, filter null rows, and validate schema before scoring or rendering.
- **Trustworthiness** is enforced end-to-end across `evaluation`, `qa`, and `agent_architecture`: retrieval evidence, verifier behavior, and final scoring must remain aligned.
- **Durable knowledge curation** in `agent_architecture/context` and `facts` provides the structural layer that converts session context into reusable records.