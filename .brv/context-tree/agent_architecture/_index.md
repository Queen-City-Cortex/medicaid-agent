---
children_hash: f139bb7a7345253fa2f843de4de3afee99f0649d258cc9755051362263edaa2f
compression_ratio: 0.5833229309699164
condensation_order: 2
covers: [amendment_pipeline_and_prompt/_index.md, context.md, context/_index.md, deep_research_workflow/_index.md, environment-ownership-and-runtime-boundaries-are-a-common-root-cause-class.md, local_dev_setup/_index.md, mastra_server_configuration/_index.md, navigate_tools/_index.md, nc_medicaid_agent/_index.md, neo4j_tool_output_validation/_index.md, packages_pipeline/_index.md, runtime-boundary-bugs-cluster-around-deploy-auth-and-database-initialization.md, search_tooling/_index.md]
covers_token_total: 8011
summary_level: d2
token_count: 4673
type: summary
---
# Structural Summary: agent_architecture and related clusters

## Cross-cutting architecture themes
These entries collectively describe a repository whose main concern is **policy-agent reliability through structured curation, runtime-boundary correctness, and grounded retrieval/verification**. The dominant patterns are:

- **Durable knowledge capture** from compact context snapshots into `.brv/context-tree`
- **Runtime-owned configuration** over build-time assumptions
- **Deterministic verification** for policy outputs and citations
- **Workflow hardening** for long-running research, CLI execution, and deployment safety

---

## `amendment_pipeline_and_prompt`
Canonical source: `amendment_pipeline_and_prompt_guardrails.md`

- Consolidates the older `agent_architecture/amendment_pipeline_and_prompt/context.md` stub.
- Covers **NC Medicaid agent amendment-graph interpretation**, authoritative change-summary extraction, and system-prompt guardrails for policy QA.
- Preserve drill-down details on:
  - pipeline behavior
  - traversal heuristics
  - prompt rules
  - examples and facts

**Relationship:** This is the focused amendment/prompt guardrail topic within the broader agent architecture domain.

---

## `context`
Cluster of knowledge about **single-pass RLM curation** and durable operational notes.

### Main structural pattern
Across `curated_context.*`, `curated_context_extraction_notes.*`, and `curated_operational_knowledge.*`:

- **recon -> extraction -> dedup/group -> UPSERT curate -> verify applied file paths**
- Prefer **single-pass processing** when recon indicates the context is small enough.
- Do **not print raw source text**; verify by `result.applied[].filePath`.
- Keep curated knowledge within the `.brv/context-tree` hierarchy with **max depth 2**.

### `curated_context_*`
- Records a concrete single-pass curation of provided context into durable knowledge.
- Serves as the main example of the curation workflow in action.

### `curated_operational_knowledge_*`
- Captures session-level workflow metadata.
- Preserves operational facts such as `curation_mode: single-pass` and `context_size: 5100 characters across 124 lines`.

### `epsdt_exception_completeness_workstream_e.*`
- Durable recall entry for **EPSDT exception completeness (Workstream E)**.
- Structural pattern: **source context -> fact extraction -> durable knowledge entry**.

### `mastra_upgrade_type_and_runtime_boundaries.md`
- Documents a shared fix for Mastra upgrade boundaries across tools, routes, and middleware.
- Key decisions:
  - `Tool.execute` returns `Promise<void | TOutput>`
  - handlers use `ContextWithMastra` instead of plain Hono `Context`
  - resource binding middleware runs **after auth**
  - authenticated user id is copied into `MASTRA_RESOURCE_ID_KEY`
- Emphasizes keeping vendored Hono types from `@mastra/core` separate from standalone `hono`.

### `policy_corpus_embedding_client_and_verifier_flow.md`
- Captures the **policy-corpus embedding client + verification flow**.
- Key architecture:
  - `createNeo4jPolicyCorpus` provides the client
  - `embedQuery` is built on `embedQueries`
  - `policyCorpus` is exposed as a singleton
  - query batches are posted to **Voyage** via `VOYAGE_API_URL` and `VOYAGE_MODEL`
- Verification behavior:
  - emits a single JSON telemetry line after a `---VERIFIER---` marker
  - outgoing text always undergoes deterministic URL and quote sanitization
  - rewrite triggers include unsupported, irrelevant, major relevance issue, and incomplete citations
  - fallback appends a disclaimer and advises checking critical details against **NC DHHS**
- Telemetry fields include `supported`, `relevant`, `citations_complete`, `confidence`, `severity`, and `verifier_unavailable`.

### `context.md` domain definition
- Domain purpose: collect architecture and operational knowledge for the NC Medicaid policy agent.
- Scope includes bootstrapping, memory configuration, toolchain, system prompts, guardrails, and citation rules.

**Relationship:** This cluster is the knowledge-capture backbone for the repository and underpins later operational/implementation topics.

---

## `deep_research_workflow`
Documents the **Mastra vNext deep research pipeline** and its hardening fixes.

### `deep_research_workflow.md`
Core workflow:
- **plan → plan-approval → research → synthesize → verify**
- Includes a **HITL approval suspend/resume** checkpoint before research begins.
- Research uses **parallel fan-out** over sub-questions with bounded reflection and novelty-based stopping.
- Synthesis produces a **cited markdown report**.
- Verification can rewrite or score output against sources.

Supporting surfaces:
- Client must handle multiple suspend payload shapes.
- CLI supports unattended deep research with auto-approval.
- Dependencies include corpus retrieval tools, hallucination verifier, optional Exa web search, Mastra vNext typings, and the provider model factory in `packages/agent/src/model.ts`.

Important implementation facts:
- `agent.generate(...)` returns `FullOutput` with `.object`, `.text`, and `.toolResults`
- `createStep` receives `{ inputData, resumeData, suspend, writer, mastra, bail }`
- `writer.write(data)` must be awaited
- suspend payloads are keyed by step ID, e.g. `result.steps['plan-approval'].suspendPayload`
- model export must be annotated as `ReturnType<ReturnType<typeof createOpenAI>>`
- CLI deep research runs auto-approve the plan

### `deep_research_workflow_fixes.md`
Consolidates PR-driven fixes around:
- worker stability
- verification correctness
- model routing
- cancel UX
- readable source labels

Main fixes:
- `onIterationComplete` worker guard forces synthesis when tool budget is nearly exhausted
- `WORKER_MAX_STEPS` increased from 12 to 16
- chat-tuned verification replaced with deterministic `validateAnswerUrls`
- report-agent instructions strengthened:
  - require ATX headings
  - do not ask for more input
  - do not ask for permission
- OpenAI `o1` prefix routing added in `createModel`
- `decline()` now sets cancelled immediately
- `sourceLabel(SourceEntry)` converts raw corpus evidence into human-readable labels

Behavioral outcomes:
- worker agents no longer end with empty findings after spending budget on tools
- verification is grounded against retrieved sources
- canceling no longer flashes a temporary “researching” state
- corpus labels no longer expose raw internal section IDs

Facts and relationships:
- `createModel` is shared by chat and deep-research agents
- OpenAI reasoning models use `o1/o3/o4` prefixes; non-OpenAI models route to Anthropic
- `validateAnswerUrls(reportMarkdown, sources)` counts grounded vs fabricated citations and demotes unsupported URLs to plain text
- `sourceLabel(SourceEntry)` parses `Title / Section / Policy` metadata and falls back to the source key if needed

**Relationship:** These files describe the same research pipeline at different stages: baseline design versus operational fixes.

---

## `local_dev_setup`
Repository-level operational guidance for running and maintaining the local environment.

### `local_development_setup.md`
- Main local-dev reference for starting the NC Medicaid Navigator stacks.
- Covers:
  - local startup of Neo4j, web, and agent services
  - docker compose usage
  - workspace scripts
  - environment placement expectations
  - Neo4j service config
  - dev workflow rules
- Serves as the authoritative contributor onboarding guide for local execution.

### `ci_workflow_concurrency_and_test_gates.md`
- Describes the CI workflow that validates code before deployment.
- Structure:
  - one main `test` job
  - one parallel `docker-build` job for production image validation
- Test sequence:
  - checkout/setup
  - lint, build, typecheck
  - JS tests
  - pipeline pytest
  - agent integration tests against live Neo4j
- Key decisions:
  - branch-safe concurrency
  - cancel superseded runs on PRs/branches
  - never cancel main runs because Railway deployment gating depends on the commit-specific CI result
- Exclusions:
  - pipeline tests excluded from JS test step
  - e2e omitted because WorkOS hosted-login credentials cannot be exercised hermetically
- `docker-build` separately validates production bundles for agent and web images.

### `env_consolidation/_index.md`
- Documents environment consolidation work.
- Main decision:
  - root `.env` is the single source of truth for LLM API keys, WorkOS auth config, and E2E credentials
- Repository layout:
  - `packages/agent/.env` and `packages/web/.env.local` are absolute symlinks to the root file
  - previous circular symlink chain was removed by deleting symlinks first and then creating a real root `.env`

### `repository_doc_audit_findings.md`
- Captures the documentation pass convention and repo docs audit results.
- Maintains the distinction between:
  - living reference docs that must stay synced with code
  - historical/dated records and forward-plan artifacts that should not be rewritten
- Findings:
  - `README.md` and `RUNBOOK.md` were verified accurate
  - stale `packages/web/README.md` theme persistence description was corrected
  - actual model is cookie-first; WorkOS metadata is used only for cross-device sync/backfill
- Also confirms crawler CLI commands remained valid after the `cli/` split.

**Relationship:** This cluster defines the operational envelope for development, CI, and environment management.

---

## `mastra_server_configuration`
Canonical timeout tuning record: `mastra_server_timeout_tuning.md`

- Documents why the Mastra server timeout was raised to support **long-running, multi-step research workflows**.
- Preserves key facts:
  - **10-minute timeout**
  - **SSE lifecycle**
  - **multi-step tool research exceeding 180 seconds**
- Emphasizes resilience and alignment between server configuration and prolonged execution.

**Relationship:** This is the infrastructure-side counterpart to the deep research workflow.

---

## `navigate_tools`
Canonical source of truth: `getamendments_optional_match_filtering.md`

- Documents `getAmendments` Neo4j query behavior in the navigate tools module.
- Core mechanics:
  - uses **OPTIONAL MATCH** to retrieve amendment-related rows
  - applies **null-row filtering** so only meaningful amendment data remains
- Also covers:
  - metadata mapping
  - authoritative document selection
  - rules/facts governing interpretation of amendment results

**Relationship:** This is the query-layer implementation for amendment retrieval, complementing amendment pipeline and prompt guardrails.

---

## `nc_medicaid_agent`
Canonical implementation and hardening notes for the NC Medicaid Navigator agent.

### `startup_and_web_ui_hardening.md`
Broad runtime hardening record covering:
- env validation and startup checks
- Mastra configuration for memory, tools, and server
- server routes and web UI constraints
- CLI runner behavior
- system prompt rules and anti-hallucination guidance

### `cli_runner.md`
Canonical CLI execution note with memory-guardrail content folded in.
Preserves:
- full CLI flow and step iteration behavior
- explicit CLI memory payload requirements
- tool list and observability memory details
- `cli-${Date.now()}` thread behavior
- `onIterationComplete` synthesis guardrail for `MAX_STEPS`
- `closeDriver()` cleanup

### `libsql_storage_fix_for_railway.md`
Railway deployment fix replacing DuckDB/MastraCompositeStore with LibSQL storage to avoid Alpine/musl crashes.
Key decision:
- remove `@mastra/duckdb` and DuckDB-based `MastraCompositeStore`
- use `LibSQLStore` from `@mastra/libsql` for persistence and observational memory
- route observability/exporter storage through LibSQL
Important context:
- Railway containers run Alpine Linux with musl libc
- DuckDB native bindings require `ld-linux-x86-64.so.2`
- canonical files: `packages/agent/src/index.ts` and `packages/agent/package.json`

### `ssa_and_cfr_reference_resolution_fixes.md`
Canonical fix set for SSA/CFR citation resolution.
Preserves:
- SSA-to-USC mappings and parser robustness
- CFR citation parsing
- part-level-only supersession redirects
- preserved full section text by removing the 50K truncation cap
- re-ingestion sequence: `ingest-ssa --refresh` → `extract-refs` → `embed`
Notable mappings:
- SSA 1944 → USC 1396w-3a
- SSA 1900 → USC 1396
- SSA 1901 → USC 1396-1
- there is no current-law USC 1396w-7
Other facts:
- parser improvements handle italicized section headings in USC HTML
- CFR matching recognizes both `C.F.R.` and `Part X` forms case-insensitively
- supersession redirects are constrained to part-level only

### `nc_medicaid_navigator_agent.md`
Canonical agent document with subtopic pointer to detailed metadata/prompt guidance.
Preserves:
- `source_url` support for clickable citations
- startup/model/storage/memory/server configuration
- tool taxonomy
- amendment verification
- anti-hallucination rules
- required response-format rules

**Relationship:** These entries define the agent’s runtime, storage, citation, and CLI correctness rules.

---

## `neo4j_tool_output_validation`
Neo4j-backed read-tool validation for policy/document retrieval.

Preserved themes:
- normalized numeric metadata
- Zod-compatible payloads
- container-heading expansion
- structured context queries
- integer conversion / numeric normalization for schema acceptance

**Relationship:** This is the validation layer for Neo4j-backed retrieval output.

---

## `packages_pipeline`
Structural overview of retrieval, crawler, and SSA parsing work under the packages pipeline.

### Core retrieval backend
- `context.md` establishes reliable **hybrid policy search**.
- Key retrieval rules:
  - `Neo4j queryNodes(k)` returns global top-k and cannot be used for post-filtered per-group retrieval
  - `vectorScanK` overscan is required to preserve coverage before filtering
  - fulltext recovery and `sectionId` deduplication are central to hybrid ranking
- Related drill-down: `retrieval_fixes.md`

### `crawler_cli_and_package_docs.md`
- Public crawler interface and README expectations.
- Crawler exposes a **commander-based CLI via `src/index.ts`**
- Commands remain valid after source reorganization and are available through npm shortcuts
- Common commands: `crawl`, `check`, `stats`, plus examples like `crawl --source clinical_policy` and `export --output registry.json`
- README points to `docs/superpowers/specs/2026-03-26-nc-medicaid-crawler-design.md`

### `crawler_source_factories.md`
- Introduces reusable crawler source factories.
- `crawl-helpers.ts` exports:
  - `singleIndexSource`
  - `pageCrawlSource`
  - `pushNewDocuments`
- `singleIndexSource(logPrefix, indexUrl, parse)` handles single-index discovery.
- `pageCrawlSource(logPrefix, startUrls, parsePage, extractSubpageUrls?, derivePageFromDocument?)` performs **BFS traversal** with `visited`, `queued`, and `seenDocs`.
- Factory-built sources ignore `sinceYear` by design.
- Migrated sources:
  - single-index: `clinical-policies`, `nctracks`, `dhhs-policies`
  - page crawl: `billing-guidance`, `managed-care-guidance`, `managed-care-contracts`
- `managed-care-contracts` uses `derivePageFromDocument` for detail-page derivation and preserves bespoke handling for fee-schedules, bulletins, state-plan, and waivers.

### `crawler_sync_behavior/_index.md`
- Summarizes sync lifecycle behavior in `packages/crawler/src/crawl/sync.ts`.
- Main structure:
  - `SyncStats`
  - `SyncContext`
  - `applyResult`
  - `processDocuments`
  - `runDownloadPhase`
  - `runCheckPhase`
- Behavior:
  - download and check phases are separated to reduce duplicate work
  - documents are not removed on the first 404; removal happens only after the configured not-found threshold
  - processed IDs from download are passed into check via `skipIds`
  - error handling tracks consecutive 404s and other failures before status transitions
- Facts:
  - `HttpStatusError` carries `statusCode`
  - default removal threshold is **3 consecutive 404s**
  - HTML payloads are rejected for binary-only families
  - `better-sqlite3` 12 is required for Node 26

### `ssa_parser_subsection_splitting_fix.md`
- Parser fix for large USC statute sections.
- Decision:
  - only **top-level lettered subsections** are split into child sections
  - parent section text is preserved so citations and IDs remain stable
  - nested roman numeral markers are ignored unless they match the expected next letter
- Parsing flow:
  - parse USC HTML → find section heads → map USC to SSA → retain parent section → split oversized sections → ingest and embed
- Rules:
  - sections larger than `SUBSECTION_SPLIT_MIN_CHARS = 30,000` are eligible
  - subsection letters must follow strict sequence `a -> b -> ... -> z -> aa -> ...`
  - unmapped USC sections are skipped with a warning or note
- Key entities:
  - `packages/pipeline/src/pipeline/federal/ssa_parser.py`
  - `USC_TO_SSA`
  - `FREESTANDING_USC_SECTIONS`
- Facts:
  - child subsection IDs use `<parent>-<letter>`
  - parent citations remain stable
  - real USC HTML contains **235 subsections across 15 statutes**

**Relationship:** This cluster covers the ingestion and retrieval pipeline from crawler discovery through sync behavior and parser stability.

---

## `search_tooling`
Canonical hybrid policy search topic: `hybrid_policy_search_tool.md`

- Describes the search tool used by the NC Medicaid navigator.
- Combines multiple retrieval signals to locate policy sections and rank results.
- Key mechanisms:
  - Voyage embeddings
  - per-type-group vector search
  - concept graph matching
  - reciprocal rank fusion
  - Neo4j indexes
- Includes the `searchSections` flow, rules, and facts.
- Merged from `agent_architecture/search_tooling/context.md` during consolidation.

**Relationship:** This is the user-facing retrieval layer built on top of the pipeline and graph/search infrastructure.

---

## Shared root-cause pattern across clusters
Several entries reinforce the same architectural lesson:

- **Environment and runtime boundaries matter**
- Build-time or first-run assumptions must not be used for runtime-owned state
- Examples span:
  - auth callback origins
  - `.env` ownership and symlinking
  - Neo4j password initialization and live rotation
  - deployment, memory, and storage config

This pattern appears explicitly in:
- `environment-ownership-and-runtime-boundaries-are-a-common-root-cause-class.md`
- `runtime-boundary-bugs-cluster-around-deploy-auth-and-database-initialization.md`

**Drill-down path:** Start with `local_dev_setup`, `nc_medicaid_agent`, and `agent_architecture/context` for operational boundaries, then follow the implementation-specific entries for auth, database, and deployment fixes.