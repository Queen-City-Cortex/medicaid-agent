---
children_hash: 4716f2cb4f910459f61b79ed3f20e78f367fcbfacab0bc7f39355ccecf55aa17
compression_ratio: 0.23170116102978294
condensation_order: 2
covers: [amendment_pipeline_and_prompt/_index.md, context.md, context/_index.md, local_dev_setup/_index.md, mastra_server_configuration/_index.md, navigate_tools/_index.md, nc_medicaid_agent/_index.md, neo4j_tool_output_validation/_index.md, packages_pipeline/_index.md, runtime-boundary-bugs-cluster-around-deploy-auth-and-database-initialization.md, search_tooling/_index.md]
covers_token_total: 5943
summary_level: d2
token_count: 1377
type: summary
---
# agent_architecture structural summary

This level groups the main architecture and operational knowledge for the NC Medicaid Navigator agent and its supporting pipeline. The entries together emphasize runtime correctness, durable curation workflow, retrieval safety, and policy-specific guardrails.

## Core agent architecture

### `context`
- Defines the `agent_architecture` domain: bootstrapping, memory/storage, tool wiring, and policy-focused system prompts.
- Serves as the umbrella reference for onboarding and auditing response rules.

### `nc_medicaid_agent`
- Canonical agent implementation and hardening notes.
- Key sub-areas:
  - `startup_and_web_ui_hardening.md`: startup validation, Mastra configuration, server routes, web UI constraints, CLI runner behavior, and anti-hallucination guardrails.
  - `cli_runner.md`: CLI execution flow, memory payload requirements, iteration synthesis guardrail at `MAX_STEPS`, thread naming, and cleanup via `closeDriver()`.
  - `libsql_storage_fix_for_railway.md`: Railway deployment fix replacing DuckDB/MastraCompositeStore with `LibSQLStore` to avoid Alpine/musl crashes; observability storage also moved to LibSQL.
  - `ssa_and_cfr_reference_resolution_fixes.md`: citation-resolution correctness for SSA/CFR references, including SSA-to-USC mappings, parser robustness, part-level-only supersession redirects, and the `ingest-ssa --refresh → extract-refs → embed` re-ingestion sequence.
  - `nc_medicaid_navigator_agent.md`: agent prompt and metadata guidance, including `source_url`, tool taxonomy, amendment verification, and response-format requirements.

## Amendment interpretation and policy QA

### `amendment_pipeline_and_prompt`
- Canonical detail source is `amendment_pipeline_and_prompt_guardrails.md`.
- Focuses on amendment-graph interpretation, authoritative change-summary extraction, and system-prompt guardrails for policy QA.
- Preserve the pipeline steps, traversal heuristics, prompt rules, examples, and extracted facts in the drill-down file.

## Retrieval, parsing, and tool behavior

### `packages_pipeline`
- Covers retrieval backend behavior and SSA parsing/indexing stability.
- Main strands:
  - `context.md`: hybrid policy search scope with `Neo4j queryNodes`, `vectorScanK` overscan, fulltext recovery, and `sectionId` deduplication.
  - `retrieval_fixes.md`: coverage-preserving vector retrieval; per-type-group overscan, merge-by-`sectionId`, fulltext boosting, and reranking before final `topK`.
  - `crawler_cli_and_package_docs.md`: crawler command surface, `src/index.ts` entrypoint, `src/cli/` command registration, and README/documentation conventions.
  - `crawler_sync_behavior.md`: sync lifecycle rules; download and check phases are separated, first 404 does not delete, removal only after threshold, and processed IDs are skipped later.
  - `ssa_parser_subsection_splitting_fix.md`: stable subsection splitting for oversized USC sections, with strict top-level letter sequencing and stable parent IDs.

### `navigate_tools`
- `getAmendments` is the source of truth for Neo4j amendment retrieval behavior.
- Core pattern: use `OPTIONAL MATCH`, then filter null rows so only meaningful amendment data remains.
- Also preserves metadata mapping, authoritative document selection, and interpretation rules for amendment results.

### `neo4j_tool_output_validation`
- Neo4j-backed read-tool validation for policy/document retrieval.
- Preserves:
  - numeric normalization / `Integer` conversion for schema acceptance,
  - Zod-compatible payload structure,
  - container-heading expansion,
  - structured context-query organization.

### `search_tooling`
- Authoritative record for the hybrid policy search tool.
- Key mechanics:
  - Voyage embeddings,
  - per-type-group vector search,
  - concept graph matching,
  - reciprocal rank fusion,
  - Neo4j indexes,
  - `searchSections` flow and associated rules/facts.

## Local development and runtime safety

### `local_dev_setup`
- Repository-level operational guidance for running and maintaining the local development environment.
- Major themes:
  - `local_development_setup.md`: local startup for Neo4j, web, and agent services; Docker Compose, workspace scripts, env placement, and dev workflow rules.
  - `ci_workflow_concurrency_and_test_gates.md`: CI structure with a main test job plus parallel production image build; lint/build/typecheck, JS tests, pipeline pytest, live-Neo4j agent integration tests, and branch-safe concurrency rules.
  - `env_consolidation/_index.md`: root `.env` as single source of truth, with `packages/agent/.env` and `packages/web/.env.local` as absolute symlinks.
  - `repository_doc_audit_findings.md`: documentation maintenance rules distinguishing living docs from historical records; verifies key docs and corrects stale theme-persistence guidance.

## Shared structural themes

- Runtime boundary correctness appears repeatedly: configuration and credentials must be resolved at live runtime, not assumed at build time.
- Durable curation workflow is emphasized across context entries: precomputed recon, single-pass processing when compact enough, extraction/dedup/grouping, UPSERT curation, and verification via applied file paths.
- Retrieval safety relies on coverage-preserving overscan, deduplication by stable identifiers, and careful ranking rather than naive top-k assumptions.
- Policy accuracy depends on citation correctness, parser stability, and explicit guardrails in both prompt and runtime configuration.