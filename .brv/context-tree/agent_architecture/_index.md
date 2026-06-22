---
children_hash: 3d24937835aeb1738889c9dafee9edfa484699a21403367977939cdd01de2a4d
compression_ratio: 0.3358437935843794
condensation_order: 2
covers: [amendment_pipeline_and_prompt/_index.md, context.md, context/_index.md, deep_research_workflow/_index.md, local_dev_setup/_index.md, mastra_server_configuration/_index.md, navigate_tools/_index.md, nc_medicaid_agent/_index.md, neo4j_tool_output_validation/_index.md, packages_pipeline/_index.md, runtime-boundary-bugs-cluster-around-deploy-auth-and-database-initialization.md, search_tooling/_index.md]
covers_token_total: 7170
summary_level: d2
token_count: 2408
type: summary
---
# Structural Summary: Level d2

This set of entries documents the NC Medicaid Navigator’s architecture, retrieval pipeline, and operational guardrails. The shared pattern across the tree is consolidation of detailed child records into canonical drill-down topics, with preserved implementation facts, workflow decisions, and maintenance rules.

## 1) Agent architecture and operational guardrails

### `amendment_pipeline_and_prompt/_index.md`
- Canonical source is `amendment_pipeline_and_prompt_guardrails.md`, replacing the older stub.
- Scope centers on:
  - NC Medicaid amendment-graph interpretation
  - authoritative change-summary extraction
  - system-prompt guardrails for policy QA
- Preserve drill-down detail for pipeline steps, traversal heuristics, prompt rules, examples, and facts.

### `context/_index.md`
- Captures the RLM single-pass curation workflow and session-level durable knowledge.
- Core pattern:
  - precomputed recon
  - single-pass processing when context is compact enough
  - extraction, dedup/group, UPSERT curate, verify applied file paths
- Important records:
  - `context.md`: central single-pass pattern and context-size metadata use
  - `curated_context_extraction_notes.md`: explicit curation session notes and recon recommendation
  - `curated_operational_knowledge.md`: durable workflow knowledge and verification-by-applied-paths
  - `epsdt_exception_completeness_workstream_e.md`: lighter workstream-specific knowledge entry
- Shared theme: preserve operational knowledge as durable context instead of chat memory.

### `mastra_server_configuration/_index.md`
- Canonical timeout-tuning entry for the NC Medicaid Navigator agent.
- Key facts preserved:
  - Mastra server timeout set to **10 minutes**
  - driven by **SSE lifecycle**
  - supports **multi-step tool research exceeding 180 seconds**
- The main rationale is resilience for long-running research workflows.

### `navigate_tools/_index.md`
- Authoritative topic for `getAmendments` Neo4j query behavior.
- Core mechanics:
  - uses **OPTIONAL MATCH**
  - applies **null-row filtering**
  - preserves metadata mapping and authoritative document selection rules
- Drill down for exact amendment interpretation and result rules.

### `neo4j_tool_output_validation/_index.md`
- Focuses on Neo4j-backed read-tool validation for policy/document retrieval.
- Key preserved themes:
  - numeric normalization / `Integer` conversion for schema acceptance
  - Zod-compatible payloads
  - container-heading expansion
  - structured context query organization

## 2) Agent runtime, CLI, storage, and citation correctness

### `nc_medicaid_agent/_index.md`
- Consolidates the main NC Medicaid Navigator agent implementation and hardening notes.
- Main child topics:
  - `startup_and_web_ui_hardening.md`: startup checks, Mastra config, web UI constraints, system prompt rules
  - `cli_runner.md`: CLI iteration behavior, memory payload requirements, `cli-${Date.now()}` thread behavior, `onIterationComplete` guardrail, cleanup
  - `libsql_storage_fix_for_railway.md`: Railway fix replacing DuckDB/MastraCompositeStore with LibSQL
  - `ssa_and_cfr_reference_resolution_fixes.md`: SSA/CFR parser and citation resolution fixes
  - `nc_medicaid_navigator_agent.md`: agent prompt and metadata guidance
- Key architecture decisions:
  - LibSQL is the persistence backend used to avoid Alpine/musl DuckDB crashes
  - the CLI runner preserves memory, completes iterations safely, and shuts down cleanly
  - citation correctness depends on SSA/CFR reference resolution fixes and prompt guidance

### Cross-entry relation
- `runtime-boundary-bugs-cluster-around-deploy-auth-and-database-initialization.md` ties together the recurring failure mode across auth, database, and agent startup:
  - build-time assumptions used where runtime state is required
  - live callback origin resolution
  - Neo4j volume initialization behavior
  - centralized `.env` as runtime contract
- This cluster reinforces the same operational principle seen throughout the architecture entries: respect live runtime boundaries.

## 3) Local development, CI, and environment management

### `local_dev_setup/_index.md`
- Repository-level operational guidance for bringing up and validating the local development environment.
- Main child entries:
  - `local_development_setup.md`: umbrella guide for Neo4j, web, agent, Docker Compose, workspace scripts, env placement, and dev workflow rules
  - `ci_workflow_concurrency_and_test_gates.md`: CI structure and deployment-safe gating
  - `env_consolidation/_index.md`: centralized environment configuration
  - `repository_doc_audit_findings.md`: documentation maintenance and audit results
- Key decisions:
  - CI uses a main `test` job plus a parallel `docker-build` job
  - PR/branch runs may be canceled, but main runs must not be canceled because Railway deploys are commit-specific
  - the root `.env` is the single source of truth, with package env files as symlinks
  - docs must distinguish living references from historical records

### `local_dev_setup/env_consolidation/_index.md`
- Centralized configuration model:
  - root `.env` is authoritative
  - `packages/agent/.env` and `packages/web/.env.local` are absolute symlinks
  - prior circular symlink chain was removed
- This supports consistent runtime behavior across the repo.

### `local_dev_setup/repository_doc_audit_findings.md`
- Preserves the doc-maintenance rule that living docs must stay synchronized with code.
- Audit results:
  - `README.md` and `RUNBOOK.md` verified accurate
  - `packages/web/README.md` was stale and corrected
  - stale theme persistence description was fixed to reflect cookie-first behavior with WorkOS metadata only for cross-device sync/backfill
- Also confirms crawler CLI commands remained valid after the `cli/` split.

## 4) Retrieval, parsing, and crawler pipeline

### `packages_pipeline/_index.md`
- Structural overview of retrieval and parsing knowledge, split between:
  - policy corpus retrieval behavior
  - SSA statute subsection parsing
- Main child topics:
  - `context.md`: top-level retrieval scope and concepts
  - `retrieval_fixes/_index.md` → `retrieval_fixes.md`: coverage-preserving vector retrieval architecture
  - `crawler_cli_and_package_docs.md`: crawler CLI structure and package docs conventions
  - `crawler_sync_behavior/_index.md` → `crawler_sync_behavior.md`: sync lifecycle, 404 handling, lazy filename tracking
  - `ssa_parser_subsection_splitting_fix.md`: stable SSA child subsection splitting
- Important architectural relationships:
  - `queryNodes(k)` is insufficient alone because it is global top-k
  - per-group overscan and sectionId deduplication are required for retrieval coverage
  - crawler docs and crawler sync behavior describe different layers of the same system
  - SSA parser changes preserve stable section identities through ingest and embedding

### `search_tooling/_index.md`
- Authoritative topic for the hybrid policy search tool.
- Key mechanisms preserved:
  - Voyage embeddings
  - per-type-group vector search
  - concept graph matching
  - reciprocal rank fusion
  - Neo4j indexes
- Use `hybrid_policy_search_tool.md` for `searchSections` flow, rules, and facts.

## 5) Deep research workflow and fixes

### `deep_research_workflow/_index.md`
- Documents the Mastra vNext deep research pipeline and later fixes.
- Core workflow:
  - **plan → plan-approval → research → synthesize → verify**
  - includes HITL approval suspend/resume before research
  - research runs parallel fan-out over sub-questions with bounded reflection and novelty-based stopping
  - synthesize produces a cited markdown report
  - verify can rewrite or score the result against sources
- Important implementation facts:
  - `agent.generate(...)` returns `FullOutput` with `.object`, `.text`, and `.toolResults`
  - `createStep` receives `{ inputData, resumeData, suspend, writer, mastra, bail }`
  - `writer.write(data)` must be awaited
  - suspend payloads are keyed by step ID
  - model type export must be `ReturnType<ReturnType<typeof createOpenAI>>`
- Fixes and hardening:
  - worker guard via `onIterationComplete`
  - `WORKER_MAX_STEPS` increased from 12 to 16
  - deterministic `validateAnswerUrls` grounding replaces chat-tuned verification
  - `decline()` now sets cancelled immediately
  - `sourceLabel(SourceEntry)` converts raw corpus evidence into human-readable labels
- Shared surfaces:
  - `packages/agent/src/deep-research/workflow.ts`
  - `packages/agent/src/deep-research/agents.ts`
  - `packages/agent/src/deep-research/config.ts`
  - `packages/agent/src/deep-research/schemas.ts`
  - `packages/agent/src/model.ts`
  - `packages/web/src/lib/use-deep-research.ts`

## 6) Topic relationships and drill-down order

- Start with **`context.md`** for the core curation workflow and durable operational knowledge.
- Use **`amendment_pipeline_and_prompt_guardrails.md`** for amendment interpretation and prompt guardrails.
- Use **`local_development_setup.md`** and **`ci_workflow_concurrency_and_test_gates.md`** for repo operations and deployment safety.
- Use **`startup_and_web_ui_hardening.md`**, **`cli_runner.md`**, and **`libsql_storage_fix_for_railway.md`** for runtime, CLI, and storage behavior.
- Use **`retrieval_fixes.md`**, **`crawler_sync_behavior.md`**, and **`ssa_parser_subsection_splitting_fix.md`** for pipeline correctness.
- Use **`deep_research_workflow.md`** first, then **`deep_research_workflow_fixes.md`** for the corrected workflow and guardrails.
- Use **`hybrid_policy_search_tool.md`** for the search stack’s retrieval and ranking design.