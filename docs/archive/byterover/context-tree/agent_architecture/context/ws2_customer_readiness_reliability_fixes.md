---
title: WS2 Customer Readiness Reliability Fixes
summary: 'WS2 customer-readiness fixes: /healthz now probes Voyage and OpenAI with caching, embedQueries retries Voyage failures with timeout, Neo4j enforces server-side transaction timeouts, and Sentry requires an explicit environment.'
tags: []
related: [agent_architecture/context/ws5_customer_readiness.md, agent_architecture/context/ws1_customer_readiness_legal_surface_and_chat_guardrails.md, agent_architecture/context/policy_corpus_embedding_client_and_verifier_flow.md, agent_architecture/context/mastra_upgrade_type_and_runtime_boundaries.md, agent_architecture/context/ws7_customer_readiness_weekly_refresh.md, agent_architecture/context/weekly_eval_and_launchd_ops_guardrails.md, agent_architecture/context/railway_tcp_proxy_automation.md, agent_architecture/context/provider_health_checks_and_production_smoke_verification.md, agent_architecture/context/railway_pr6_corpus_operations.md]
keywords: []
createdAt: '2026-07-10T18:28:16.347Z'
updatedAt: '2026-07-10T18:28:16.347Z'
---
## Reason
Document the customer-readiness hardening across health checks, embeddings, Neo4j timeouts, and Sentry gating

## Raw Concept
**Task:**
Document WS2 customer-readiness reliability hardening across health checks, embeddings, database timeouts, and error tracking

**Changes:**
- Extended /healthz with Voyage and OpenAI reachability checks in src/health.ts
- Added Voyage timeout and one-retry behavior in policy-corpus.ts
- Injected Neo4j server-side transaction timeout via withSession and added driver connection limits
- Warned when SENTRY_DSN is present without SENTRY_ENVIRONMENT
- Recorded local mastra dev crash workaround and migration requirement

**Files:**
- packages/agent/src/health.ts
- packages/agent/src/policy-corpus.ts
- packages/agent/src/neo4j.ts
- packages/agent/src/sentry.ts

**Flow:**
/healthz probe -> provider reachability checks -> cached status; search request -> Voyage embed with timeout and retry; Neo4j session -> injected transaction timeout; startup -> Sentry gated by DSN plus explicit environment

**Timestamp:** 2026-07-10T18:27:38.701Z

## Narrative
### Structure
The context describes four coordinated hardening changes across health probing, embedding retrieval, Neo4j query execution, and Sentry initialization, plus an operational workaround for local Mastra development.

### Dependencies
Health checks depend on fetch and AbortSignal.timeout, embedding depends on Voyage API access, Neo4j timeout enforcement depends on session.run rebinding and TransactionConfig from neo4j-driver-core, and Sentry initialization depends on both SENTRY_DSN and SENTRY_ENVIRONMENT.

### Highlights
The design prevents provider outages from surfacing only on first chat, bounds expensive upstream calls, limits runaway Neo4j queries, and avoids leaking local HMR errors into shared Sentry projects. The local Mastra workaround is to use MASTRA_OBSERVABILITY_PATH=:memory: when mastra.duckdb migration is missing.

## Facts
- **healthz_providers**: /healthz now checks Voyage and OpenAI reachability [project]
- **provider_health_timeout_and_cache**: Provider health checks use 5s AbortSignal timeouts and a 60s cache [project]
- **provider_health_inflight_deduplication**: Provider checks share a single in-flight promise to avoid stampedes [project]
- **deploy_gate_health_sources**: Only Neo4j and LibSQL health determine deploy promotion; provider checks are informational [project]
- **voyage_timeout**: embedQueries uses VOYAGE_TIMEOUT_MS set to 15s [project]
- **voyage_retry_policy**: embedQueries retries once after 1s backoff for 429, 5xx, network, or abort failures [project]
- **neo4j_transaction_timeout**: Neo4j sessions inject a 30s server-side transaction timeout by rebinding session.run [project]
- **neo4j_driver_timeouts**: Neo4j driver is configured with connectionTimeout, connectionAcquisitionTimeout, and maxTransactionRetryTime [project]
- **sentry_environment_gate**: Sentry is disabled when SENTRY_DSN is set but SENTRY_ENVIRONMENT is missing [project]
- **mastra_duckdb_migration_requirement**: Local mastra dev can crash on mastra.duckdb unless npx mastra migrate is run [project]
- **mastra_observability_workaround**: MASTRA_OBSERVABILITY_PATH=:memory: is a workaround for local mastra dev crashes [project]
