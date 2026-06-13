---
children_hash: c9a4ba8a6f29271a91fc644243f9f215de663c0e5802ef5bc9b1cf0000682970
compression_ratio: 0.4577187807276303
condensation_order: 2
covers: [amendment_pipeline_and_prompt/_index.md, context.md, context/_index.md, local_dev_setup/_index.md, mastra_server_configuration/_index.md, navigate_tools/_index.md, nc_medicaid_agent/_index.md, neo4j_tool_output_validation/_index.md, packages_pipeline/_index.md, search_tooling/_index.md]
covers_token_total: 4068
summary_level: d2
token_count: 1862
type: summary
---
# agent_architecture

This domain captures the NC Medicaid Navigator’s architecture, runtime hardening, retrieval behavior, and operational guardrails. The child entries form a layered map from domain-level purpose into concrete implementation notes and canonical drill-down files.

## Core architectural and operational clusters

### `context/_index.md`
Durable operational knowledge for cross-cutting retrieval, parsing, and curation workflow patterns. It preserves:
- `hybrid policy search` as a primary retrieval pattern
- legacy fallback behavior in message parsing
- structured curation workflow: `context input -> extract factual statements -> group by subject -> upsert curated knowledge`
It relates directly to `agent_architecture/packages_pipeline/retrieval_fixes.md`, `frontend_ui/message_persistence_parsing/message_persistence_parsing.md`, and `agent_architecture/context.md`.

### `amendment_pipeline_and_prompt/_index.md`
Canonical source for amendment-graph interpretation and prompt guardrails. Drill down to `amendment_pipeline_and_prompt_guardrails.md` for:
- amendment pipeline details
- traversal heuristics
- system prompt rules
- examples and preserved facts
This topic is the authority for policy QA around amendment-summary extraction.

### `local_dev_setup/_index.md`
Documents local development requirements for starting the NC Medicaid Navigator stack. Key decisions:
- root `.env` is the single source of truth
- `packages/agent/.env` and `packages/web/.env.local` are absolute symlinks to the root `.env`
- circular symlink chains were removed by recreating the real root `.env`
Operationally, the setup depends on coordinated startup of Neo4j, the web app, and the agent stack, with docker compose, workspace scripts, and Neo4j service configuration as part of the workflow.

### `mastra_server_configuration/_index.md`
Canonical timeout-tuning record for Mastra server execution. It preserves the decision to raise the server timeout to support long-running multi-step research workflows:
- 10-minute timeout
- SSE lifecycle awareness
- multi-step tool research exceeding 180 seconds

### `navigate_tools/_index.md`
Source of truth for `getAmendments` Neo4j query behavior. The tool:
- uses `OPTIONAL MATCH` to retrieve amendment rows
- filters null rows so only meaningful amendment data remains
- maps metadata and selects authoritative documents
- applies rules/facts that govern amendment interpretation

### `neo4j_tool_output_validation/_index.md`
Validation record for Neo4j-backed read tools. It focuses on:
- numeric normalization / `Integer` conversion for schema acceptance
- Zod-compatible payloads
- container-heading expansion
- structured context queries
Use the consolidated `neo4j_tool_output_validation.md` for detail.

## Agent runtime and hardening

### `nc_medicaid_agent/_index.md`
The main implementation cluster for the NC Medicaid Navigator agent. It consolidates runtime behavior, deployment fixes, citation resolution, and CLI safeguards.

- `startup_and_web_ui_hardening.md`
  Broad runtime hardening reference covering:
  - env validation and startup checks
  - Mastra configuration for memory, tools, and server
  - server routes and web UI constraints
  - CLI runner behavior
  - anti-hallucination and system prompt rules

- `cli_runner.md`
  Canonical CLI execution and memory reference. Preserved facts include:
  - step iteration behavior
  - CLI memory payload requirements
  - `cli-${Date.now()}` thread behavior
  - `onIterationComplete` synthesis guardrail for `MAX_STEPS`
  - `closeDriver()` cleanup

- `libsql_storage_fix_for_railway.md`
  Deployment fix for Railway:
  - replaced DuckDB / `MastraCompositeStore` with `LibSQLStore`
  - avoids Alpine/musl native binding crashes
  - storage/exporter paths now route through LibSQL
  - canonical files: `packages/agent/src/index.ts`, `packages/agent/package.json`

- `ssa_and_cfr_reference_resolution_fixes.md`
  Canonical fix set for citation resolution and re-ingestion behavior:
  - SSA-to-USC mappings, including `SSA 1944 -> USC 1396w-3a`
  - parser robustness for italicized USC section headings
  - full section text preserved by removing the 50K truncation cap
  - CFR matching for `C.F.R.` and `Part X` forms
  - part-level-only supersession redirects
  - re-ingestion flow: `ingest-ssa --refresh -> extract-refs -> embed`

- `nc_medicaid_navigator_agent.md`
  Agent-level prompt and metadata guidance, including:
  - `source_url` support for clickable citations
  - startup/model/storage/memory/server configuration
  - tool taxonomy
  - amendment verification
  - anti-hallucination rules
  - required response-format rules

## Retrieval and pipeline behavior

### `packages_pipeline/_index.md`
Broad structural overview of retrieval backend behavior and scoring adjustments.

Key themes:
- Neo4j vector retrieval coverage requires per-group overscan because `queryNodes(k)` returns global top-k
- hybrid merging dedupes and reranks by `sectionId`
- crawler sync behavior is split into download and check phases to avoid duplicate work and premature deletion

Drill-down entries:
- `crawler_sync_behavior/_index.md`
  - `SyncStats`, `SyncContext`, `applyResult`, `processDocuments`, `runDownloadPhase`, `runCheckPhase`
  - download and check phases are separated
  - `skipIds` carries processed IDs between phases
  - 404s are only acted on after thresholding
  - default removal threshold is 3 consecutive 404s
  - HTML payloads are rejected for binary-only families
  - `better-sqlite3` 12 is required for Node 26

- `retrieval_fixes/_index.md`
  - `packages/policy-corpus/src/retrieval/backends/section-vector.ts`
  - `packages/policy-corpus/src/retrieval/collector.ts`
  - per-group vector overscan via `vectorScanK(profile.perGroupK)`
  - filter by `document_type` after retrieval
  - merge hits by `sectionId`
  - include fulltext and expansion hits
  - rerank before final `topK`
  - use overscan-first, filter-later retrieval with `sectionId` as the merge boundary

Cross-cutting retrieval pattern:
- `query analysis -> per-group vector overscan -> group filter -> merge by sectionId -> fulltext merge -> rerank -> topK`

### `search_tooling/_index.md`
Authoritative topic for the hybrid policy search tool. It covers:
- Voyage embeddings
- per-type-group vector search
- concept graph matching
- reciprocal rank fusion
- Neo4j indexes
- `searchSections` flow, rules, and facts
It was merged from `agent_architecture/search_tooling/context.md` during consolidation.

## Structural relationships

- `context/_index.md` acts as the durable operational anchor across retrieval, parsing, and curation conventions.
- `amendment_pipeline_and_prompt/_index.md` and `navigate_tools/_index.md` focus on amendment interpretation, with one centered on prompt/pipeline guardrails and the other on tool-level Neo4j behavior.
- `local_dev_setup/_index.md`, `mastra_server_configuration/_index.md`, and `nc_medicaid_agent/_index.md` together describe runtime readiness: environment setup, server timeout resilience, and agent execution hardening.
- `packages_pipeline/_index.md` and `search_tooling/_index.md` both capture retrieval architecture, but `packages_pipeline` emphasizes backend mechanics and pipeline safety while `search_tooling` emphasizes the end-user hybrid search surface.
- `neo4j_tool_output_validation/_index.md` supports the retrieval stack by validating query payload shape and numeric normalization.