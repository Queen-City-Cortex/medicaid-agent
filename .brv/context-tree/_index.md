---
children_hash: 23fae577824e7dccd20f5fc97795d3abf2bbf2ba46fe1840e35a20dc13da9d2a
compression_ratio: 0.19244594946600677
condensation_order: 3
covers: [agent_architecture/_index.md, amendment_detection/_index.md, architecture/_index.md, auth_integration/_index.md, database_operations/_index.md, evaluation/_index.md, facts/_index.md, frontend_ui/_index.md, packages/_index.md, packages_pipeline/_index.md, qa/_index.md]
covers_token_total: 19195
summary_level: d3
token_count: 3694
type: summary
---
# d3 Structural Summary

## Repository-wide architectural spine
This level continues to organize the codebase around a few recurring system contracts:

- **Runtime-boundary correctness**: values that depend on deployment, auth state, or live infrastructure must be resolved at runtime, not assumed from build-time or first-run state.
- **Staged retrieval**: broad candidate collection must be followed by filtering, deduplication, reranking, and fusion rather than global top-k selection.
- **Schema-aware validation**: graph writes, retrieval results, and evaluation outputs are guarded by normalization and structural checks.
- **Durable curation**: knowledge is preserved as structured context rather than ephemeral notes, using a repeatable recon → extract → curate → verify workflow.
- **End-to-end trust**: retrieval, verification, evaluation, and QA are treated as one chain of correctness.

## Agent architecture and operational guardrails
**Drill down:** `agent_architecture/_index.md`

The agent architecture cluster holds the repo’s highest-level operating rules for the NC Medicaid Navigator agent and its supporting workflows.

### Core themes
- `agent_architecture/context.md` and `context/_index.md` define the home for:
  - agent bootstrapping
  - memory setup
  - tool wiring
  - policy-specific prompts
  - guardrails and citation rules
- The curation pattern is explicitly preserved:
  - recon first
  - single-pass when possible
  - extract → dedup/group → UPSERT curate → verify applied paths
- Durable knowledge is preferred over chat-only context for:
  - retrieval heuristics
  - message parsing
  - EPSDT completeness work
  - verification by curated output paths

### Key subtopics
- `amendment_pipeline_and_prompt/_index.md`
  - canonical source: `amendment_pipeline_and_prompt_guardrails.md`
  - covers amendment-graph interpretation, authoritative change-summary extraction, and system-prompt guardrails for policy QA
- `deep_research_workflow/_index.md`
  - baseline plan → approval → research → synthesize → verify flow
  - later hardening in `deep_research_workflow_fixes.md`
- `mastra_server_configuration/_index.md`
  - canonical timeout tuning
  - preserves the 10-minute timeout and SSE lifecycle constraints
- `neo4j_tool_output_validation/_index.md`
  - read-tool validation for numeric normalization, Zod-compatible payloads, and structured output
- `search_tooling/_index.md`
  - hybrid policy search via embeddings, graph matching, reciprocal rank fusion, and Neo4j indexes

### Cross-linking architectural conclusion
The agent layer, deep research pipeline, and search tooling all enforce the same rule: **runtime correctness and citation fidelity depend on structured, staged processing rather than one-shot generation**.

## Runtime boundaries, auth, and deployment reliability
**Drill down:** `auth_integration/_index.md`

This cluster is the canonical articulation of the project’s runtime-boundary rule set.

### Shared contract
- Resolve public-facing values at **request/runtime**
- Keep a **single source of truth** for environment config
- Treat **Neo4j auth as initialization-only** on first volume setup
- Reinitialize chat transport and related runtime state when auth/resource identity changes

### Main entry points
- `auth-and-deployment-fixes-are-driven-by-runtime-environment-boundaries.md`
  - dynamic callback origin resolution
  - `NEXT_PUBLIC_WORKOS_REDIRECT_URI` → `WORKOS_REDIRECT_URI` → `RAILWAY_PUBLIC_DOMAIN`
- `workos_authkit_nextjs/_index.md`
  - computed public `baseURL` passed to `handleAuth`
  - prevents redirecting to internal hosts like `0.0.0.0`
- `environment-boundaries-drive-both-deployment-fixes-and-auth-reliability.md`
  - root `.env` as source of truth
- `runtime-boundary-correctness-is-the-shared-fix-for-auth-chat-transport-and-datab.md`
  - `useChat` identity expands from `threadId` to `threadId:resourceId`
  - `DefaultChatTransport` memoizes on `threadId`, `resourceId`, and `getAccessToken`
- `runtime-boundary-bugs-cluster-around-deploy-auth-and-database-initialization.md`
  - clusters auth, deployment, and database-init failures into one class

### Relationship summary
Auth, deploy, frontend transport, and database initialization are all treated as the same architectural problem: **live state must override static assumptions**.

## Database operations, graph safety, and hybrid search
**Drill down:** `database_operations/_index.md`

This domain captures how the system interacts with Neo4j in production, during refreshes, and during retrieval.

### Neo4j auth and production refresh
See `neo4j_auth/_index.md`.
- Railway URL-decodes environment variables, so `+` can corrupt passwords
- `NEO4J_AUTH` only applies on first volume initialization
- Safe remediation path:
  - rotate to an alphanumeric-only password
  - apply it through the bolt TCP proxy with `ALTER CURRENT USER SET PASSWORD`
- Production refreshes should be targeted and non-destructive

### Neo4j hybrid search and migration
See `neo4j_hybrid_search/_index.md`.
- Retrieval combines:
  - section embeddings
  - chunk embeddings
  - concept graph matches
  - fulltext keyword hits
- Uses Reciprocal Rank Fusion with `RRF_K = 60`
- Required indexes:
  - `section_embeddings`
  - `chunk_embeddings`
  - `section_fulltext`
- Operational workflows include:
  - `deploy_data_script_and_refresh_workflow.md`
  - `voyage_4_embedding_migration_on_railway_production.md`
  - `source_selection_metadata_for_fee_schedules.md`

### Write/read consistency and validation
The schema-aware validation synthesis entries describe one guardrail across graph writes, retrieval, and evaluation:
- normalize uncertain or numeric output
- filter null rows after `OPTIONAL MATCH`
- validate against Zod-compatible schemas
- preserve relationship whitelisting and guarded Cypher execution

### Write boundary and incremental cleanup
See `neo4j_write_read_consistency/_index.md`.
- `connection.py` owns session acquisition and driver lifecycle
- `corpus_writer.py` owns all graph mutations
- `get_session()` is the single access choke point
- cleanup is incremental and doc-scoped:
  - merge document
  - write sections
  - delete stale sections
  - clear changed embeddings/chunks
  - merge relationships

## Retrieval, crawler, parser, and ranking pipeline
**Drill down:** `packages/_index.md` and `packages_pipeline/_index.md`

This family of entries defines the project’s retrieval contract: **do not use global top-k where grouped coverage is required**.

### Core retrieval principle
Across the staged-retrieval synthesis entries, the same flow appears:
- query intent
- candidate scoring
- vector overscan
- topical/type filtering
- deduplication by stable identity such as `sectionId`
- group-specific ranking
- RRF merge or final rerank

### Why it matters
- Neo4j `queryNodes(k)` is global top-k and too lossy for grouped coverage
- Coverage-preserving systems must overscan first, then filter and rerank
- Retrieval quality depends on coverage preservation and decontamination, not just ranking
- Evaluation must happen at the same layer as the user-facing behavior

### `packages_pipeline/_index.md`
This cluster focuses on the policy-corpus retrieval collector.
- `collectHybridHitMap` and `finalizeHybridHits` define stage-ordered collection and ranking
- Merge key is `^sectionId$`
- Locked-in behavior:
  - merge-max semantics
  - silent skipping of unknown backends
  - fulltext recovery boosts
  - deterministic final ranking when rerankers are absent

### `crawler/_index.md`
- Fetcher reliability fix for Node 26
- Uses a private undici dispatcher inside `createFetcher()`
- Redirects handled by `interceptors.redirect({ maxRedirections })`
- Preserves:
  - per-domain serialization
  - rate limiting
  - retry/backoff
  - file streaming

### Major retrieval subdomains
- `crawler_cli_and_package_docs.md`
  - crawler CLI and README contract
- `crawler_source_factories.md`
  - reusable source factories:
    - `singleIndexSource`
    - `pageCrawlSource`
    - `pushNewDocuments`
- `crawler_sync_behavior/_index.md`
  - separated download/check phases
  - default removal threshold of 3 consecutive 404s
- `ssa_parser_subsection_splitting_fix.md`
  - only top-level lettered subsections are split
  - parent section text is preserved
- `retrieval_fixes/_index.md`
  - collector orchestration and ranking behavior
- `policy_corpus/_index.md`
  - central overview for retrieval, reranking, routing, coverage frame assembly, and test contracts

### Architectural conclusion
Retrieval is treated as a staged contract across crawler, collector, routing, and evaluation layers. The repeated rule is: **coverage first, then select**.

## Policy corpus architecture and ranking contract
**Drill down:** `packages/_index.md`

The policy corpus cluster is the main structural summary for retrieval/reranking and coverage assembly.

### Major components
- retrieval / reranking
- coverage routing
- document selection
- coverage frame assembly
- section candidate profiles
- internal helper contracts
- test predicates
- rerank scoring
- refactoring risk

### Important behavior
- Rule order is load-bearing
- First-wins deduplication depends on ordered candidate tables
- `computeDocumentCoverageBoosts()` is intentionally called twice in the collector pipeline
- `shouldAttemptRerank()` is selective and fail-open
- Reranking must be evaluated at the answer level, not retrieval-only level

### Refactoring and contract stability
- Ordered rule tables replaced imperative branching in multiple places
- Canonical helpers and types are centralized
- Floating-point accumulation order is considered critical
- Waiver-authority logic is duplicated enough to require consolidation

## Evaluation, QA, and trust chain
**Drill down:** `evaluation/_index.md` and `qa/_index.md`

These clusters show that answer quality, cross-reference correctness, hallucination defense, and UI QA are all parts of the same trust pipeline.

### Evaluation domain
- `answer_quality/_index.md`
  - Level 3 answer-quality evaluation
  - golden entries → agent invocation → Neo4j evidence → `judge_answer` → aggregation
  - agent invocation is HTTP-first with CLI fallback
- `cross_reference_resolution/_index.md`
  - Level 2 graph relationship validation
  - prioritizes document-level then section-level cross-reference recovery
- `pipeline_overview/_index.md`
  - shared evaluation structure and dependencies

### Key evaluation facts
- judge failures yield `None`
- agent failures yield zero scores plus error explanation
- agent timeout is 180 seconds
- `primary_hit` is set when score is at least 2
- A/B retrieval results show that model choice alone is not the main bottleneck; the bottleneck is likely structural

### QA domain
- `playwright_e2e/_index.md` is the main UI test architecture entry
- `hallucination_verifier/_index.md` defines the final-answer-only verifier
- `launch_blockers/_index.md` ties remediation to trust and grounding failures

### Trust-chain conclusion
The repo treats trust as a chain:
1. retrieve evidence
2. verify or rewrite unsupported output
3. score only grounded answers

This is the same invariant enforced by evaluation, QA, and agent prompt rules.

## Frontend UI: runtime identity, persistence, and testing
**Drill down:** `frontend_ui/_index.md`

The frontend UI cluster centers on chat stability and the hidden dependency between auth, thread identity, and persisted state.

### Core contract
- thread identity, auth state, and cached UI state must stay aligned
- runtime identity must be recomputed on auth transitions
- structured message parts must survive reloads and remounts

### Major subtopics
- `chat_page_review_fixes.md`
  - `packages/web/src/app/chat/page.tsx` decomposed into:
    - `EmptyState`
    - `MessageList`
    - `ChatInput`
    - `ResearchTrace`
- `chat_page_scroll_stability.md`
  - keeps the sidebar visible while message history updates
  - prefers `viewport.scrollTo` over `scrollIntoView`
- `authenticated_chat_transport_reinitialization.md`
  - `threadId` becomes `threadId:resourceId`
  - `resourceId` defaults to `anonymous`
- `chat_thread_cache_restoration.md`
  - cached thread state restored after `useChat` recreation
- `message_persistence_parsing.md`
  - structured `UIMessage` reconstruction from persisted Mastra thread messages
- `message_citations/message_citation_resolution.md`
  - shared citation resolver used by markdown rendering and clipboard generation
- `message_feedback_flow.md`
  - feedback pipeline through LibSQL, API routes, client, and UI actions
- `thread_sidebar_fetch_resilience.md`
  - abortable thread fetches and auth-aware client recreation
- `proxy_handling/context.md`
  - Next.js 16 proxy migration with `authkitProxy`
- `web_theme_persistence.md`
  - cookie-first theme persistence, WorkOS metadata as secondary sync/backfill

### Structural conclusion
The UI is built around one hidden coupling: **runtime identity controls transport, cache validity, and restored state**.

## Facts and durable curation knowledge
**Drill down:** `facts/_index.md`

This domain records the curation discipline used to preserve project knowledge.

### Core conventions
- Raw Concept + Narrative + Facts is the standard knowledge shape
- Entries are organized as domain / topic / subtopic
- Verification is required after curation
- UPSERT-first is the default
- Single-pass mode is preferred when recon allows it
- Raw context should not be printed

### Project-level durable knowledge
- `environment_parsing_helpers_and_verifier_toggle.md`
  - env helper consolidation in `packages/agent/src/env.ts`
  - `boolEnv` and `intEnv` semantics
  - verifier remains enabled unless `VERIFIER_ENABLED === 'false'`
- `dependency_upgrade_migration_fixes.md`
  - migration compatibility fixes and blockers
- `policy_corpus_coverage_scoring.md`
  - ordered scoring behavior for coverage sections
  - exact anchored rules and weights
- `curated_context_snippet.*`
  - support durable knowledge extraction and storage patterns

### Cross-cutting curation rule
Knowledge entries here are meant to preserve exact technical constraints, runtime/type boundaries, defaults, blockers, and flag-gated logic as stable recall items.

## Main structural relationships to retain
- `agent_architecture` anchors agent behavior, curation, and research workflow rules.
- `auth_integration` and `frontend_ui` together define runtime identity correctness across backend auth and client transport.
- `database_operations` and `packages` define the graph retrieval, refresh, and ranking contract.
- `evaluation` and `qa` define the trust chain from retrieval to verified final answers.
- `facts` holds the durable knowledge model and the rules for curating the rest of the system.