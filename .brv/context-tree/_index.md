---
children_hash: f0389ccb80561541734705ad3514a71049009af7827db9881aa46339d8ad12ca
compression_ratio: 0.12726047981760713
condensation_order: 3
covers: [agent_architecture/_index.md, amendment_detection/_index.md, architecture/_index.md, auth_integration/_index.md, database_operations/_index.md, evaluation/_index.md, facts/_index.md, frontend_ui/_index.md, packages/_index.md, packages_pipeline/_index.md, qa/_index.md]
covers_token_total: 19299
summary_level: d3
token_count: 2456
type: summary
---
# d3 Structural Summary

This cluster is the repository’s broad architectural map. It ties together agent/runtime correctness, retrieval and graph pipeline design, evaluation and QA, and durable curation rules. The repeated system-wide pattern is **staged, validated, runtime-aware processing** rather than single-pass or build-time assumptions.

## Core architectural themes

- **Runtime-boundary correctness** is a recurring root cause and fix pattern across auth, deployment, chat transport, and database initialization.
- **Staged retrieval** is the project’s retrieval contract: collect broadly, filter/dedupe, rerank/fuse, then evaluate.
- **Schema-aware validation** protects graph writes, retrieval, and scoring from malformed or incomplete data.
- **Trust is a chain**: retrieve evidence, verify or rewrite unsupported output, then score grounded answers.
- **Durable knowledge curation** uses a structured Raw Concept + Narrative + Facts model with UPSERT-first workflows.

## Major domain clusters

### `agent_architecture`
Drill down: `context.md`, `context/_index.md`, `deep_research_workflow/_index.md`, `amendment_pipeline_and_prompt/_index.md`, `mastra_server_configuration/_index.md`, `search_tooling/_index.md`, `nc_medicaid_agent/_index.md`, `packages_pipeline/_index.md`, `navigate_tools/_index.md`, `neo4j_tool_output_validation/_index.md`

- Defines the agent’s bootstrapping, memory setup, tool wiring, prompt guardrails, and citation rules.
- Preserves curation workflow knowledge: recon → extract → dedup/group → UPSERT → verify by applied file paths.
- Holds the deep research pipeline:
  - `plan -> plan-approval -> research -> synthesize -> verify`
  - human-in-the-loop approval before research
  - parallel fan-out, bounded reflection, and novelty-based stopping
- Hardening adds:
  - longer worker budgets
  - deterministic answer URL validation
  - improved cancel behavior
  - model routing based on OpenAI `o1/o3/o4` prefixes vs Anthropic routing
- Server and runtime topics preserve operational limits such as the **10-minute timeout** and SSE lifecycle handling.
- Search and amendment tooling emphasize hybrid policy search, Neo4j-backed validation, and authority-aware amendment interpretation.

### `amendment_detection`
Drill down: `context.md`, `pipeline_detection/_index.md`, `amendment_detection_pipeline.md`

- Graph-based DHHS amendment detection for Medicaid docs.
- Main flow:
  - scan for change notices and revised SPAs
  - extract MA/SPA references plus surrounding sentence context
  - create `AMENDS` edges in Neo4j
  - mark source documents as `status="amendment"`
- Preserves detection helpers, signal-section preference, deduplicated edge writes, and sentence-boundary fixes for dotted MA identifiers.

### `architecture`
Drill down: `refactoring_audit/_index.md`

- Tracks repo-wide refactoring themes:
  - rules-as-data over rules-as-code
  - canonical shared types/helpers
  - import-cycle and resolver safety
  - test-fixture hardening
- Key outcomes include table-driven checklist generation, shared `AnswerFrame` types, centralized path normalization, and validation against API drift in test fakes.
- Preserves the rule that ordered logic matters where truncation or fold-order effects exist.

### `auth_integration`
Drill down: `context.md`, `runtime_boundary_fixes/_index.md`, `workos_authkit_nextjs/_index.md`, and related runtime-boundary entries

- Central rule: **do not trust build-time values for runtime-only data**.
- Covers:
  - callback origin resolution
  - public vs internal host handling
  - root `.env` as the source of truth
  - chat transport reinitialization on auth changes
  - Neo4j first-initialization vs live credential updates
- Shared fixes include dynamic baseURL resolution, symlinked package env files, auth-aware transport recreation, and credential updates via live database operations.

### `database_operations`
Drill down: `context.md`, `neo4j_auth/_index.md`, `neo4j_hybrid_search/_index.md`, `neo4j_write_read_consistency/_index.md`, plus schema-aware validation entries

- Focuses on Neo4j reliability, Railway-specific auth behavior, and safe graph mutation.
- Key facts:
  - `NEO4J_AUTH` only applies on first volume initialization
  - Railway can corrupt passwords via URL decoding of `+`
  - safe remediation uses alphanumeric passwords and live password changes through the bolt proxy
- Hybrid search combines section embeddings, chunk embeddings, concept graph matches, and fulltext hits with Reciprocal Rank Fusion.
- Write/read consistency centers on a single write boundary, managed transactions, incremental invalidation, and surgical cleanup.
- Schema-aware validation is the shared safeguard across graph writes, retrieval, and evaluation.

### `evaluation`
Drill down: `answer_quality/_index.md`, `cross_reference_resolution/_index.md`, `pipeline_overview/_index.md`

- Measures correctness against golden entries rather than narrative quality.
- Level 3 answer-quality evaluation:
  - agent invocation
  - Neo4j evidence retrieval
  - `judge_answer`
  - metric aggregation
  - HTTP-first with CLI fallback
- Level 2 cross-reference resolution:
  - document-level `REFERENCES_DOCUMENT` and `AMENDS`
  - section-level `REFERENCES`
  - precision/recall over resolved vs missed references
- Includes an embeddings A/B result showing `voyage-4-large` was effectively a wash versus `voyage-law-2`.

### `facts`
Drill down: `conventions/_index.md`, `project/_index.md`, `context.md`, `curated_context_snippet.abstract.md`, `curated_context_snippet.overview.md`, `dependency_upgrade_migration_fixes.md`, `environment_parsing_helpers_and_verifier_toggle.md`, `policy_corpus_coverage_scoring.md`

- Preserves durable curation rules and project-specific operational facts.
- Canonical model:
  - Raw Concept
  - Narrative
  - Facts
- Important conventions:
  - UPSERT-first
  - single-pass when recon recommends it
  - avoid raw context dumps
  - verify via `result.summary.failed` and `result.applied`
- Project notes capture env parsing helpers, verifier toggles, dependency migration blockers, and policy corpus scoring behavior.

### `frontend_ui`
Drill down: `chat_page_review_fixes/_index.md`, `chat_page_scroll_stability/_index.md`, `chat_page_thread_cache/_index.md`, `chat_page_transport/_index.md`, `message_citations/_index.md`, `message_feedback/_index.md`, `proxy_handling/_index.md`, `design_system/_index.md`, `thread_sidebar/_index.md`

- Main theme: chat UI stability depends on **runtime identity** staying aligned across auth, transport, cache, and persistence.
- Key behaviors:
  - split chat page into smaller components
  - keep sidebar and scroll behavior stable
  - recreate `DefaultChatTransport` when auth/resource identity changes
  - restore thread cache after `useChat` recreation
  - preserve structured message parts, citations, and verification badges across reloads
- Test and dev support includes preview galleries, Playwright design tests, auth-aware thread fetches, and Next.js proxy/authkit migration handling.
- Theme persistence is cookie-first, with WorkOS metadata used as sync/backfill.

### `packages`
Drill down: `crawler/_index.md`, `pipeline/_index.md`, `policy_corpus/_index.md`, `retrieval_quality/_index.md`, `retrieval_fixes/_index.md`

- This is the project’s retrieval and pipeline backbone.
- Broad pattern:
  - query intent
  - candidate scoring
  - vector overscan
  - topical filtering
  - dedupe by stable section identity
  - rerank/fuse
  - evaluate on the correct layer
- `crawler/_index.md` hardens fetching with a private undici dispatcher to avoid global-state issues.
- `policy_corpus/_index.md` is the main retrieval architecture summary, including coverage routing, document selection, frame assembly, rerank gating, and ordered rule tables.
- `pipeline/_index.md` preserves CLI package split behavior and AB evaluation gates.
- `retrieval_fixes/_index.md` documents collector-stage merge-max semantics, fulltext recovery, and deterministic final ranking.

### `qa`
Drill down: `playwright_e2e/_index.md`, `hallucination_verifier/_index.md`, `evaluation_pipeline/_index.md`, `launch_blockers/_index.md`

- End-to-end trust pipeline for the UI:
  - retrieve evidence
  - verify or rewrite unsupported output
  - score only grounded answers
- Playwright E2E structure includes mocked and smoke projects, Mastra streaming mocks, memory API mocks, and page objects for chat/sidebar workflows.
- Hallucination verification is final-answer only, rewrite-based, and machine-parsed through stable CLI markers.
- QA and evaluation are linked as a single correctness chain rather than separate checks.

## Cross-cutting relationships to retain

- `agent_architecture` and `facts` define the curation and operational knowledge model.
- `auth_integration`, `frontend_ui`, and `database_operations` share the same runtime-boundary correctness principle.
- `packages`, `database_operations`, and `evaluation` are tied together by staged retrieval and schema-aware validation.
- `qa` depends on the evidence and verification contracts established in `agent_architecture`, `evaluation`, and `database_operations`.
- `amendment_detection` and `navigate_tools` are specialized graph/pipeline views supporting the broader retrieval and amendment workflow.

## Drill-down map

- **Agent/runtime architecture** → `agent_architecture/*`, `auth_integration/*`, `nc_medicaid_agent/*`, `mastra_server_configuration/*`
- **Graph and database operations** → `database_operations/*`, `neo4j_*`
- **Retrieval and pipeline behavior** → `packages/*`, `search_tooling/*`, `navigate_tools/*`
- **Evaluation and QA** → `evaluation/*`, `qa/*`
- **Curation rules and durable facts** → `facts/*`
- **UI runtime stability** → `frontend_ui/*`
- **Amendment detection** → `amendment_detection/*`