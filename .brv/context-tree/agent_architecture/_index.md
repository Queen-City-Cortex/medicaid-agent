---
children_hash: 13e290aabbc2172895c88df0a692bac3b1a86732df91a08746c81c76656215a8
compression_ratio: 0.3331430745814307
condensation_order: 2
covers: [amendment_pipeline_and_prompt/_index.md, context.md, context/_index.md, local_dev_setup/_index.md, mastra_server_configuration/_index.md, navigate_tools/_index.md, nc_medicaid_agent/_index.md, neo4j_tool_output_validation/_index.md, packages_pipeline/_index.md, search_tooling/_index.md]
covers_token_total: 5256
summary_level: d2
token_count: 1751
type: summary
---
# agent_architecture structural overview

This d2 cluster captures the NC Medicaid Navigator’s core architecture, local/CI runtime contract, retrieval and citation correctness, and the knowledge-curation workflow that turns session context into durable records.

## Major areas

### `amendment_pipeline_and_prompt/_index.md`
- Canonical source is `amendment_pipeline_and_prompt_guardrails.md`, which replaced the older stubbed `context.md`.
- Covers NC Medicaid amendment-graph interpretation, authoritative change-summary extraction, and system-prompt guardrails for policy QA.
- Drill down here for pipeline details, traversal heuristics, prompt rules, examples, and facts.

### `context/_index.md`
- Documents the RLM curation workflow for converting supplied context into durable knowledge.
- Core pattern: **single-pass processing + precomputed recon + verification via curate results**.
- Key child entries:
  - `context.md` — umbrella topic for curation workflow framing and metadata.
  - `curated_context_extraction_notes.md` — authoritative current-session record with recon outcome, source references, and extracted context.
  - `curated_operational_knowledge.md` — session-level operational knowledge, including retrieval heuristics and message parsing behavior.
  - `epsdt_exception_completeness_workstream_e.md` — compact workstream-specific curated record.
- Shared workflow across the cluster: recon/context analysis → fact extraction → UPSERT-based curation → verification.

### `local_dev_setup/_index.md`
- Captures local startup and CI validation for the repository.
- `local_development_setup.md` defines the runtime contract for the NC Medicaid Navigator stacks: Neo4j, web, and agent.
- `env_consolidation/_index.md` establishes the root `.env` as the single source of truth for LLM API keys, WorkOS auth, and E2E credentials; package env files are absolute symlinks to the root file.
- `ci_workflow_concurrency_and_test_gates.md` defines the CI pipeline:
  - two jobs: `test` and parallel `docker-build` (“Production Docker builds”)
  - branch-safe concurrency with main branch runs never cancelled
  - lint/build/typecheck, JS tests, pipeline `pytest`, agent integration tests, and Docker build validation
  - no e2e CI job because `e2e/tests/auth.setup.ts` requires live WorkOS hosted-login credentials
- Relationship: local setup defines manual startup rules, CI hardens the same contract, and env consolidation bridges both.

### `mastra_server_configuration/_index.md`
- Canonical timeout tuning record for the NC Medicaid Navigator agent.
- Preserved facts: **10-minute timeout**, SSE lifecycle, and multi-step tool research exceeding **180 seconds**.
- Main point: server timeout was raised to support long-running research workflows and keep execution resilient.

### `navigate_tools/_index.md`
- Structural source of truth for the `getAmendments` Neo4j query behavior.
- Key behavior: uses **OPTIONAL MATCH** to retrieve amendment rows, then filters null rows so only meaningful amendment data remains.
- Also documents metadata mapping, authoritative document selection, and the rules/facts used to interpret amendment results.

### `nc_medicaid_agent/_index.md`
- Canonical implementation and hardening notes for the NC Medicaid Navigator agent.
- Major subareas:
  - `startup_and_web_ui_hardening.md` — startup/runtime hardening, env validation, Mastra config, server routes, web UI constraints, CLI behavior, and anti-hallucination guidance.
  - `cli_runner.md` — CLI execution flow, iteration behavior, memory payload requirements, `cli-${Date.now()}` thread behavior, `onIterationComplete` synthesis guardrail, and `closeDriver()` cleanup.
  - `libsql_storage_fix_for_railway.md` — Railway fix replacing DuckDB/MastraCompositeStore with LibSQL storage to avoid Alpine/musl crashes.
  - `ssa_and_cfr_reference_resolution_fixes.md` — citation correctness fixes for SSA/CFR resolution and re-ingestion.
  - `nc_medicaid_navigator_agent.md` — agent-level prompt and metadata guidance, including source_url support and response-format rules.
- Architectural pattern: runtime hardening, storage reliability, and citation correctness are treated as separate but connected concerns.

### `neo4j_tool_output_validation/_index.md`
- Neo4j-backed read-tool validation for policy/document retrieval.
- Preserves structured-query concerns: numeric normalization, Zod-compatible payloads, container-heading expansion, and organized context queries.
- Drill down to `neo4j_tool_output_validation.md` for the detailed validation behavior.

### `packages_pipeline/_index.md`
- Structural overview of retrieval backend behavior and SSA parsing fixes supporting policy-corpus search and citable statute ingestion.
- Core retrieval topic in `context.md`: Neo4j vector querying, `vectorScanK` overscan, fulltext recovery, and `sectionId` deduplication.
- `retrieval_fixes/_index.md` records the backend change to per-group retrieval:
  - iterate `profile.typeGroups`
  - overscan with `vectorScanK(profile.perGroupK)`
  - filter by `document_type` after retrieval
  - merge by `sectionId`, combine fulltext/expansion hits, rerank, then trim to `topK`
  - key limitation: Neo4j `queryNodes(k)` is global top-k, so per-group retrieval requires overscan
- `crawler_sync_behavior/_index.md` documents crawler sync lifecycle:
  - separate download and check phases
  - `skipIds` flow from download to check
  - deletion only after thresholded 404s
  - `HttpStatusError.statusCode`, default 404 removal threshold of 3, and Node 26 `better-sqlite3` 12 requirement
- `ssa_parser_subsection_splitting_fix.md` covers large USC/SSA section splitting:
  - only split sections over `SUBSECTION_SPLIT_MIN_CHARS` (30,000)
  - preserve parent text and IDs
  - only top-level lettered subsections become children
  - strict sequence `a -> b -> ... -> z -> aa -> ...`
  - post-change workflow requires `ingest-ssa` and embed
- Overall relationship: retrieval coverage, crawl sync behavior, and subsection splitting are coordinated to keep search reliable and citations stable.

### `search_tooling/_index.md`
- Canonical topic for the hybrid policy search tool.
- Combines Voyage embeddings, per-type-group vector search, concept graph matching, reciprocal rank fusion, and Neo4j indexes.
- Includes the `searchSections` flow, rules, and facts; consolidated from the older `agent_architecture/search_tooling/context.md`.

## Cross-cutting relationships

- `context/` is the durable knowledge-management layer; it captures how context is transformed into curated records.
- `local_dev_setup/`, `mastra_server_configuration/`, and `nc_medicaid_agent/` define runtime correctness for local startup, CI, storage, and agent behavior.
- `packages_pipeline/`, `navigate_tools/`, `search_tooling/`, and `neo4j_tool_output_validation/` describe the retrieval stack and its correctness rules.
- `amendment_pipeline_and_prompt/` connects policy amendment interpretation to prompt guardrails and summary extraction.