---
children_hash: b794e11af7538e6f5ab1d6a9331e807f098b89f372a28b592e643b1bafd537e5
compression_ratio: 0.17871859093479842
condensation_order: 1
covers: [backup_mastra_shell_script_learnings.md, context.md, curated_context.md, curated_operational_knowledge.md, epsdt_exception_completeness_workstream_e.md, mastra_upgrade_type_and_runtime_boundaries.md, policy_corpus_embedding_client_and_verifier_flow.md, provider_health_checks_and_production_smoke_verification.md, railway_pr6_corpus_operations.md, railway_tcp_proxy_automation.md, weekly_eval_and_launchd_ops_guardrails.md, ws1_customer_readiness_legal_surface_and_chat_guardrails.md, ws2_customer_readiness_reliability_fixes.md, ws5_customer_readiness.md, ws7_customer_readiness_weekly_refresh.md]
covers_token_total: 12377
summary_level: d1
token_count: 2212
type: summary
---
# d1 Structural Summary: Agent Architecture Context

## Operational context and curation workflow
- **context.md** establishes the core operational framing: single-pass RLM context handling using precomputed recon data, with emphasis on compact metadata, verification, and context size awareness.
- **curated_context.md** captures a durable snapshot of context curation itself: source context was extracted into lasting knowledge with a single-pass process and no raw-text dumping.
- **curated_operational_knowledge.md** broadens this into the reusable session workflow:
  - recon → extraction → dedup/group → UPSERT curate → verify applied file paths
  - relies on precomputed recon, context variable, and curation history metadata
  - records that the source context was small enough for single-pass processing
- **epsdt_exception_completeness_workstream_e.md** is a minimal durable capture of a specific workstream context, showing the same extraction-to-knowledge pattern.

## Runtime boundaries, types, and shared context handling
- **mastra_upgrade_type_and_runtime_boundaries.md** documents a shared fix across tools, routes, and middleware:
  - `Tool.execute` becomes `Promise<void | TOutput>`
  - route and middleware handlers use `ContextWithMastra`
  - auth middleware precedes resource binding middleware
  - `bindResourceToAuthenticatedUser` copies the authenticated user into `MASTRA_RESOURCE_ID_KEY`
  - vendored Hono types from `@mastra/core` conflict with standalone `hono` types, so the core server context types must be used consistently
- The entry links strongly to auth and customer-readiness work, showing runtime boundary correctness as a recurring theme.

## Policy corpus embedding and answer verification
- **policy_corpus_embedding_client_and_verifier_flow.md** describes the agent’s policy-corpus pipeline:
  - `createNeo4jPolicyCorpus` produces a singleton `policyCorpus`
  - `embedQuery` wraps `embedQueries`
  - queries are posted to Voyage via `VOYAGE_API_URL` and `VOYAGE_MODEL`
  - verification emits a single JSON telemetry line after a `---VERIFIER---` marker
  - outgoing text is always sanitized for deterministic URL and quote cleanup
- Verification rewrites are triggered for unsupported, irrelevant, major relevance issues, or incomplete citations.
- If verification is unavailable, a disclaimer is appended and critical details should be checked against NC DHHS.

## Provider health, smoke verification, and backup operations
- **provider_health_checks_and_production_smoke_verification.md** focuses on real-provider health probing and production smoke testing:
  - OpenAI outages are classified only by `401`, `403`, `429`, and `5xx`
  - `gpt-5-mini` can return `400 invalid_request` when `max_completion_tokens` is exhausted by reasoning
  - smoke verification must expand the research trail before counting tool steps
  - production usage tracking and `modelId` reporting were verified live
- **backup_mastra_shell_script_learnings.md** captures backup lessons for the production LibSQL store:
  - point-in-time snapshot via `sqlite3 VACUUM INTO` inside the Railway container
  - remote success must be confirmed with `SNAPSHOT_OK` because `railway ssh` exit status is unreliable
  - same-day retry requires removing the target first, since `VACUUM INTO` refuses overwrite
  - local download uses overwrite support, followed by integrity check, upload via `rclone`, and 30-day pruning
- Together these entries define the operational guardrails for production recovery, verification, and backup durability.

## Railway production corpus operations and proxy lifecycle
- **railway_pr6_corpus_operations.md** documents the PR6 corpus production topology and release pipeline:
  - Railway Pro with blue/green Neo4j and dedicated corpus-job services
  - resumable parsing with persistent artifacts
  - bounded parse timeouts and concurrency safeguards
  - release promotion gated by build, load, embedding, audit, evaluation, and authenticated smoke checks
  - OpenCV runtime blocker fixed by adding `libgl1` and an in-image cv2 smoke test
- **railway_tcp_proxy_automation.md** covers temporary Neo4j TCP proxy management:
  - `create`, `delete`, and `list` subcommands around Railway GraphQL v2
  - token fallback from `ops.env` to Railway CLI config
  - trailing-dot cleanup on returned proxy domains
  - post-delete verification ensures no proxies remain
- These two entries connect operational corpus release work with the temporary network exposure needed for deploy-data.

## Scheduled ops, eval gating, and launchd
- **weekly_eval_and_launchd_ops_guardrails.md** defines the scheduled ops safety model:
  - retrieval eval gate compares the newest eval result to the last-known-good baseline
  - launchd installer bootstraps daily/weekly/backup agents via templated plists
  - first-run verification requires healthchecks setup and supervised `launchctl kickstart`
  - eval baseline lives in `~/.cache/nc-medicaid/last-good-eval`
- **ws7_customer_readiness_weekly_refresh.md** is the top-level weekly-refresh orchestrator:
  - crawl → pipeline run-all → audit → eval-gate → change-gate → optional deploy-data → verify → backup
  - deployment is blocked by retrieval regression
  - destructive deploy is skipped when corpus state is unchanged unless `FORCE_DEPLOY=1`
  - Neo4j TCP proxy cleanup runs in an `EXIT` trap to prevent public bolt exposure
  - launchd schedules the refresh, but it can also be run manually

## Customer-readiness web surface and chat guardrails
- **ws1_customer_readiness_legal_surface_and_chat_guardrails.md** covers the public-facing legal and chat surface:
  - public routes: `/`, `/terms`, `/privacy`
  - `proxy.ts` allowlists unauthenticated paths including `/auth/callback` and `/preview`
  - persistent `DisclaimerNotice` uses `localStorage` key `disclaimer-acknowledged-v1`
  - `DeepResearchReport` only renders real `http(s)` links
  - `MessageList` opens by default when sources exist
  - debug logging is gated by `NEXT_PUBLIC_DEBUG_CHAT=1`
- The theme is controlled exposure: customer-ready public pages without broad route access, plus safer defaults for report and chat rendering.

## Reliability hardening across health, embeddings, database, and observability
- **ws2_customer_readiness_reliability_fixes.md** bundles four hardening tracks:
  - `/healthz` probes Voyage and OpenAI with 5s timeouts and a 60s cache
  - `embedQueries` retries Voyage failures once after 1s for 429/5xx/network/abort cases
  - Neo4j sessions inject a 30s server-side transaction timeout and configure driver limits
  - Sentry is disabled unless both `SENTRY_DSN` and `SENTRY_ENVIRONMENT` are present
- It also records a local Mastra dev workaround: `MASTRA_OBSERVABILITY_PATH=:memory:` when `mastra.duckdb` migration is missing.
- This entry shows the system’s pattern of pushing failures earlier, bounding expensive calls, and gating observability carefully.

## Chat streaming, usage attribution, and runtime behavior
- **ws5_customer_readiness.md** focuses on the chat runtime and usage pipeline:
  - `/chat` uses `registerApiRoute + handleChatStream`
  - per-request `onFinish` records usage rows in LibSQL
  - `getBoundUserId` supplies attribution
  - pricing uses longest-prefix model matching
  - usage recording is best-effort and must not break successful chat
  - usage retention is pruned opportunistically
  - OpenAI health probing must use a real chat completion, since `/v1/models` can still return 200 during quota exhaustion
- It also records the 2026-07-10 outage where both `OPENAI_API_KEY` and `EVAL_OPENAI_API_KEY` were exhausted, taking production chat down.

## Cross-entry relationships and recurring patterns
- Several entries share a common operational spine:
  - **weekly-refresh / eval / launchd / proxy**: `ws7_customer_readiness_weekly_refresh.md`, `weekly_eval_and_launchd_ops_guardrails.md`, and `railway_tcp_proxy_automation.md`
  - **health / verification / production smoke**: `provider_health_checks_and_production_smoke_verification.md`, `ws2_customer_readiness_reliability_fixes.md`, and `ws5_customer_readiness.md`
  - **runtime boundary correctness**: `mastra_upgrade_type_and_runtime_boundaries.md`, `ws1_customer_readiness_legal_surface_and_chat_guardrails.md`, and `ws2_customer_readiness_reliability_fixes.md`
  - **corpus production operations**: `railway_pr6_corpus_operations.md` ties into deploy gates, proxy handling, and backup verification
- Across the set, the dominant patterns are:
  - prefer real provider calls over superficial probes
  - gate risky production changes on measurable eval or health conditions
  - use explicit cleanup/teardown for transient infrastructure
  - preserve resumability and retry idempotence in operational scripts
  - keep runtime context, auth state, and resource binding aligned across layers