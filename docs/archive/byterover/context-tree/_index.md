---
children_hash: 283074833d8c85ab2e39f59d0ac473bfd9e8c24928a27e70bd1edae6a81ea282
compression_ratio: 0.13060788502621867
condensation_order: 3
covers: [agent_architecture/_index.md, amendment_detection/_index.md, architecture/_index.md, auth_integration/_index.md, database_operations/_index.md, evaluation/_index.md, facts/_index.md, frontend_ui/_index.md, packages/_index.md, packages_pipeline/_index.md, qa/_index.md]
covers_token_total: 20596
summary_level: d3
token_count: 2690
type: summary
---
# D3 Structural Summary

## Top-level structure
These entries describe the project’s main operational and correctness layers: **agent architecture**, **runtime/auth boundaries**, **database operations**, **evaluation**, **facts/curation discipline**, **frontend UI**, **packages/pipeline behavior**, **QA**, and **architectural refactoring**. Across all clusters, the repeated themes are **runtime-boundary correctness, staged retrieval, verification-first workflows, and durable curated knowledge**.

## Agent architecture
### `agent_architecture/_index.md`
- Serves as the umbrella for NC Medicaid Navigator agent architecture, operational curation, production readiness, and retrieval reliability.
- Core curation contract: **recon → extraction → dedup/group → UPSERT → verify**.
- `context.md` defines the agent domain scope: bootstrapping, memory, tool wiring, prompt guardrails, and citation rules.
- Major subclusters:
  - amendment interpretation and prompt guardrails
  - runtime boundaries and environment ownership
  - policy corpus embedding and hybrid search
  - Neo4j validation and deep research workflow
  - production smoke checks, backups, and scheduled ops
  - customer-ready web surface and usage attribution
  - local dev setup, CI, and docs maintenance
  - Mastra server timeout tuning
  - agent runtime/storage hardening
  - crawler/retrieval/parsing pipeline
- Cross-cutting pattern: runtime-owned values must be resolved live; build-time assumptions and stale env state cause failures in auth, deploy, and database initialization.

## Amendment detection
### `amendment_detection/_index.md`
- Graph-based DHHS amendment detection for Medicaid docs.
- Primary implementation: `packages/pipeline/src/pipeline/references/amendments.py`, especially `detect_amendments()`.
- Flow: scan documents → detect change notices/revised SPAs → extract references and sentence context → create batched `AMENDS` edges in Neo4j → mark source docs as `status="amendment"`.
- Key heuristics include `_is_change_notice`, `_is_revised_spa`, `_is_signal_section`, and `_is_sentence_boundary`.
- Important fixes:
  - periods inside MA-series identifiers no longer break sentence splitting
  - `_extract_context` preserves full sentences around dotted MA numbers
  - `change_description` is deduplicated per `(source, target)` before batch merge
  - signal sections are preferred over fallback bodies
- Detection patterns include `CHANGE NOTICE FOR MANUAL NO. ...`, `((?:MA|DMA|DHB|DSS)-\d+)`, and `SPA\s+(\d+[\s\-]+\d+)`.

## Architecture and refactoring
### `architecture/_index.md`
- Covers repo-wide refactoring across `packages/agent`, `packages/pipeline`, `packages/policy-corpus`, and `packages/web`.
- Dominant approach: replace duplicated imperative logic with declarative tables or canonical helpers, then prove behavior is unchanged with differential tests and fixture validation.
- Core themes:
  - rules-as-data refactors
  - shared canonical helpers and fixtures
  - import-cycle and module-boundary cleanup
  - CI suppression for artifact-only PRs
- Important decisions:
  - answer-frame planner uses ordered `ChecklistRule<C>` tables via `evaluateRules()`
  - shared fixture layers span pipeline, policy-corpus, and agent
  - `RecordingGraphWriter.__getattr__` validates against the real writer to catch API drift
  - `push:main` CI remains fully active even when artifact-only PRs are skipped on `pull_request`

## Auth integration and runtime boundary correctness
### `auth_integration/_index.md`
- Central rule: **runtime-owned state must be resolved live at the boundary, not frozen at build time or first initialization**.
- Applies across auth callback origins, env ownership, chat transport identity, and Neo4j credentials.
- Subclusters:
  - WorkOS auth callback and deployment portability
  - environment ownership as source-of-truth
  - chat state and transport identity
  - database initialization vs live mutation
- Key resolution order for callback origin:
  1. `NEXT_PUBLIC_WORKOS_REDIRECT_URI`
  2. `WORKOS_REDIRECT_URI`
  3. `RAILWAY_PUBLIC_DOMAIN`
- Neo4j lesson: `NEO4J_AUTH` only initializes on first volume setup; existing DBs require live password updates.

## Database operations
### `database_operations/_index.md`
- Operational Neo4j knowledge focused on deployment behavior, auth handling, write/read consistency, and schema-aware validation.
- Subtopics:
  - `neo4j_auth`: Railway auth quirks, first-volume initialization semantics, password rotation via bolt proxy, and targeted production refresh flow
  - `neo4j_hybrid_search`: staged hybrid retrieval with vector, chunk, concept graph, and fulltext signals fused by RRF
  - `neo4j_write_read_consistency`: single write-side boundary and incremental, idempotent graph cleanup
- Shared safety rule: **normalize first, then validate, then trust**.
- Validation spans graph writes, retrieval payload shaping, evaluation, and QA.
- Key shared dependencies:
  - `CorpusGraphWriter` as the write boundary
  - Railway TCP proxy and env-sensitive credential handling
  - schema-aware validation as the cross-layer correctness contract

## Evaluation
### `evaluation/_index.md`
- Centers on QA and reference-validation evaluation with Neo4j-backed evidence and dataset integrity.
- Main tracks:
  - answer quality evaluation
  - cross-reference resolution evaluation
  - evaluation pipeline overview
- Answer scoring flow: golden entries → agent invocation → Neo4j evidence fetch → `judge_answer` → per-question metrics.
- Cross-reference evaluation resolves document-level `REFERENCES_DOCUMENT`/`AMENDS` first, then section-level `REFERENCES`.
- Applied hardening includes:
  - dataset provenance fixes
  - `eval-compare --fail-on-regression`
  - cached dataset inheritance for citation eval
  - stats reporting for freshness and chunk-aware embedding coverage
- Core principle: correctness depends on aligned datasets, explicit graph relationships, and careful handling of non-model failures.

## Facts and durable knowledge
### `facts/_index.md`
- Defines the project’s durable knowledge discipline and its relation to evaluation rigor.
- `conventions/_index.md` centralizes curation workflow discipline:
  - recon → extraction → curate → verify
  - UPSERT-first curation
  - exact rule preservation and verification of applied file paths
- `project/_index.md` expands the durable knowledge system into:
  - agentic map/RLM curation workflow
  - model defaults and eval gating
  - environment parsing and runtime defaults
  - reranker evolution
  - coverage scoring and embedding constraints
  - ops backup workflows and storage
- Strong recurring idea: durable knowledge capture follows the same auditable discipline as project evaluation.

## Frontend UI
### `frontend_ui/_index.md`
- Organizes frontend knowledge around four invariants:
  - chat state is identity-sensitive
  - persistence must survive remounts and reloads
  - scrolling must be layout-stable
  - testing must work without production auth/backend availability
- Key clusters:
  - chat page structure and review fixes
  - thread cache restoration and authenticated thread operations
  - auth-sensitive chat transport and runtime identity alignment
  - streaming, scroll stability, and sidebar stability
  - message persistence, parsing, citations, and feedback
  - proxy handling, theme persistence, and design system
- Repeated rule: runtime identity must be resolved live and propagated through transport, cache, persistence, and rendering.
- `threadId` alone is insufficient; `resourceId` and auth-derived identity must be part of the state key.

## Packages / pipeline / retrieval
### `packages/_index.md`
- Broad operational and retrieval layer covering agent, crawler, pipeline, policy corpus, and retrieval quality.
- Main themes:
  - realistic production verification over synthetic signals
  - staged retrieval rather than single-pass top-k
  - environment/runtime correctness
  - evaluation discipline
- `agent/_index.md` emphasizes provider health probes and production smoke testing.
- `crawler/_index.md` records Node 26/undici compatibility fixes and private dispatcher ownership.
- `pipeline/_index.md` covers CLI package split and A/B gate corrections.
- `policy_corpus/_index.md` organizes retrieval, reranking, frame assembly, selection, evaluation harnesses, and tests.
- `retrieval_quality/_index.md` reinforces the contract: query intent → candidate scoring → overscan → topical filtering → group ranking → RRF merge.
- Core retrieval rule: **overscan, filter, dedupe, rerank, fuse**; do not rely on a global top-k.

### `packages_pipeline/_index.md`
- Focuses on retrieval collector behavior, especially `collectHybridHitMap` and `finalizeHybridHits`.
- Stage order:
  1. stage-1 backends merge into a section map
  2. fulltext recovery scoring
  3. optional change-notice/document expansion
  4. final ranking and capping
- Locked-in behaviors:
  - merge-max semantics on `sectionId`
  - silent skipping of unknown backends
  - deterministic fulltext recovery
  - baseline sort-and-truncate when reranking is absent
- Also covers crawler CLI/docs linkage and SSA parser subsection splitting stability.

## QA
### `qa/_index.md`
- Captures end-to-end testing and trust-verification patterns for the Medicaid navigator UI and policy-answer pipeline.
- Scope:
  - Playwright E2E infrastructure
  - hallucination/citation verification
  - trust as an end-to-end chain from retrieval through evaluation
- Playwright stack:
  - mocked suite: fast path, 15s timeouts
  - smoke suite: live backend path, 120s timeouts
  - helpers: `MastraStreamBuilder`, `mockMastraAPI(page, ...)`, `ChatPage`
- Hallucination verifier:
  - final-answer only
  - source-scoped evidence builders
  - two-step check: relevance then factual accuracy
  - unsupported answers are rewritten, not retried
  - strict stdout markers: `---EVIDENCE---`, `---VERIFIER---`, `---ANSWER---`
- Shared principle: trust is enforced as a chain, not by a single score or check.

## Cross-entry relationships and recurring patterns
- **Runtime-boundary correctness** is a shared root cause class across auth, deployment, chat state, storage, and database initialization.
- **Verification-first operations** recur in provider health checks, smoke tests, eval gates, deep research, and hallucination handling.
- **Staged retrieval** is the project-wide retrieval contract: overscan broadly, filter by intent/type, dedupe by stable identity, then rerank and fuse.
- **Schema-aware validation** is the shared safety net across graph writes, retrieval, evaluation, and QA.
- **Durable knowledge** is treated as an engineering system: curated entries are structured, auditable, and tied to exact drill-down files for further detail.