---
children_hash: 322279ebf6629505bb4a54b98676c94efd41772e00401fd6c2196e67f1f16a31
compression_ratio: 0.2425890671743269
condensation_order: 3
covers: [agent_architecture/_index.md, amendment_detection/_index.md, auth_integration/_index.md, database_operations/_index.md, evaluation/_index.md, facts/_index.md, frontend_ui/_index.md, packages/_index.md, qa/_index.md]
covers_token_total: 14708
summary_level: d3
token_count: 3568
type: summary
---
# Level D3 Structural Summary

This cluster is dominated by a single systems pattern: **trust and correctness are enforced structurally across runtime boundaries, retrieval stages, evaluation, and UI state**, not by isolated checks. The child entries break into a few major domains that together describe how the NC Medicaid Navigator remains reliable: architecture/runtime hardening, database and retrieval correctness, frontend chat stability, QA trust chains, evaluation pipelines, and curated facts policy.

## 1) Architecture and runtime-boundary hardening
**Drill down:** `agent_architecture/`, `auth_integration/`, `database_operations/`

These entries document the platform’s recurring failure mode: assuming build-time or initialization-time state when the system actually depends on live runtime values.

- **`agent_architecture/_index.md`**
  - Broad architectural cluster covering:
    - context curation workflows
    - amendment pipeline/prompt guardrails
    - local development and CI rules
    - Mastra server timeout tuning
    - amendment retrieval tools
    - core agent runtime hardening
    - Neo4j output validation
    - retrieval pipeline behavior
    - hybrid search
  - Central theme: **runtime-boundary correctness**.
  - Important patterns:
    - use live runtime state, not static config assumptions
    - preserve durable knowledge via curation
    - prefer incremental, schema-aware updates over rebuilds
    - keep retrieval stable through overscan, deduplication, and ranking/fusion

- **`auth_integration/_index.md`**
  - Shared boundary pattern across auth, frontend, agent, and database flows.
  - Key decision: public/runtime values must be resolved dynamically before auth handling.
  - Important relationships:
    - callback origin resolution order: `NEXT_PUBLIC_WORKOS_REDIRECT_URI` → `WORKOS_REDIRECT_URI` → `RAILWAY_PUBLIC_DOMAIN`
    - WorkOS AuthKit callback uses the computed public origin in `handleAuth`
    - Next.js 16 auth routing moved from middleware to `proxy.ts`
    - root `.env` is the single source of truth; package env files should align with it
    - Neo4j credential state depends on whether the database was initialized on first volume setup or is already mounted

- **`database_operations/_index.md`**
  - Operational knowledge for Neo4j auth, hybrid search, and write/read consistency.
  - Key architecture:
    - prefer **incremental mutation** over destructive reloads
    - treat Railway/production behavior as a first-class constraint
    - validate output before downstream use
  - Important clusters:
    - **`neo4j_auth/`**: Railway password decoding issues, `NEO4J_AUTH` initialization semantics, safe credential rotation through bolt proxy
    - **`neo4j_hybrid_search/`**: per-group vector search, chunk/section embeddings, concept matches, fulltext hits, RRF fusion
    - **`neo4j_write_read_consistency/`**: surgical cleanup during writes, incremental ingest, stale-section removal, selective embedding invalidation

## 2) Retrieval, corpus, and policy search architecture
**Drill down:** `packages/`, `amendment_detection/`, `agent_architecture/packages_pipeline/`, `database_operations/neo4j_hybrid_search/`

These entries describe the retrieval stack as a staged system: overscan, filter, deduplicate, and rerank before final assembly. The shared principle is that raw top-k results are not trusted.

- **`packages/_index.md`**
  - Umbrella summary for crawler, pipeline evaluation, policy corpus, and retrieval quality.
  - Core architecture: **staged retrieval with overscan, filtering, deduplication, and reranking/verification**.
  - Major sub-areas:
    - crawler fetcher hardening for Node 26 and undici dispatcher isolation
    - A/B embedding evaluation harness with regression gates
    - policy corpus routing/frame assembly
    - retrieval quality and decontamination
  - Important rule: specialized routing/filtering happens before generic narrowing.

- **`agent_architecture/packages_pipeline/`**
  - Retrieval backend and SSA parsing fixes:
    - overscan by type group
    - `sectionId` deduplication
    - fulltext boosting
    - stable subsection splitting for SSA documents
  - Drill-down topics:
    - `retrieval_fixes/`
    - `crawler_sync_behavior/`
    - `ssa_parser_subsection_splitting_fix.md`

- **`database_operations/neo4j_hybrid_search/`**
  - Hybrid retrieval merges:
    - section embeddings
    - chunk embeddings
    - concept graph matches
    - fulltext keyword hits
  - Uses **Reciprocal Rank Fusion** with `RRF_K = 60`.
  - Search is performed per document-type group, then deduplicated by `section_id` before fusion.
  - `section_fulltext` indexes `Section.title` and `Section.content_text`.
  - Concept matching is gated by `query_text`, with `CONCEPT_MATCH_SCORE = 0.70` and capped at `min(top_k, 5)`.

- **`amendment_detection/_index.md`**
  - Amendment graph detection for DHHS Medicaid docs.
  - Core flow:
    - scan for amendment-relevant sources
    - detect change notices and revised SPAs
    - extract MA/SPA references and sentence context
    - create batched `AMENDS` edges in Neo4j
    - update source docs to `status="amendment"`
  - Important fixes:
    - sentence boundaries must not split on dotted MA identifiers
    - signal sections are preferred over fallback bodies
    - `(source, target)` `change_description` entries are deduplicated before merge
  - Patterns:
    - `CHANGE NOTICE FOR MANUAL NO. ...`
    - `((?:MA|DMA|DHB|DSS)-\d+)`
    - `SPA\s+(\d+[\s\-]+\d+)`

## 3) Frontend chat stability, runtime identity, and feedback
**Drill down:** `frontend_ui/`

This cluster treats the chat page as a coupled system of transport, memory, persistence, scroll behavior, and auth-derived identity. The central rule is that **thread identity and auth identity must stay aligned across all layers**.

- **`frontend_ui/_index.md`**
  - Documents the chat page as a set of tightly coupled behaviors.
  - Main recurring pattern: **runtime identity**.
  - Important identities:
    - `threadId`
    - auth-derived `resourceId`
    - token readiness
  - Subclusters:
    - `chat_page_review_fixes/`
    - `chat_page_scroll_stability/`
    - `chat_page_thread_cache/`
    - `chat_page_transport/`
    - `chat_streaming_error_handling/`
    - `message_feedback/`
    - `message_persistence_cache/`
    - `message_persistence_parsing/`
    - `proxy_handling/`
    - `scroll_area_sidebar_stability/`
    - `thread_sidebar/`

Key structural decisions:
- scroll uses `viewport.scrollTo`, not `scrollIntoView`, so the sidebar stays visible
- `min-h-0` and overflow choices preserve flex/layout correctness
- `useChat` identity expands from `threadId` to `threadId:resourceId`
- transport is recreated when auth changes
- cache restore uses `pendingRestore` to avoid writing into a stale chat instance
- persistence parsing normalizes Mastra payload versions and tool states
- feedback is a full pipeline: repository → API route → web client → UI actions
- Next.js 16 proxy migration resolves WorkOS/AuthKit routing behavior

## 4) QA, verifier, and trust chain
**Drill down:** `qa/`

The QA domain frames correctness as a chain: retrieve evidence, verify or rewrite, then score grounded outputs. It extends beyond simple UI tests into end-to-end trust enforcement.

- **`qa/_index.md`**
  - Covers Playwright e2e testing plus the broader trust chain across retrieval, hallucination verification, and evaluation.
  - Domain boundary: Playwright-based end-to-end patterns for the Medicaid navigator agent UI.
  - Owned by the QA/Automation Team.
  - Core structure:
    - mocked tests vs smoke tests
    - shared helpers for SSE streams, mock routes, and chat-page actions
    - tests depend on the web app running locally

- **`playwright_e2e/_index.md`**
  - Splits execution into:
    - **Mocked** tests: fast, ~15s, desktop Chrome
    - **Smoke** tests: live agent path, ~120s, real backend/Neo4j
  - Helpers:
    - `MastraStreamBuilder`
    - `mockMastraAPI`
    - `ChatPage`
  - These utilities hide streaming, thread lifecycle, and message retrieval behind stable abstractions.

- **`hallucination_verifier/_index.md`**
  - Verifier contract:
    - final-answer only
    - only runs when `finishReason === 'stop'`
    - no pending tool calls
    - evidence is tool-scoped
    - failure handling is rewrite-based via `correctedAnswer`
  - Stable stdout markers:
    - `---EVIDENCE---`
    - `---VERIFIER---`
    - `---ANSWER---`
  - Evidence sources are limited to:
    - `getSection`
    - `getDocument`
    - `getAmendments`
    - `lookupPolicy`
    - `followReferences`

- **`evaluation_pipeline/_index.md`**
  - Two evaluation layers:
    - **Level 3 answer scoring**
    - **Level 2 cross-reference resolution**
  - Shared dependency chain:
    - golden entries
    - agent invocation
    - Neo4j evidence retrieval
    - `judge_answer`
    - aggregation / coverage metrics
  - Key risk remains in reference extraction, not scoring logic.

Shared trust principle across this domain:
- retrieve evidence correctly
- verify or rewrite unsupported output
- score only grounded final answers
- preserve citation fidelity and relationship fidelity end-to-end

## 5) Evaluation, retrieval quality, and embedding choice
**Drill down:** `evaluation/`, `packages/evaluation_harness_ab/`, `packages/retrieval_quality/`, `packages/pipeline/`

These entries describe the measurement side of the system: answer quality, cross-reference resolution, and embedding/reranking choices.

- **`evaluation/_index.md`**
  - Evaluation is centered on:
    - golden-entry-driven agent execution
    - Neo4j evidence lookup
    - judgment/scoring
    - metrics aggregation
  - Answer-quality evaluation:
    - HTTP-first with CLI fallback
    - evidence fetched from Neo4j section queries
    - scores normalized on agent/judge failures
  - Cross-reference resolution:
    - validates document-level and section-level relationships
    - tracks resolved vs missed refs and derived precision/recall
  - A/B test finding:
    - `voyage-law-2` vs `voyage-4-large` was effectively a wash
    - no meaningful improvement over threshold
    - bottleneck appears structural, not model-choice driven

- **`packages/_index.md`**
  - Retrieval and evaluation stack emphasizes staged retrieval, decontamination, and regression-gated A/B testing.
  - Important decisions:
    - mixed corpus for apples-to-apples embedding evaluation
    - regression threshold `EVAL_REGRESSION_THRESHOLD = 0.05`
    - reranker is guarded/fail-open
    - `voyage-4` preferred over `voyage-law-2` when quality matches and cost drops
    - embeddings and reranking must be evaluated with the same corpus and compatible dimensions

- **`retrieval_quality/_index.md`** and related synthesis entries
  - Retrieval quality depends on:
    - decontamination
    - per-group overscan
    - stable identity deduplication
    - controlled reranking and final fusion
  - Query path favors:
    - broad collection
    - intent/type filtering
    - deduplication
    - rerank/fusion
    - verification

## 6) Amendment pipeline and policy interpretation
**Drill down:** `agent_architecture/amendment_pipeline_and_prompt/`, `amendment_detection/`, `agent_architecture/navigate_tools/`

These entries preserve the policy-interpretation layer used for Medicaid amendment analysis.

- **`agent_architecture/amendment_pipeline_and_prompt/`**
  - Canonical source for amendment interpretation and prompt guardrails.
  - Scope includes:
    - amendment graph interpretation
    - authoritative change-summary extraction
    - prompt rules
    - traversal heuristics
    - examples
  - `amendment_pipeline_and_prompt_guardrails.md` is the authoritative drill-down entry.

- **`agent_architecture/navigate_tools/getamendments_optional_match_filtering.md`**
  - `getAmendments` uses `OPTIONAL MATCH` with null-row filtering.
  - Metadata mapping and authoritative document selection are part of the behavior.
  - This is a targeted retrieval rule for amendment lookup rather than a broad search flow.

## 7) Curation, context extraction, and durable knowledge
**Drill down:** `agent_architecture/context/`, `facts/`

These entries document how knowledge itself is curated and preserved.

- **`agent_architecture/context/`**
  - Operational curation knowledge:
    - single-pass processing
    - precomputed recon
    - verification via applied output paths
    - durable knowledge instead of chat-only notes
  - Key drill-down entries:
    - `context.md`
    - `curated_context_extraction_notes.md`
    - `curated_operational_knowledge.md`
    - `epsdt_exception_completeness_workstream_e.md`

- **`facts/_index.md`**
  - Project-level curation guidance.
  - Confirms the two-part context model:
    - `rawConcept` for facts, metadata, structure
    - `narrative` for dependencies, highlights, rules
  - Canonical workflow:
    - recon → extract → curate with UPSERT → verify applied paths
  - Preservation rules:
    - preserve exact rules, regex, timestamps, and references
    - avoid vague contexts and nested subtopics
  - Facts should be stored as durable knowledge, with standalone facts domains when needed.

## Cross-cluster relationships

- **Runtime boundary theme** links `agent_architecture`, `auth_integration`, `database_operations`, and `frontend_ui`.
- **Retrieval staging theme** links `packages`, `database_operations/neo4j_hybrid_search`, `amendment_detection`, and `evaluation`.
- **Trust chain theme** links `qa`, `evaluation`, `frontend_ui` streaming/error handling, and the retrieval/citation layers beneath them.
- **Curation/durability theme** links `agent_architecture/context` and `facts`.

## Drill-down priorities

- For runtime and deployment hardening: **`agent_architecture/`**, **`auth_integration/`**, **`database_operations/`**
- For UI identity, transport, and persistence: **`frontend_ui/`**
- For testing, verifier behavior, and trust enforcement: **`qa/`**
- For scoring, cross-reference resolution, and retrieval quality: **`evaluation/`**, **`packages/`**
- For amendment interpretation and retrieval rules: **`agent_architecture/amendment_pipeline_and_prompt/`**, **`amendment_detection/`**
- For durable curation practices: **`agent_architecture/context/`**, **`facts/`**