---
title: WS5 Customer-Readiness
summary: Chat streaming, usage attribution, usage reporting, health checks, and CLI/runtime behavior for the WS5 customer-readiness workstream.
tags: []
related: [agent_architecture/context/ws2_customer_readiness_reliability_fixes.md, agent_architecture/context/ws1_customer_readiness_legal_surface_and_chat_guardrails.md, agent_architecture/context/policy_corpus_embedding_client_and_verifier_flow.md, agent_architecture/context/mastra_upgrade_type_and_runtime_boundaries.md, agent_architecture/context/ws7_customer_readiness_weekly_refresh.md, agent_architecture/context/weekly_eval_and_launchd_ops_guardrails.md, agent_architecture/context/railway_tcp_proxy_automation.md, agent_architecture/context/provider_health_checks_and_production_smoke_verification.md]
keywords: []
createdAt: '2026-07-10T19:34:30.600Z'
updatedAt: '2026-07-10T19:34:30.600Z'
---
## Reason
Curate the WS5 customer-readiness PR context into durable knowledge

## Raw Concept
**Task:**
Document WS5 customer-readiness findings for the agent runtime and usage pipeline

**Changes:**
- Switched /chat to registerApiRoute + handleChatStream for per-request onFinish attribution
- Added LibSQL-backed usage_event recording and usage reporting support
- Changed /healthz OpenAI probing to a real chat completion because /v1/models is insufficient
- Recorded the 2026-07-10 quota outage and the git rebase --onto gotcha

**Files:**
- packages/agent/src/index.ts
- packages/agent/src/usage/repository.ts
- packages/agent/src/usage/pricing.ts
- packages/agent/src/health.ts

**Flow:**
chat request -> handleChatStream -> onFinish -> UsageRepository.record -> usage_events row -> reporting; healthz -> provider probes -> cache -> response

**Timestamp:** 2026-07-10

**Author:** WS5 customer-readiness session

## Narrative
### Structure
The knowledge spans chat streaming, usage accounting, pricing lookup, health checks, and CLI/runtime behavior. The main operational boundary is that successful chat delivery must not depend on usage recording, while health checks must probe providers in a way that matches real failure modes.

### Dependencies
Depends on LibSQL for usage persistence, getBoundUserId for attribution, and provider-specific probes for health status. The OpenAI health probe must use a chat completion because GET /v1/models can report healthy during quota exhaustion.

### Highlights
Usage is best-effort and pruned opportunistically. Pricing is model-prefix based. The 2026-07-10 outage established that quota exhaustion can break production chat even when /v1/models still returns 200.

### Examples
The /chat handler attaches an onFinish callback that records usage rows, and /healthz checks Neo4j, storage, Voyage, and OpenAI before returning ok or degraded.

## Facts
- **chat_streaming_route**: /chat now uses registerApiRoute + handleChatStream from @mastra/ai-sdk instead of chatRoute [project]
- **usage_attribution**: Per-request onFinish is needed so usage can be attributed to the authenticated user [project]
- **user_id_source**: getBoundUserId from auth-middleware provides the user id [project]
- **on_finish_fields**: The onFinish event provides totalUsage, model, and runId [project]
- **finish_event_type**: The finish-event type is derived as Parameters<NonNullable<AgentExecutionOptions['onFinish']>>[0] [project]
- **mastra_stream_export_gap**: @mastra/core/stream does not re-export MastraOnFinishCallbackArgs [project]
- **usage_storage**: usage_events are stored in LibSQL [project]
- **usage_recording_policy**: UsageRepository records usage in a best-effort way and failures must not break a successful chat [project]
- **usage_retention**: Usage retention is pruned opportunistically using USAGE_RETENTION_DAYS with default 400 days [project]
- **pricing_lookup**: pricing.ts uses longest-prefix match for model pricing [project]
- **usage_report_flags**: scripts/usage-report.ts supports --month and --by [project]
- **openai_models_probe_limit**: GET /v1/models returns 200 even when OpenAI quota is exhausted [project]
- **openai_health_probe**: The /healthz OpenAI probe must be a 1-token chat completion [project]
- **outage_date**: The 2026-07-10 quota outage took production chat down [project]
- **quota_exhaustion**: Both OPENAI_API_KEY and EVAL_OPENAI_API_KEY were exhausted during the outage [project]
- **on_finish_error_behavior**: onFinish does not fire on upstream quota errors, so failed runs do not create usage rows [project]
- **git_rebase_behavior**: git rebase --onto X Y branchname checks out branchname [convention]
