---
children_hash: 63b4e895e2c23e9e0446baabfe5a43776fe9cb7de16b21e6ed7952e6fc3d99c4
compression_ratio: 0.33870402802101574
condensation_order: 2
covers: [amendment_pipeline_and_prompt/_index.md, context.md, context/_index.md, local_dev_setup/_index.md, mastra_server_configuration/_index.md, navigate_tools/_index.md, nc_medicaid_agent/_index.md, neo4j_tool_output_validation/_index.md, packages_pipeline/_index.md, runtime-boundary-bugs-cluster-around-deploy-auth-and-database-initialization.md, search_tooling/_index.md]
covers_token_total: 5710
summary_level: d2
token_count: 1934
type: summary
---
# agent_architecture — Structural Summary

This level-d2 cluster groups the NC Medicaid Navigator’s architecture, runtime hardening, retrieval, and curation knowledge. The dominant pattern is **runtime-boundary correctness**: many fixes ensure the system uses live runtime state, not build-time assumptions, and that knowledge is preserved as durable, drill-downable entries.

## Top-level structure

- **`context/`** — Operational curation knowledge and durable recall for context extraction workflows.
- **`amendment_pipeline_and_prompt/`** — Amendment-graph interpretation and system-prompt guardrails for policy QA.
- **`local_dev_setup/`** — Local runtime setup, env consolidation, and CI gate alignment.
- **`mastra_server_configuration/`** — Server timeout tuning for long-running agent workflows.
- **`navigate_tools/`** — Neo4j amendment retrieval behavior for `getAmendments`.
- **`nc_medicaid_agent/`** — Core agent runtime, storage fixes, citation resolution, and CLI hardening.
- **`neo4j_tool_output_validation/`** — Read-tool payload validation and structured query normalization.
- **`packages_pipeline/`** — Retrieval backend behavior, crawl sync, and SSA parsing fixes.
- **`search_tooling/`** — Hybrid policy search ranking and retrieval signal combination.

## Shared architectural themes

### Runtime and deployment boundaries
- The cluster repeatedly documents failures caused by assuming **static config** where **runtime state** is required.
- `runtime-boundary-bugs-cluster-around-deploy-auth-and-database-initialization.md` ties together:
  - auth callback origin resolution
  - Neo4j password initialization on existing volumes
  - `.env` as the single source of truth for local/runtime consistency
- This theme is reinforced by:
  - `local_dev_setup/local_development_setup.md`
  - `auth_integration/...` references in the synthesis
  - `nc_medicaid_agent/libsql_storage_fix_for_railway.md`

### Durable curation and single-pass workflow
- `context/` documents a curation workflow centered on:
  - **single-pass processing**
  - **precomputed recon**
  - **verification via applied output paths**
  - preserving extracted context as durable knowledge rather than chat-only notes
- Key drill-down entries:
  - `context.md`
  - `curated_context_extraction_notes.md`
  - `curated_operational_knowledge.md`
  - `epsdt_exception_completeness_workstream_e.md`

### Retrieval correctness and ranking stability
- `packages_pipeline/` and `search_tooling/` both focus on making policy retrieval reliable and citable.
- Important patterns:
  - overscan then filter, rather than naive global top-k
  - dedup by `sectionId`
  - preserve fulltext hits with boosting
  - stable subsection splitting for large statute sections
- These entries form the retrieval backbone for policy search and ingestion.

## Key topic drill-down map

### `context/`
Operational curation knowledge for extracting and preserving context.
- **`context.md`**: topic overview for single-pass RLM curation with precomputed recon.
- **`curated_context_extraction_notes.md`**: extraction workflow, context sizing, and verification rules.
- **`curated_operational_knowledge.md`**: session-level workflow, dedup/group, UPSERT, verify-applied-paths sequence.
- **`epsdt_exception_completeness_workstream_e.md`**: workstream-specific durable recall for EPSDT exception completeness.

### `amendment_pipeline_and_prompt/`
Canonical source for amendment interpretation and prompt guardrails.
- **`amendment_pipeline_and_prompt_guardrails.md`**: authoritative detail source; consolidates the older stub.
- Core scope: NC Medicaid amendment-graph interpretation, authoritative change-summary extraction, prompt rules, traversal heuristics, and examples.

### `local_dev_setup/`
Local runtime and CI contract for the repo.
- **`local_development_setup.md`**: local startup for Neo4j, web, and agent stacks.
- **`env_consolidation/_index.md`**: root `.env` is the single source of truth; package env files are symlinks.
- **`ci_workflow_concurrency_and_test_gates.md`**: CI pipeline structure, concurrency rules, test gates, and Docker build validation.

### `mastra_server_configuration/`
Server timeout tuning for long-running research flows.
- **`mastra_server_timeout_tuning.md`**: sets a **10-minute timeout** to support SSE lifecycle and multi-step research exceeding 180 seconds.

### `navigate_tools/`
Amendment retrieval logic for the `getAmendments` tool.
- **`getamendments_optional_match_filtering.md`**: uses **OPTIONAL MATCH** plus null-row filtering, with metadata mapping and authoritative document selection.

### `nc_medicaid_agent/`
Canonical agent runtime, hardening, and correction notes.
- **`startup_and_web_ui_hardening.md`**: startup checks, memory/tool/server config, web UI constraints, CLI behavior, and anti-hallucination guardrails.
- **`cli_runner.md`**: CLI iteration flow, memory payloads, `cli-${Date.now()}` thread behavior, `onIterationComplete` guardrail, `closeDriver()`.
- **`libsql_storage_fix_for_railway.md`**: switches from DuckDB/MastraCompositeStore to **LibSQLStore** to avoid Alpine/musl crashes on Railway.
- **`ssa_and_cfr_reference_resolution_fixes.md`**: SSA-to-USC mapping, CFR parsing, supersession redirects, and re-ingestion pipeline correctness.
- **`nc_medicaid_navigator_agent.md`**: agent prompt and metadata guidance, including `source_url`, citation rules, and anti-hallucination constraints.

### `neo4j_tool_output_validation/`
Validation layer for policy/document retrieval outputs.
- Preserves:
  - numeric normalization / `Integer` conversion for schema acceptance
  - Zod-compatible payload structure
  - container-heading expansion
  - structured context query organization

### `packages_pipeline/`
Retrieval backend, crawl sync, and SSA ingestion fixes.
- **`context.md`**: package-level retrieval focus, including `vectorScanK`, fulltext recovery, and `sectionId` deduplication.
- **`retrieval_fixes/_index.md`**: per-type-group overscan in `section-vector.ts`, merge-and-rerank behavior, and `FULLTEXT_BOOST`.
- **`crawler_sync_behavior/_index.md`**: download/check phase separation, `skipIds`, and 404 removal threshold behavior.
- **`ssa_parser_subsection_splitting_fix.md`**: large-SSA subsection splitting rules, strict letter sequencing, parent text retention, and ID stability.

### `search_tooling/`
Hybrid policy search architecture.
- **`hybrid_policy_search_tool.md`**: combines Voyage embeddings, per-type-group vector search, concept graph matching, reciprocal rank fusion, and Neo4j indexes.
- The `searchSections` flow and ranking rules are the core drill-down targets.

## Cross-cutting relationships

- **Local setup ↔ CI**: `local_dev_setup` and the CI section of the cluster describe the same runtime contract from manual and automated angles.
- **Runtime boundaries ↔ auth/db fixes**: deploy/auth/database issues recur when runtime state is treated as build-time configuration.
- **Retrieval pipeline ↔ search tooling**: `packages_pipeline` handles ingestion and backend retrieval stability; `search_tooling` handles ranking and signal fusion.
- **Curation workflow ↔ durable recall**: `context/` acts as the record of how compact operational knowledge is converted into reusable architecture notes.

## Drill-down priorities

- For curation workflow and extracted operational knowledge: **`context/`**
- For amendment interpretation and prompt guardrails: **`amendment_pipeline_and_prompt/`**
- For local runtime and CI rules: **`local_dev_setup/`**
- For agent runtime, storage, and citation correctness: **`nc_medicaid_agent/`**
- For retrieval backend and SSA ingestion behavior: **`packages_pipeline/`**
- For hybrid policy search ranking: **`search_tooling/`**