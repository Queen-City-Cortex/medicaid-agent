---
children_hash: 6a276236923257d402a86027538fff9ccb532d04aee081af501994733f7ed946
compression_ratio: 0.4576910978295061
condensation_order: 3
covers: [agent_architecture/_index.md, amendment_detection/_index.md, architecture/_index.md, auth_integration/_index.md, database_operations/_index.md, evaluation/_index.md, facts/_index.md, frontend_ui/_index.md, packages/_index.md, packages_pipeline/_index.md, qa/_index.md]
covers_token_total: 19074
summary_level: d3
token_count: 8730
type: summary
---
# Level d3 Structural Summary

This cluster captures the repository’s highest-level architecture, retrieval/evaluation contract, and runtime correctness rules. The dominant pattern across the child entries is **staged, validated, runtime-aware processing**: collect broadly, filter and dedupe, rank or verify deterministically, and preserve durable curated knowledge rather than ephemeral notes.

## 1) Agent architecture, curation workflow, and operational guardrails

### `agent_architecture/context.md` and `context/_index.md`
- Defines the core agent domain: **bootstrapping, memory setup, tool wiring, policy prompts, guardrails, and citation rules**.
- The curated `context/_index.md` cluster preserves the preferred curation workflow:
  - recon first
  - single-pass when compact enough
  - extract → dedup/group → UPSERT curate → verify applied file paths
- Durable knowledge is preserved for:
  - retrieval heuristics
  - message parsing behavior
  - verification by curated output paths
  - workstream-specific EPSDT completeness context
- Drill-down entries include:
  - `curated_context_extraction_notes.md`
  - `curated_operational_knowledge.md`
  - `epsdt_exception_completeness_workstream_e.md`

### `amendment_pipeline_and_prompt/_index.md`
- Canonical source is `amendment_pipeline_and_prompt_guardrails.md`.
- Scope:
  - NC Medicaid amendment-graph interpretation
  - authoritative change-summary extraction
  - system-prompt guardrails for policy QA
- Preserve drill-down for pipeline details, traversal heuristics, prompt rules, and examples.

### `mastra_server_configuration/_index.md`
- Canonical timeout record is `mastra_server_timeout_tuning.md`.
- Key facts:
  - **10-minute timeout**
  - **SSE lifecycle**
  - multi-step tool research can exceed **180 seconds**
- Architectural goal: align server timeout settings with long-running agent workflows.

### `neo4j_tool_output_validation/_index.md`
- Documents Neo4j-backed read-tool validation for policy/document retrieval.
- Main themes:
  - numeric normalization / `Integer` conversion
  - Zod-compatible payloads
  - container-heading expansion
  - structured context-query organization

## 2) Deep research workflow and hardening

### `deep_research_workflow/_index.md`
Documents the Mastra vNext deep research pipeline and later stability fixes.

#### `deep_research_workflow.md`
- Baseline flow: **plan → plan-approval → research → synthesize → verify**
- Includes a human-in-the-loop approval checkpoint before research starts.
- Research uses:
  - parallel fan-out over subquestions
  - bounded reflection
  - novelty-based stopping
- Synthesis produces a cited markdown report.
- Verification can rewrite or score output against sources.
- Important implementation details:
  - `agent.generate(...)` returns `FullOutput` with `.object`, `.text`, and `.toolResults`
  - `createStep` receives `{ inputData, resumeData, suspend, writer, mastra, bail }`
  - `writer.write(data)` must be awaited
  - suspend payloads are keyed by step ID, e.g. `result.steps['plan-approval'].suspendPayload`

#### `deep_research_workflow_fixes.md`
- Hardening focuses on worker stability, verification correctness, model routing, cancel UX, and readable source labels.
- Main changes:
  - `onIterationComplete` guard to force synthesis near tool-budget exhaustion
  - `WORKER_MAX_STEPS` increased from **12 to 16**
  - deterministic `validateAnswerUrls` replaces chat-tuned verification
  - report-agent instructions require **ATX headings** and forbid asking for more input or permission
  - OpenAI `o1` prefix routing in `createModel`
  - `decline()` now sets cancelled immediately
  - `sourceLabel(SourceEntry)` converts raw evidence into human-readable labels
- Relationship:
  - `createModel` is shared by chat and deep-research agents
  - OpenAI reasoning models use `o1/o3/o4` prefixes; non-OpenAI models route to Anthropic

### `search_tooling/_index.md`
- `hybrid_policy_search_tool.md` is the authoritative topic for the hybrid policy search tool.
- Mechanisms:
  - Voyage embeddings
  - per-type-group vector search
  - concept graph matching
  - reciprocal rank fusion
  - Neo4j indexes
- Includes `searchSections` flow, rules, and facts.

## 3) Runtime boundaries, environment ownership, and auth/database safety

### Cross-cutting synthesis entries
- `environment-ownership-and-runtime-boundaries-are-a-common-root-cause-class.md`
- `runtime-boundary-bugs-cluster-around-deploy-auth-and-database-initialization.md`

Shared conclusion:
- **runtime-owned values must not be treated as build-time or first-run constants**
- Failures cluster around:
  - auth callback origins
  - `.env` ownership
  - Neo4j credentials and initialization
  - deployment/runtime startup behavior

### Auth and deployment boundary fixes
- Auth callback origins must be resolved dynamically at request/runtime.
- The root `.env` is the source of truth; package env files are symlinked to it.
- `NEO4J_AUTH` only sets the password on first volume initialization; existing databases require live password changes.

### Related domains
- `auth_integration` covers callback-origin and baseURL resolution.
- `frontend_ui` covers runtime transport reinitialization when auth changes.
- `database_operations` covers Neo4j first-run vs existing-instance credential behavior.

## 4) Local development, CI, and repo maintenance

### `local_dev_setup/_index.md`
Defines the operational baseline for local development and CI.

#### `local_development_setup.md`
- Umbrella guide for running the NC Medicaid Navigator repo locally.
- Covers:
  - Neo4j, web, and agent startup
  - docker compose
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
  - do **not** cancel main runs because Railway deploys depend on commit-specific CI results
- Constraints:
  - pipeline tests excluded from JS test step
  - e2e omitted because WorkOS hosted-login credentials are not hermetic
  - `docker-build` validates production bundles for both agent and web images

#### `env_consolidation/_index.md`
- Root `.env` is the **single source of truth** for:
  - LLM API keys
  - WorkOS auth config
  - E2E credentials
- `packages/agent/.env` and `packages/web/.env.local` are absolute symlinks to the root file.
- A circular symlink chain was removed by deleting symlinks first, then creating a real root `.env`.

#### `repository_doc_audit_findings.md`
- Preserves the docs maintenance rule:
  - living reference docs must stay synced with current code
  - historical/dated records and forward-plan artifacts should not be rewritten
- Audit outcomes:
  - `README.md` and `RUNBOOK.md` verified accurate
  - stale `packages/web/README.md` corrected
  - theme persistence now reflects a **cookie-first model**
  - crawler CLI commands remained valid after the `cli/` split

## 5) Agent runtime, storage, and citation correctness

### `nc_medicaid_agent/_index.md`
Anchors the agent implementation and hardening record set.

#### `startup_and_web_ui_hardening.md`
- Ties together env validation, startup checks, Mastra configuration, routes, web UI constraints, CLI runner behavior, prompt rules, and anti-hallucination guidance.

#### `cli_runner.md`
- Canonical CLI execution and memory-guardrail record.
- Preserves:
  - full CLI flow and step iteration behavior
  - CLI memory payload requirements
  - tool list and observability memory details
  - `cli-${Date.now()}` thread behavior
  - `onIterationComplete` synthesis guardrail for `MAX_STEPS`
  - `closeDriver()` cleanup

#### `libsql_storage_fix_for_railway.md`
- Railway deployment fix replacing DuckDB/MastraCompositeStore with **LibSQL storage** to avoid Alpine/musl crashes.
- Decision:
  - remove `@mastra/duckdb` and DuckDB-based `MastraCompositeStore`
  - use `LibSQLStore` from `@mastra/libsql`
  - route observability/exporter storage through LibSQL
- Root cause: Railway Alpine containers use musl libc, while DuckDB native bindings require `ld-linux-x86-64.so.2`.

#### `ssa_and_cfr_reference_resolution_fixes.md`
- Canonical SSA/CFR citation resolution fixes.
- Preserved facts:
  - SSA 1944 → USC 1396w-3a
  - SSA 1900 → USC 1396
  - SSA 1901 → USC 1396-1
  - no current-law USC 1396w-7
  - italicized USC section headings are parsed correctly
  - the 50K truncation cap was removed
  - CFR matching recognizes both `C.F.R.` and `Part X` forms case-insensitively
  - supersession redirects are part-level only
  - re-ingestion sequence: `ingest-ssa --refresh` → `extract-refs` → `embed`

#### `nc_medicaid_navigator_agent.md`
- Canonical agent prompt/metadata document.
- Preserves:
  - `source_url` support for clickable citations
  - startup/model/storage/memory/server guidance
  - tool taxonomy
  - amendment verification
  - anti-hallucination rules
  - required response-format rules

## 6) Retrieval, crawler, parsing, and search pipeline

### `packages_pipeline/_index.md`
Covers retrieval correctness, crawler behavior, and SSA parsing for the policy corpus pipeline.

#### Retrieval backend
- `context.md` defines the retrieval focus as reliable hybrid policy search.
- Key decisions:
  - Neo4j `queryNodes(k)` is global top-k and cannot support post-filtered per-group retrieval
  - `vectorScanK` overscan preserves coverage before filtering
  - fulltext recovery and `sectionId` deduplication are central to hybrid ranking
- `retrieval_fixes.md` is the detailed drill-down for vector overscan and hybrid collector behavior.

#### `crawler_cli_and_package_docs.md`
- Public crawler interface and README expectations.
- Facts preserved:
  - commander-based CLI via `src/index.ts`
  - commands remain valid after source reorganization
  - common commands: `crawl`, `check`, `stats`
  - examples include `crawl --source clinical_policy` and `export --output registry.json`
  - README points to `docs/superpowers/specs/2026-03-26-nc-medicaid-crawler-design.md`

#### `crawler_source_factories.md`
- Refactor introducing reusable crawler source factories:
  - `singleIndexSource`
  - `pageCrawlSource`
  - `pushNewDocuments`
- Behavior:
  - `singleIndexSource(logPrefix, indexUrl, parse)` handles single-index discovery
  - `pageCrawlSource(logPrefix, startUrls, parsePage, extractSubpageUrls?, derivePageFromDocument?)` performs BFS traversal with `visited`, `queued`, and `seenDocs`
  - factory-built sources ignore `sinceYear` by design
- Migrated sources:
  - single-index: `clinical-policies`, `nctracks`, `dhhs-policies`
  - page crawl: `billing-guidance`, `managed-care-guidance`, `managed-care-contracts`
- Managed-care contracts retains bespoke handling for fee-schedules, bulletins, state-plan, and waivers.

#### `crawler_sync_behavior/_index.md`
- Sync lifecycle in `packages/crawler/src/crawl/sync.ts`
- Structure:
  - `SyncStats`
  - `SyncContext`
  - `applyResult`
  - `processDocuments`
  - `runDownloadPhase`
  - `runCheckPhase`
- Behavior:
  - download and check phases are separated to reduce duplicate work
  - documents are not removed on first 404; removal happens only after the configured threshold
  - processed IDs from download are passed into check via `skipIds`
  - default removal threshold is **3 consecutive 404s**
  - HTML payloads are rejected for binary-only families
  - `better-sqlite3` 12 is required for Node 26

#### `ssa_parser_subsection_splitting_fix.md`
- Parser fix for large USC statute sections.
- Decision:
  - only top-level lettered subsections are split into child sections
  - parent section text is preserved so citations and IDs remain stable
  - nested roman numeral markers are ignored unless they match the expected next letter
- Parsing flow:
  - parse USC HTML → find section heads → map USC to SSA → retain parent section → split oversized sections → ingest and embed
- Important rules:
  - sections larger than `SUBSECTION_SPLIT_MIN_CHARS = 30,000` are eligible
  - subsection letters follow strict sequence `a -> b -> ... -> z -> aa -> ...`
  - unmapped USC sections are skipped with a warning or note
- Key entities:
  - `packages/pipeline/src/pipeline/federal/ssa_parser.py`
  - `USC_TO_SSA`
  - `FREESTANDING_USC_SECTIONS`
- Real USC HTML contains **235 subsections across 15 statutes**.

### `navigate_tools/_index.md`
- `getamendments_optional_match_filtering.md` is the structural source of truth for `getAmendments` Neo4j query behavior.
- Core behavior:
  - uses `OPTIONAL MATCH` to retrieve amendment-related rows
  - applies null-row filtering so only meaningful amendment data remains
- Also documents metadata mapping, authoritative document selection, and amendment-interpretation rules.

### `search_tooling/_index.md`
- `hybrid_policy_search_tool.md` is the authoritative topic for the hybrid policy search tool.
- Combines:
  - Voyage embeddings
  - per-type-group vector search
  - concept graph matching
  - reciprocal rank fusion
  - Neo4j indexes
- Includes `searchSections` flow, rules, and facts.

## 7) Amendment detection

### `amendment_detection/_index.md`
Graph-based DHHS amendment detection for Medicaid documentation.

- Purpose:
  - detect change notices and revised SPAs
  - extract surrounding context
  - write `AMENDS` relationships into Neo4j
- Primary implementation:
  - `packages/pipeline/src/pipeline/references/amendments.py`
  - especially `detect_amendments()`
- Core flow:
  - scan documents
  - detect change notices and revised SPAs
  - extract MA/SPA references and sentence-level context
  - create batched `AMENDS` edges
  - update originating documents to `status="amendment"`
- Key behaviors:
  - helper predicates such as `_is_change_notice`, `_is_revised_spa`, `_is_signal_section`, `_is_sentence_boundary`
  - sentence boundary detection fixed so periods inside MA-series identifiers do not split sentences incorrectly
  - `_extract_context` preserves full sentences even with dotted MA numbers like `MA-2180.IV.I`
  - `change_description` entries are deduplicated per `(source, target)` before `queries.MERGE_AMENDS_BATCH`
  - signal sections are preferred over fallback bodies
- Detection patterns:
  - `CHANGE NOTICE FOR MANUAL NO. ...`
  - `((?:MA|DMA|DHB|DSS)-\d+)`
  - `SPA\s+(\d+[\s\-]+\d+)`

## 8) Refactoring audit and test infrastructure

### `architecture/_index.md`
Documents a repo-wide refactoring program centered on canonical helpers, table-driven rules, and fixture hardening.

- Main patterns:
  - rules-as-data / table-driven refactors
  - shared canonical helpers and types
  - behavior-preserving verification
  - import-cycle and API-safety fixes
  - dead code and helper consolidation
  - CI and review-bot suppression for artifact-only PRs
  - shared test-fixture architecture
  - fixture drift protection and API validation
- Stable constraints include:
  - `CHECKLIST_LIMIT = 6`
  - Railway deployment dependence on `push:main` CI
  - explicit waiver-authority predicates
  - import-path restrictions to prevent barrel cycles
  - test-fake validation against the live writer API
- Main drill-down points:
  - `architecture/refactoring_audit/checklist_rule_table_refactor.md`
  - `architecture/refactoring_audit/shared_test_fixture_layer.md`
  - `architecture/refactoring_audit/shared_test_fixtures_guard_against_api_drift.md`
  - `architecture/refactoring_audit/ci_artifact_only_pr_skip_rules.md`
  - `architecture/refactoring_audit/pr_63_refactor_completion_and_import_cycle_fix.md`
  - `architecture/refactoring_audit/quick_wins_and_latent_bugs_refactor_tranche.md`
  - `architecture/refactoring_audit/repo_wide_refactoring_audit.md`

## 9) Evaluation, QA, and trust chain

### `evaluation/_index.md`
Central evaluation domain for the Medicaid Navigator.

- Covers:
  - answer-quality evaluation
  - cross-reference resolution
  - pipeline overview
- Shared pattern:
  - golden-entry-driven pipeline that invokes the agent, retrieves Neo4j evidence, judges outputs, and aggregates metrics
- Answer-quality evaluation:
  - implemented in `packages/pipeline/src/pipeline/eval/levels/answer.py`
  - flow: golden entries → `_invoke_agent` over HTTP with CLI fallback → evidence fetch from Neo4j → `judge_answer` → metrics
  - answer extraction relies on content after `---ANSWER---`
  - failures:
    - judge failures yield `None`
    - agent failures yield `0` with an explanation
    - agent invocation times out after 180 seconds
  - `primary_hit` is set when overall score is at least 2
- Retrieval-model finding:
  - `voyage-4-large` vs `voyage-law-2` was effectively a wash
  - bottleneck appears structural, not embedding-model selection
- Cross-reference resolution:
  - implemented in `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`
  - resolution order:
    1. document-level `REFERENCES_DOCUMENT` and `AMENDS`
    2. fallback section-level `REFERENCES` via `HAS_SECTION`
  - missing document IDs are counted as missed without querying the graph
- Shared module structure:
  - `packages/pipeline/src/pipeline/eval/levels/answer.py`
  - `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`

### `qa/_index.md`
The `qa` domain captures Playwright test infrastructure while the synthesis entries define one end-to-end trust chain.

- Core scope:
  - Playwright configuration for mocked and smoke suites
  - Mastra streaming and memory API mocking
  - page objects for chat and thread sidebar workflows
- Playwright structure:
  - mocked suite: **15s timeouts**
  - smoke suite: **120s timeouts**
  - shared helpers:
    - `MastraStreamBuilder`
    - `mockMastraAPI`
    - `ChatPage`
- Trust chain:
  - retrieve evidence
  - verify or rewrite unsupported output
  - score only grounded answers
- Hallucination verification:
  - final-answer only
  - runs only when `finishReason` is `stop`
  - requires no pending tool calls and text to be present
  - failure handling is rewrite-based
  - CLI output uses stable markers:
    - `---EVIDENCE---`
    - `---VERIFIER---`
    - `---ANSWER---`
- Evaluation pipeline:
  - level 3 answer scoring and level 2 cross-reference resolution
  - HTTP-first agent invocation with CLI fallback
  - Neo4j evidence retrieval
  - relationship validation
- Cross-cutting rule: trust is enforced as a chain, not a single check.

## 10) Frontend UI: chat stability, persistence, and runtime identity

### `frontend_ui/_index.md`
This cluster covers chat runtime behavior, persistence, and visual/testing infrastructure.

- Recurring theme:
  - thread identity, auth state, and persisted UI state must stay aligned
- Key subtopics include:
  - chat page review fixes
  - live UI testing without the auth wall
  - scroll stability
  - auth-bound transport reinitialization
  - thread cache restoration
  - message persistence/parsing/citations
  - feedback pipeline
  - sidebar fetch resilience
  - theme and proxy infrastructure

#### Chat page and review fixes
- `packages/web/src/app/chat/page.tsx` was refactored into:
  - `EmptyState`
  - `MessageList`
  - `ChatInput`
  - `ResearchTrace`
- Layout uses a flex container with a collapsible `ThreadSidebar`, main `ScrollArea`, and conditional `MessageList` vs `EmptyState`.
- Transport still uses `useChat` + `DefaultChatTransport` targeting `${MASTRA_URL}/chat`.

#### Live UI testing
- Two sanctioned paths:
  1. `/preview` dev-only component gallery
  2. Playwright `design` project under `e2e/tests/design/`
- `/preview`:
  - real components against fixtures
  - no auth, no Mastra, no Neo4j
  - protected by production `404` gating
- Playwright design project:
  - saved WorkOS cookie from `auth.setup.ts`
  - `mockMastraAPI`
  - real `/chat` shell
  - screenshots to `e2e/design-shots/`
- Rule: do not add an env-gated auth bypass in `proxy.ts`.

#### Scroll stability
- Keep using `viewport.scrollTo` on the `ScrollArea` viewport rather than `scrollIntoView`.
- Layout adjustments:
  - `min-h-0`
  - `preventScroll: true`
  - `overflow-clip` at the layout root instead of `overflow-hidden`
- `overflow-clip` does not create a formatting context, so it is not a full substitute for `overflow-hidden`.

#### Auth-bound transport reinitialization
- Chat identity expanded from `threadId` to `threadId:resourceId`.
- `resourceId` defaults to `anonymous` until auth loads.
- `DefaultChatTransport` is memoized on `threadId`, `resourceId`, and `getAccessToken`, forcing a fresh transport when auth changes.

#### Thread cache and message restoration
- Thread state is cached per `threadId` and restored after `useChat` recreation.
- `pendingRestore` + `useEffect` rehydrate cached messages after remounts.
- `handleSelectThread` must avoid writing into stale `useChat` instances.
- Reload behavior preserves answer parts, tool parts, and verification badges while dropping internal noise like `data-om-*`.
- Message parsing responsibilities:
  - `message-parts.ts` handles tool/text detection, verification extraction, source extraction, citation normalization, and clipboard rendering
  - `parse-message.ts` converts V4 tool-invocation parts to V5 dynamic-tool parts and coalesces assistant turns
- `thread_message_coalescing_fix.md` narrows merge logic so `step-start` parts are not merged into assistant turns.
- `authenticated_thread_operations.md` centralizes retry-on-401 behavior through `runWithFreshAuth(tokens, op)` and a stable runner API.

#### Message persistence, citations, and feedback
- `convertThreadMessageToUIMessage` preserves structured parts during reload when `MastraMessageContentV2` is present.
- Legacy fallback joins text with `\n\n` to preserve paragraph breaks.
- Citation styling keeps mapped source links quiet and subtle; unmapped links retain gold styling.
- Citation resolution prefers:
  1. exact source-label match
  2. deepest same-policy dotted ancestor
  3. normalized URL fallback
- Feedback spans:
  - `FeedbackRepository`
  - `/feedback` API routes
  - `feedback-client.ts`
  - `MessageActions.tsx`
  - `packages/web/src/app/chat/page.tsx`
- Important rules:
  - `registerApiRoute` paths must not begin with `"/api/"`
  - `getResourceId` must resolve `user.userId` or `user.id`
  - comments are `null` for up ratings

#### Sidebar fetch resilience
- `ThreadSidebar.tsx` and `use-mastra-client.ts` handle thread loading under auth and prop changes.
- Each fetch uses an `AbortController`.
- `401` responses are ignored while `useMastraReady` is false.
- `useMastraClient` recreates the client when the access token changes.

#### Theme and proxy infrastructure
- Next.js 16 proxy migration uses `authkitProxy` in `packages/web/src/proxy.ts` with the new `NextRequest`-only signature.
- Auth routing stays gated to `/auth/callback`, while public asset routes remain excluded.
- Theme persistence is cookie-first:
  - first paint reads from cookie
  - WorkOS metadata is secondary for sync/backfill
- The design system uses a Document of Record editorial style with:
  - `Fraunces`, `Newsreader`, `IBM Plex Mono`
  - parchment/light and library-at-night/dark themes
  - paper-grain overlay
  - print-aware styling
- `data-testid` attributes are retained for testability.

## Structural relationships to retain
- `context/_index.md` and `amendment_pipeline_and_prompt/_index.md` are the main curation/guardrail anchors.
- `deep_research_workflow/_index.md` and `deep_research_workflow_fixes.md` define the research pipeline and hardening.
- `local_dev_setup/_index.md` and the runtime-boundary synthesis entries define environment ownership and deployment correctness.
- `nc_medicaid_agent/_index.md` and `mastra_server_configuration/_index.md` cover agent runtime, storage, timeout, and prompt correctness.
- `packages_pipeline/_index.md`, `navigate_tools/_index.md`, and `search_tooling/_index.md` cover retrieval, crawling, parsing, and search behavior.

## 11) Database operations and schema-aware graph correctness

### `database_operations/_index.md`
Operational knowledge centers on Neo4j reliability, Railway-specific database handling, and schema-aware safeguards.

#### Core context
- The domain covers:
  - database connection and authentication issues
  - environment-specific deployment quirks
  - password rotation and configuration guidance
- Ownership: **Platform Infrastructure Team**
- Usage: document precise fixes for database environment issues and reuse them in future incidents.

#### `neo4j_auth`
- Railway URL-decodes environment variables, so `+` can become a space and corrupt Neo4j passwords.
- `NEO4J_AUTH` only sets the password on first volume initialization; it does **not** update existing databases.
- Safer auth remediation uses an alphanumeric-only password and `ALTER CURRENT USER SET PASSWORD` through the bolt TCP proxy.
- Production refresh must avoid `deploy-data.sh load --reset`; the safe flow uses proxy enablement, live creds, ingest, reference extraction, embedding, then proxy disablement.

#### `neo4j_hybrid_search`
- Hybrid search combines section embeddings, chunk embeddings, concept graph matches, and fulltext keyword hits.
- Retrieval fusion uses **Reciprocal Rank Fusion (RRF)** with **RRF_K = 60**.
- Indexes are expected for `section_embeddings`, `chunk_embeddings`, and `section_fulltext`.
- Search candidates are deduplicated by `section_id`; per-source lists keep the highest score per section before fusion.
- Concept matches use `CONCEPT_MATCH_SCORE = 0.70` and are limited to `min(top_k, 5)`.
- Embedding migration to `voyage-4` was done non-destructively by nulling and re-embedding in place.
- `source_selection_metadata_for_fee_schedules.md` documents metadata-driven fee schedule selection:
  - config-independent behavior
  - variant grouping by normalized group/date
  - buckets: primary, history, archive, companion, reference
  - retrieval-ready = non-reference items in primary/history

#### `neo4j_write_read_consistency`
- `connection.py` is the single session acquisition choke point.
- `get_driver()` and `close_driver()` manage the module-singleton driver lifecycle.
- `CorpusGraphWriter` owns all graph mutations and is the single write-side boundary.
- Multi-statement mutations must use managed transactions via `session.execute_write(...)`, not ad hoc auto-commit calls.
- Document bundle flow:
  - merge document
  - write sections
  - delete stale sections
  - clear changed embeddings/chunks
  - merge relationships
- Cleanup is surgical and idempotent:
  - stale sections are removed
  - unchanged sections keep embeddings/chunks
  - only changed sections are invalidated
- `incremental_crawl_ingest_run_19.md` shows the operational effect:
  - crawl run #19 ingested 34 targeted docs into Railway prod using `voyage-4`
  - corpus grew from 6693 to 6725 docs
  - 1533 sections were added with no missing embeddings
  - retrieval verification succeeded
  - fee_schedule byte-churn must be avoided by selecting only real incremental candidates

#### Cross-cutting schema-aware validation
- Normalize graph outputs before validation.
- Filter null rows from `OPTIONAL MATCH`.
- Validate against schema before search/scoring/verification.
- Use guarded Cypher execution and relationship whitelists.
- Treat structural correctness as a prerequisite, not cleanup.

## 12) Evaluation pipeline and answer-quality measurement

### `evaluation/_index.md`
- Central evaluation domain for the agent.
- Shared pattern:
  - golden-entry-driven pipeline
  - invoke agent
  - retrieve Neo4j evidence
  - judge outputs
  - aggregate metrics
- Answer-quality evaluation:
  - implemented in `packages/pipeline/src/pipeline/eval/levels/answer.py`
  - flow: golden entries → `_invoke_agent` over HTTP with CLI fallback → evidence fetch from Neo4j → `judge_answer` → metrics
  - answer extraction relies on content after `---ANSWER---`
  - judge failures yield `None`
  - agent failures yield `0` with explanation
  - agent invocation times out after 180 seconds
  - `primary_hit` is set when overall score is at least 2
- Retrieval-model finding:
  - `voyage-4-large` vs `voyage-law-2` was effectively a wash
  - bottleneck appears structural, not embedding-model selection
- Cross-reference resolution:
  - implemented in `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`
  - resolution order:
    1. document-level `REFERENCES_DOCUMENT` and `AMENDS`
    2. fallback section-level `REFERENCES` via `HAS_SECTION`
  - missing document IDs are counted as missed without querying the graph
- Shared modules:
  - `packages/pipeline/src/pipeline/eval/levels/answer.py`
  - `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`

### `qa/_index.md`
- The `qa` domain captures Playwright test infrastructure while the synthesis entries define one end-to-end trust chain.
- Core scope:
  - mocked and smoke Playwright suites
  - Mastra streaming and memory API mocking
  - chat and thread-sidebar page objects
- Trust chain:
  - retrieve evidence
  - verify or rewrite unsupported output
  - score only grounded answers
- Hallucination verification:
  - final-answer only
  - runs only when `finishReason` is `stop`
  - requires no pending tool calls and text to be present
  - rewrite-based failure handling
  - stable CLI markers: `---EVIDENCE---`, `---VERIFIER---`, `---ANSWER---`
- Evaluation pipeline:
  - level 3 answer scoring and level 2 cross-reference resolution
  - HTTP-first agent invocation with CLI fallback
  - Neo4j evidence retrieval
  - relationship validation
- Core rule: trust is enforced as a chain, not a single check.

## 13) Frontend UI: chat stability, persistence, and runtime identity

### `frontend_ui/_index.md`
- Covers chat runtime behavior, persistence, and visual/testing infrastructure.
- Main theme:
  - thread identity, auth state, and persisted UI state must stay aligned

#### Chat page and review fixes
- `packages/web/src/app/chat/page.tsx` was refactored into:
  - `EmptyState`
  - `MessageList`
  - `ChatInput`
  - `ResearchTrace`
- Layout uses a flex container with a collapsible `ThreadSidebar`, main `ScrollArea`, and conditional content.
- Transport still uses `useChat` + `DefaultChatTransport` targeting `${MASTRA_URL}/chat`.

#### Live UI testing
- Two sanctioned paths:
  1. `/preview` dev-only component gallery
  2. Playwright `design` project under `e2e/tests/design/`
- `/preview` uses real components against fixtures and is hidden behind production `404` gating.
- The Playwright design project uses a saved WorkOS cookie, `mockMastraAPI`, the real `/chat` shell, and writes screenshots to `e2e/design-shots/`.
- Rule: do not add an env-gated auth bypass in `proxy.ts`.

#### Scroll stability
- Prefer `viewport.scrollTo` on the `ScrollArea` viewport rather than `scrollIntoView`.
- Layout adjustments:
  - `min-h-0`
  - `preventScroll: true`
  - `overflow-clip` at the layout root
- `overflow-clip` is not a full substitute for `overflow-hidden`.

#### Auth-bound transport reinitialization
- Chat identity expanded from `threadId` to `threadId:resourceId`.
- `resourceId` defaults to `anonymous` until auth loads.
- `DefaultChatTransport` is memoized on `threadId`, `resourceId`, and `getAccessToken`, forcing a fresh transport when auth changes.

#### Thread cache and message restoration
- Thread state is cached per `threadId` and restored after `useChat` recreation.
- `pendingRestore` + `useEffect` rehydrate cached messages after remounts.
- `handleSelectThread` must avoid writing into stale `useChat` instances.
- Reload behavior preserves answer parts, tool parts, and verification badges while dropping internal noise like `data-om-*`.
- Message parsing responsibilities:
  - `message-parts.ts` handles tool/text detection, verification extraction, source extraction, citation normalization, and clipboard rendering
  - `parse-message.ts` converts V4 tool-invocation parts to V5 dynamic-tool parts and coalesces assistant turns
- `thread_message_coalescing_fix.md` prevents `step-start` parts from merging into assistant turns.
- `authenticated_thread_operations.md` centralizes retry-on-401 behavior through `runWithFreshAuth(tokens, op)`.

#### Message persistence, citations, and feedback
- `convertThreadMessageToUIMessage` preserves structured parts during reload when `MastraMessageContentV2` is present.
- Legacy fallback joins text with `\n\n`.
- Citation styling keeps mapped source links quiet and subtle; unmapped links retain gold styling.
- Citation resolution prefers exact source-label match, then deepest same-policy dotted ancestor, then normalized URL fallback.
- Feedback spans `FeedbackRepository`, `/feedback` API routes, `feedback-client.ts`, `MessageActions.tsx`, and `packages/web/src/app/chat/page.tsx`.
- Rules:
  - `registerApiRoute` paths must not begin with `"/api/"`
  - `getResourceId` must resolve `user.userId` or `user.id`
  - comments are `null` for up ratings

#### Sidebar fetch resilience
- `ThreadSidebar.tsx` and `use-mastra-client.ts` handle thread loading under auth and prop changes.
- Each fetch uses an `AbortController`.
- `401` responses are ignored while `useMastraReady` is false.
- `useMastraClient` recreates the client when the access token changes.

#### Theme and proxy infrastructure
- Next.js 16 proxy migration uses `authkitProxy` in `packages/web/src/proxy.ts` with the new `NextRequest`-only signature.
- Auth routing stays gated to `/auth/callback`; public asset routes remain excluded.
- Theme persistence is cookie-first:
  - first paint reads from cookie
  - WorkOS metadata is secondary for sync/backfill
- The design system uses a Document of Record editorial style with `Fraunces`, `Newsreader`, `IBM Plex Mono`, parchment/light and library-at-night/dark themes, paper-grain overlay, and print-aware styling.
- `data-testid` attributes are retained for testability.

## 14) Cross-cutting structural relationships

- `context/_index.md` and `amendment_pipeline_and_prompt/_index.md` are the main curation/guardrail anchors.
- `deep_research_workflow/_index.md` and `deep_research_workflow_fixes.md` define the research pipeline and its hardening.
- `local_dev_setup/_index.md` and the runtime-boundary synthesis entries define environment ownership and deployment correctness.
- `nc_medicaid_agent/_index.md` and `mastra_server_configuration/_index.md` cover agent runtime, storage, timeout, and prompt correctness.
- `packages_pipeline/_index.md`, `navigate_tools/_index.md`, and `search_tooling/_index.md` cover retrieval, crawling, parsing, and search behavior.
- `database_operations/_index.md`, `evaluation/_index.md`, and `qa/_index.md` together enforce the chain from graph correctness to scored, grounded answers.
- `frontend_ui/_index.md` ties runtime identity to chat persistence, transport, and feedback integrity.