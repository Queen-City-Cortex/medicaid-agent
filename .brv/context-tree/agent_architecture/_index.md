---
children_hash: 8c048438cbd9344fd8ed76857babf113e29293a90ea4f2b8521325dc6a92059e
compression_ratio: 0.4993417588204318
condensation_order: 2
covers: [amendment_pipeline_and_prompt/_index.md, context.md, context/_index.md, deep_research_workflow/_index.md, environment-ownership-and-runtime-boundaries-are-a-common-root-cause-class.md, local_dev_setup/_index.md, mastra_server_configuration/_index.md, navigate_tools/_index.md, nc_medicaid_agent/_index.md, neo4j_tool_output_validation/_index.md, packages_pipeline/_index.md, runtime-boundary-bugs-cluster-around-deploy-auth-and-database-initialization.md, search_tooling/_index.md]
covers_token_total: 7596
summary_level: d2
token_count: 3793
type: summary
---
# Level d2 Structural Summary

This cluster captures the repository’s highest-level architecture and operational knowledge around the NC Medicaid Navigator agent, its retrieval and research pipelines, and the local/runtime infrastructure that keeps them reliable. The main recurring patterns are: **runtime-boundary correctness**, **single-source configuration**, **deterministic verification**, and **durable curated knowledge** instead of ephemeral notes.

## Agent architecture and operational guardrails

### `agent_architecture/context.md` and `context/_index.md`
- `agent_architecture/context.md` defines the domain as the home for **agent bootstrapping, memory setup, tool wiring, policy-specific prompts, guardrails, and citation rules**.
- Ownership is the **NC Medicaid Agent team**.
- The curated `context/_index.md` cluster shows the preferred curation workflow:
  - **precomputed recon**
  - **single-pass processing** when compact enough
  - **extract → dedup/group → UPSERT curate → verify applied file paths**
- It also preserves session-level durable knowledge for:
  - retrieval heuristics
  - message parsing behavior
  - verification by **curated output paths** rather than rereading source files
  - workstream-specific EPSDT completeness context
- Drill-down entries referenced by the cluster include:
  - `curated_context_extraction_notes.md`
  - `curated_operational_knowledge.md`
  - `epsdt_exception_completeness_workstream_e.md`

### `amendment_pipeline_and_prompt/_index.md`
- Canonical source is **`amendment_pipeline_and_prompt_guardrails.md`**; it supersedes the older stub.
- Core scope:
  - **NC Medicaid agent amendment-graph interpretation**
  - **authoritative change-summary extraction**
  - **system-prompt guardrails for policy QA**
- Preserve the child topic for:
  - pipeline details
  - traversal heuristics
  - prompt rules
  - examples and facts

### `mastra_server_configuration/_index.md`
- `mastra_server_timeout_tuning.md` is the canonical timeout record.
- Key preserved facts:
  - **10-minute timeout**
  - **SSE lifecycle**
  - multi-step tool research can exceed **180 seconds**
- The architectural point is alignment between server timeout settings and long-running agent workflows.

### `neo4j_tool_output_validation/_index.md`
- Documents Neo4j-backed read-tool validation for policy/document retrieval.
- Core preserved themes:
  - **numeric normalization / Integer conversion**
  - **Zod-compatible payloads**
  - **container-heading expansion**
  - structured context-query organization

## Deep research workflow and fixes

### `deep_research_workflow/_index.md`
This cluster documents the Mastra vNext deep research pipeline and later hardening changes.

#### `deep_research_workflow.md`
- Baseline flow: **plan → plan-approval → research → synthesize → verify**
- Includes a **human-in-the-loop approval suspend/resume** checkpoint before research starts.
- Research phase uses:
  - **parallel fan-out** over subquestions
  - **bounded reflection**
  - **novelty-based stopping**
- Synthesis produces a **cited markdown report**.
- Verification can rewrite or score output against sources.
- Important implementation facts:
  - `agent.generate(...)` returns `FullOutput` with `.object`, `.text`, and `.toolResults`
  - `createStep` receives `{ inputData, resumeData, suspend, writer, mastra, bail }`
  - `writer.write(data)` must be awaited
  - suspend payloads are keyed by step ID, e.g. `result.steps['plan-approval'].suspendPayload`
  - CLI runs can auto-approve the plan

#### `deep_research_workflow_fixes.md`
- Fixes and hardening focus on:
  - worker stability
  - verification correctness
  - model routing
  - cancel UX
  - readable source labels
- Main changes:
  - `onIterationComplete` guard to force synthesis when tool budget is nearly exhausted
  - `WORKER_MAX_STEPS` increased from **12 to 16**
  - deterministic **`validateAnswerUrls`** replaced chat-tuned verification
  - report-agent instructions require **ATX headings** and prohibit asking for more input or permission
  - OpenAI `o1` prefix routing in `createModel`
  - `decline()` now sets **cancelled immediately**
  - `sourceLabel(SourceEntry)` converts raw corpus evidence into human-readable labels
- Relationships:
  - `createModel` is shared by chat and deep-research agents
  - OpenAI reasoning models use **`o1/o3/o4`** prefixes; non-OpenAI models route to Anthropic

### `search_tooling/_index.md`
- `hybrid_policy_search_tool.md` is the authoritative topic for the hybrid policy search tool.
- Key mechanisms:
  - **Voyage embeddings**
  - **per-type-group vector search**
  - **concept graph matching**
  - **reciprocal rank fusion**
  - **Neo4j indexes**
- Includes the `searchSections` flow plus rules and facts.

## Runtime boundaries, environment ownership, and deployment safety

### Cross-cutting synthesis entries
- `environment-ownership-and-runtime-boundaries-are-a-common-root-cause-class.md`
- `runtime-boundary-bugs-cluster-around-deploy-auth-and-database-initialization.md`

These entries converge on the same root cause class:
- **runtime-owned values must not be treated as build-time or initialization-time constants**
- failures cluster across:
  - auth callback origins
  - `.env` ownership
  - Neo4j credentials and database initialization
  - deployment/runtime startup behavior

Key shared conclusion:
- source configuration from the **live runtime environment**, not the build artifact or first-run bootstrap state.

### `auth_integration` and `database_operations` references
- Auth callback origins must be resolved dynamically at request/runtime.
- The root `.env` is the source of truth, with package env files symlinked to it.
- `NEO4J_AUTH` only sets the password on first volume initialization; existing databases require live password changes.

## Local development, CI, and repo maintenance

### `local_dev_setup/_index.md`
This cluster defines the repo’s operational baseline for local development and CI.

#### `local_development_setup.md`
- Umbrella guide for starting and working with the NC Medicaid Navigator repo.
- Covers:
  - local startup of Neo4j, web, and agent services
  - docker compose usage
  - workspace scripts
  - environment placement expectations
  - Neo4j service config
  - dev workflow rules

#### `ci_workflow_concurrency_and_test_gates.md`
- CI structure:
  - one main `test` job
  - one parallel `docker-build` job
- Test sequence:
  - checkout/setup
  - lint, build, typecheck
  - JS tests
  - pipeline pytest
  - agent integration tests against live Neo4j
- Key decisions:
  - branch-safe concurrency
  - cancel superseded runs on PRs/branches
  - **do not cancel main runs** because Railway deploys depend on commit-specific CI results
- Constraints:
  - pipeline tests excluded from JS test step
  - e2e omitted because WorkOS hosted-login credentials are not hermetic
- `docker-build` validates production bundles for both agent and web images

#### `env_consolidation/_index.md`
- The root `.env` is the **single source of truth** for:
  - LLM API keys
  - WorkOS auth config
  - E2E credentials
- `packages/agent/.env` and `packages/web/.env.local` are absolute symlinks to the root file.
- A prior circular symlink chain was removed by deleting symlinks first and then creating a real root `.env`.

#### `repository_doc_audit_findings.md`
- Preserves the docs maintenance convention:
  - living reference docs must stay synced with current code
  - historical/dated records and forward-plan artifacts should not be rewritten
- Audit results:
  - `README.md` and `RUNBOOK.md` were verified accurate
  - stale `packages/web/README.md` was corrected
  - theme persistence now reflects a **cookie-first model**, with WorkOS metadata used only for cross-device sync/backfill
- Confirms crawler CLI commands remained valid after the `cli/` split

## Agent runtime, storage, and citation correctness

### `nc_medicaid_agent/_index.md`
This cluster anchors the agent implementation and hardening record set.

#### `startup_and_web_ui_hardening.md`
- Broad runtime hardening record tying together:
  - env validation and startup checks
  - Mastra configuration for memory, tools, and server
  - server routes and web UI constraints
  - CLI runner behavior
  - system prompt rules and anti-hallucination guidance

#### `cli_runner.md`
- Canonical CLI execution note and memory-guardrail record.
- Preserves:
  - full CLI flow and step iteration behavior
  - explicit CLI memory payload requirements
  - tool list and observability memory details
  - `cli-${Date.now()}` thread behavior
  - `onIterationComplete` synthesis guardrail for `MAX_STEPS`
  - `closeDriver()` cleanup

#### `libsql_storage_fix_for_railway.md`
- Railway deployment fix that replaced DuckDB/MastraCompositeStore with **LibSQL storage** to avoid Alpine/musl crashes.
- Key decision:
  - remove `@mastra/duckdb` and DuckDB-based `MastraCompositeStore`
  - use `LibSQLStore` from `@mastra/libsql` for persistence and observational memory
  - route observability/exporter storage through LibSQL
- Root cause:
  - Railway containers use Alpine Linux with musl libc, while DuckDB native bindings require `ld-linux-x86-64.so.2`

#### `ssa_and_cfr_reference_resolution_fixes.md`
- Canonical fix set for SSA/CFR citation resolution.
- Preserved facts:
  - SSA-to-USC mappings:
    - **SSA 1944 → USC 1396w-3a**
    - **SSA 1900 → USC 1396**
    - **SSA 1901 → USC 1396-1**
  - no current-law **USC 1396w-7**
  - parser handles italicized USC section headings
  - full section text preserved by removing the **50K truncation cap**
  - CFR matching recognizes both **`C.F.R.`** and **`Part X`** forms case-insensitively
  - supersession redirects are constrained to **part-level only**
  - re-ingestion sequence: `ingest-ssa --refresh` → `extract-refs` → `embed`

#### `nc_medicaid_navigator_agent.md`
- Canonical agent prompt/metadata document.
- Preserves:
  - `source_url` support for clickable citations
  - startup/model/storage/memory/server configuration guidance
  - tool taxonomy
  - amendment verification
  - anti-hallucination rules
  - required response-format rules

## Retrieval, crawler, and parsing pipeline

### `packages_pipeline/_index.md`
This cluster covers retrieval correctness, crawler behavior, and SSA parsing for the policy corpus pipeline.

#### Core retrieval backend
- `context.md` establishes the retrieval focus: **reliable hybrid policy search**
- Key retrieval decisions:
  - Neo4j `queryNodes(k)` returns global top-k and cannot be used for post-filtered per-group retrieval
  - `vectorScanK` overscan is required to preserve coverage before filtering
  - **fulltext recovery** and **sectionId deduplication** are central to hybrid ranking
- `retrieval_fixes.md` is the detailed drill-down for vector overscan and hybrid collector behavior

#### `crawler_cli_and_package_docs.md`
- Public crawler interface and README expectations.
- Preserved facts:
  - crawler exposes a **commander-based CLI via `src/index.ts`**
  - commands remain valid after source reorganization
  - common commands include `crawl`, `check`, `stats`
  - examples include `crawl --source clinical_policy` and `export --output registry.json`
  - README points to `docs/superpowers/specs/2026-03-26-nc-medicaid-crawler-design.md`

#### `crawler_source_factories.md`
- Refactor introducing reusable crawler source factories.
- Key exports:
  - `singleIndexSource`
  - `pageCrawlSource`
  - `pushNewDocuments`
- Important behaviors:
  - `singleIndexSource(logPrefix, indexUrl, parse)` handles single-index discovery
  - `pageCrawlSource(logPrefix, startUrls, parsePage, extractSubpageUrls?, derivePageFromDocument?)` performs **BFS traversal** with `visited`, `queued`, and `seenDocs`
  - factory-built sources ignore `sinceYear` by design
- Migrated sources:
  - single-index: `clinical-policies`, `nctracks`, `dhhs-policies`
  - page crawl: `billing-guidance`, `managed-care-guidance`, `managed-care-contracts`
- Managed-care contracts keeps bespoke handling for fee-schedules, bulletins, state-plan, and waivers

#### `crawler_sync_behavior/_index.md`
- Sync lifecycle in `packages/crawler/src/crawl/sync.ts`
- Structure:
  - `SyncStats`
  - `SyncContext`
  - `applyResult`
  - `processDocuments`
  - `runDownloadPhase`
  - `runCheckPhase`
- Key behavior:
  - download and check phases are separated to reduce duplicate work
  - documents are not removed on first 404; removal happens only after the configured threshold
  - processed IDs from download are passed into check via `skipIds`
  - default removal threshold is **3 consecutive 404s**
  - HTML payloads are rejected for binary-only families
  - `better-sqlite3` 12 is required for Node 26

#### `ssa_parser_subsection_splitting_fix.md`
- Parser fix for large USC statute sections.
- Main decision:
  - only **top-level lettered subsections** are split into child sections
  - parent section text is preserved so citations and IDs remain stable
  - nested roman numeral markers are ignored unless they match the expected next letter
- Parsing flow:
  - parse USC HTML → find section heads → map USC to SSA → retain parent section → split oversized sections → ingest and embed
- Important rules:
  - sections larger than **`SUBSECTION_SPLIT_MIN_CHARS = 30,000`** are eligible
  - subsection letters follow strict sequence: `a -> b -> ... -> z -> aa -> ...`
  - unmapped USC sections are skipped with a warning or note
- Key entities:
  - `packages/pipeline/src/pipeline/federal/ssa_parser.py`
  - `USC_TO_SSA`
  - `FREESTANDING_USC_SECTIONS`
- Real USC HTML contains **235 subsections across 15 statutes**

## Search and navigate tooling

### `navigate_tools/_index.md`
- `getamendments_optional_match_filtering.md` is the structural source of truth for the `getAmendments` Neo4j query behavior.
- Core behavior:
  - uses **OPTIONAL MATCH** to retrieve amendment-related rows
  - applies **null-row filtering** so only meaningful amendment data remains
- Also documents:
  - metadata mapping
  - authoritative document selection
  - rules and facts governing amendment interpretation

### `search_tooling/_index.md`
- `hybrid_policy_search_tool.md` is the authoritative topic for the NC Medicaid Navigator hybrid policy search tool.
- It combines:
  - Voyage embeddings
  - per-type-group vector search
  - concept graph matching
  - reciprocal rank fusion
  - Neo4j indexes
- Includes the `searchSections` flow, rules, and facts

## Structural relationships to retain
- `context/_index.md` and `amendment_pipeline_and_prompt/_index.md` are the main curation/guardrail knowledge anchors.
- `deep_research_workflow/_index.md` and `deep_research_workflow_fixes.md` define the research pipeline and its operational hardening.
- `local_dev_setup/_index.md` and the synthesis entries describe the repo’s runtime-boundary and environment-ownership conventions.
- `nc_medicaid_agent/_index.md` and `mastra_server_configuration/_index.md` cover agent runtime, storage, timeout, and prompt correctness.
- `packages_pipeline/_index.md`, `navigate_tools/_index.md`, and `search_tooling/_index.md` cover retrieval, crawling, parsing, and search behavior.