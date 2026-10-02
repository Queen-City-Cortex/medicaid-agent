---
children_hash: 8aa8e3dfbd63697f9ad189dbc4e81256432a85d28087d1f633868910ee083324
compression_ratio: 0.32170193606483566
condensation_order: 2
covers: [amendment_pipeline_and_prompt/_index.md, context.md, context/_index.md, deep_research_workflow/_index.md, environment-ownership-and-runtime-boundaries-are-a-common-root-cause-class.md, local_dev_setup/_index.md, mastra_server_configuration/_index.md, navigate_tools/_index.md, nc_medicaid_agent/_index.md, neo4j_tool_output_validation/_index.md, packages_pipeline/_index.md, runtime-boundary-bugs-cluster-around-deploy-auth-and-database-initialization.md, search_tooling/_index.md]
covers_token_total: 8884
summary_level: d2
token_count: 2858
type: summary
---
# d2 Structural Summary: Agent Architecture

This level groups the major architecture, runtime, and operational knowledge clusters that define the NC Medicaid Navigator agent and its supporting tooling. The shared themes are runtime-boundary correctness, production safety, retrieval reliability, and curated operational workflows.

## Core architecture and curation workflow
- **`context/_index.md`** is the umbrella summary for agent architecture context:
  - establishes the single-pass RLM curation pattern: recon → extraction → dedup/group → UPSERT → verify
  - emphasizes compact metadata, verified applied file paths, and context-size awareness
  - preserves durable knowledge about context extraction and operational curation
- **`context.md`** defines the domain scope:
  - NC Medicaid policy agent bootstrapping, memory setup, tool wiring, prompt guardrails, and citation rules
  - excludes general Mastra tutorials and non-policy agents

## Amendment interpretation and prompt guardrails
- **`amendment_pipeline_and_prompt/_index.md`** points to **`amendment_pipeline_and_prompt_guardrails.md`** as the canonical source:
  - NC Medicaid amendment-graph interpretation
  - authoritative change-summary extraction
  - system-prompt guardrails for policy QA
  - preserves pipeline details, traversal heuristics, prompt rules, examples, and facts

## Runtime boundaries, environment ownership, and consistency
- **`mastra_upgrade_type_and_runtime_boundaries.md`** captures the shared runtime-boundary fix:
  - `Tool.execute` becomes `Promise<void | TOutput>`
  - route and middleware handlers use `ContextWithMastra`
  - auth middleware must precede resource binding middleware
  - `bindResourceToAuthenticatedUser` copies the authenticated user into `MASTRA_RESOURCE_ID_KEY`
  - vendored `@mastra/core` Hono types must be used consistently over standalone `hono` types
- Related synthesis entries reinforce the same class of bugs:
  - **`runtime-boundary-bugs-cluster-around-deploy-auth-and-database-initialization.md`**
  - **`environment-ownership-and-runtime-boundaries-are-a-common-root-cause-class.md`**
- Shared pattern across these entries:
  - runtime-owned values must be resolved live
  - build-time assumptions cause failures in auth, deploy, and database initialization
  - root `.env` / live environment state is the source of truth

## Policy corpus embedding, verification, and search
- **`policy_corpus_embedding_client_and_verifier_flow.md`** defines the policy-corpus pipeline:
  - `createNeo4jPolicyCorpus` produces singleton `policyCorpus`
  - `embedQuery` wraps `embedQueries`
  - queries go to Voyage via `VOYAGE_API_URL` and `VOYAGE_MODEL`
  - verification emits one JSON telemetry line after `---VERIFIER---`
  - all outgoing text is sanitized for deterministic URL and quote cleanup
- **`search_tooling/_index.md`** summarizes the hybrid policy search tool:
  - Voyage embeddings
  - per-type-group vector search
  - concept graph matching
  - reciprocal rank fusion
  - Neo4j indexes
  - `searchSections` flow

## Validation, grounding, and answer quality
- **`neo4j_tool_output_validation/_index.md`** documents Neo4j-backed read-tool validation:
  - normalized numeric metadata
  - Zod-compatible payloads
  - container-heading expansion
  - structured context queries
- **`deep_research_workflow/_index.md`** and **`deep_research_workflow_fixes.md`** describe the research/verification pipeline:
  - plan → approval → research → synthesize → verify
  - deterministic URL grounding via `validateAnswerUrls`
  - worker guards, model routing fixes, cancel-state correction, and readable source labels
- Common design principle:
  - verify grounding against sources rather than relying on chat-style heuristics

## Reliability hardening, production smoke tests, and backups
- **`provider_health_checks_and_production_smoke_verification.md`**:
  - real-provider health probing
  - OpenAI outage classification by `401`, `403`, `429`, `5xx`
  - `gpt-5-mini` can return `400 invalid_request` when reasoning exhausts `max_completion_tokens`
  - production usage tracking and `modelId` reporting verified live
- **`ws2_customer_readiness_reliability_fixes.md`**:
  - `/healthz` probes Voyage and OpenAI with 5s timeouts and 60s cache
  - `embedQueries` retries once on 429/5xx/network/abort
  - Neo4j sessions set 30s server-side transaction timeout
  - Sentry only activates when both `SENTRY_DSN` and `SENTRY_ENVIRONMENT` exist
- **`backup_mastra_shell_script_learnings.md`**:
  - point-in-time backup uses `sqlite3 VACUUM INTO` inside Railway
  - remote success must be confirmed with `SNAPSHOT_OK`
  - overwrite prevention requires deleting an existing target first
  - local download, integrity check, upload via `rclone`, and 30-day pruning complete the backup flow

## Production corpus operations and infrastructure lifecycle
- **`railway_pr6_corpus_operations.md`** documents production corpus release topology:
  - Railway Pro with blue/green Neo4j
  - dedicated corpus-job services
  - resumable parsing with persistent artifacts
  - bounded parse timeouts and concurrency safeguards
  - release promotion gated by build, load, embedding, audit, eval, and authenticated smoke checks
  - OpenCV runtime blocker fixed with `libgl1` and in-image cv2 smoke test
- **`railway_tcp_proxy_automation.md`** covers temporary Neo4j TCP proxy lifecycle:
  - `create`, `delete`, `list` subcommands around Railway GraphQL v2
  - token fallback from `ops.env` to Railway CLI config
  - trailing-dot cleanup on proxy domains
  - post-delete verification ensures no proxies remain

## Scheduled operations, eval gates, and weekly refresh
- **`weekly_eval_and_launchd_ops_guardrails.md`** defines scheduled ops safety:
  - retrieval eval gate compares newest eval against last-known-good baseline
  - launchd installer bootstraps daily/weekly/backup agents from templated plists
  - first-run verification requires healthchecks setup and supervised `launchctl kickstart`
  - baseline stored in `~/.cache/nc-medicaid/last-good-eval`
- **`ws7_customer_readiness_weekly_refresh.md`** is the top-level orchestration flow:
  - crawl → pipeline run-all → audit → eval-gate → change-gate → optional deploy-data → verify → backup
  - deployment blocked by retrieval regression
  - destructive deploy skipped when corpus state is unchanged unless `FORCE_DEPLOY=1`
  - TCP proxy cleanup runs in an `EXIT` trap to prevent public bolt exposure
  - launchd schedules the workflow, but manual execution is also supported

## Customer-ready web surface, chat, and usage attribution
- **`ws1_customer_readiness_legal_surface_and_chat_guardrails.md`**:
  - public routes: `/`, `/terms`, `/privacy`
  - `proxy.ts` allowlists unauthenticated paths including `/auth/callback` and `/preview`
  - `DisclaimerNotice` persistence uses `localStorage` key `disclaimer-acknowledged-v1`
  - `DeepResearchReport` renders only real `http(s)` links
  - `MessageList` opens by default when sources exist
  - debug logging gated by `NEXT_PUBLIC_DEBUG_CHAT=1`
- **`ws5_customer_readiness.md`**:
  - `/chat` uses `registerApiRoute + handleChatStream`
  - per-request `onFinish` records usage rows in LibSQL
  - `getBoundUserId` handles attribution
  - pricing uses longest-prefix model matching
  - usage recording is best-effort and must not break chat
  - OpenAI health probing must use a real chat completion, not `/v1/models`
  - records the 2026-07-10 outage where both OpenAI keys were exhausted

## Local development, CI, and documentation maintenance
- **`local_dev_setup/_index.md`** groups repository-level dev guidance:
  - `local_development_setup.md` is the main local startup reference for Neo4j, web, and agent services
  - `ci_workflow_concurrency_and_test_gates.md` defines the CI structure:
    - main `test` job plus parallel `docker-build`
    - lint, build, typecheck, JS tests, pipeline pytest, and agent integration tests
    - branch-safe concurrency; never cancel main runs
    - e2e omitted because WorkOS hosted-login cannot be exercised hermetically
  - `env_consolidation/_index.md` makes root `.env` the single source of truth and symlinks package env files to it
  - `repository_doc_audit_findings.md` preserves the doc-maintenance convention and audit findings, including the stale `packages/web/README.md` correction

## Mastra server configuration
- **`mastra_server_configuration/_index.md`** highlights:
  - **`mastra_server_timeout_tuning.md`** as the canonical timeout record
  - the server timeout was raised to support long-running multi-step research
  - preserved facts: 10-minute timeout, SSE lifecycle, and multi-step tool research exceeding 180 seconds

## Agent runtime and storage hardening
- **`nc_medicaid_agent/_index.md`** consolidates the core implementation notes:
  - `startup_and_web_ui_hardening.md` covers env validation, Mastra config, server routes, web UI constraints, CLI behavior, and anti-hallucination prompt rules
  - `cli_runner.md` covers CLI memory payloads, `cli-${Date.now()}` thread behavior, `onIterationComplete` synthesis guardrails, and `closeDriver()` cleanup
  - `libsql_storage_fix_for_railway.md` records the Railway fix:
    - replace DuckDB/MastraCompositeStore with `LibSQLStore`
    - Alpine/musl incompatibility made DuckDB native bindings unusable
    - canonical files: `packages/agent/src/index.ts` and `packages/agent/package.json`
  - `ssa_and_cfr_reference_resolution_fixes.md` preserves legal citation correctness:
    - SSA-to-USC mapping fixes
    - CFR citation parsing
    - part-level-only supersession redirects
    - re-ingestion sequence `ingest-ssa --refresh` → `extract-refs` → `embed`
  - `nc_medicaid_navigator_agent.md` anchors prompt and metadata guidance, including source URL support, startup validation, tool taxonomy, amendment verification, and response-format rules

## Retrieval, crawler, and parsing pipeline
- **`packages_pipeline/_index.md`** ties together retrieval behavior, crawler architecture, and SSA parsing stability:
  - retrieval uses per-group vector overscan, fulltext recovery, and `sectionId`-based dedup/merge
  - `crawler_cli_and_package_docs.md` documents crawler CLI entrypoints, npm shortcuts, and docs linkage
  - `crawler_source_factories.md` describes reusable source factories and managed-care contract traversal
  - `crawler_sync_behavior/_index.md` covers download/check phase separation and retryable 404 behavior
  - `ssa_parser_subsection_splitting_fix.md` keeps parent section identity stable while splitting large SSA subsections

## Cross-cluster relationships and recurring patterns
- **Runtime boundary correctness** is a shared root cause across:
  - auth integration
  - database initialization
  - server configuration
  - deployment and startup hardening
- **Verification-first operations** recur across:
  - provider health checks
  - weekly eval gates
  - deep research synthesis
  - production smoke testing
- **Production safety and cleanup** recur across:
  - Railway proxy automation
  - backup scripts
  - scheduled refresh orchestration
  - deployment gating
- **Retrieval and citation correctness** recur across:
  - policy search
  - Neo4j output validation
  - crawler/retrieval pipeline
  - SSA/CFR resolution
- **Durable operational knowledge** is consistently preserved through consolidated drill-down files, with `_index.md` summaries pointing to the canonical detailed entries.