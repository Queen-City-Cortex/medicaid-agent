---
title: Provider Health Checks
tags: []
related: [packages/agent/src/provider_health_checks_and_production_smoke_verification.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-10T21:31:45.652Z'
updatedAt: '2026-07-10T21:31:45.652Z'
---
## Raw Concept
**Task:**
Document provider reachability checks for /healthz in packages/agent/src/health.ts

**Changes:**
- Added provider health classification for OpenAI status codes so quota and billing success are not misread as outages
- Kept Neo4j and LibSQL as the deploy-gating health status sources while provider checks remain informational
- Cached provider checks with stale-while-revalidate behavior and a one-minute refresh window
- Added a test hook to reset the memoized health cache

**Files:**
- packages/agent/src/health.ts

**Flow:**
healthz request -> cached result or refreshProviders -> parallel Voyage and OpenAI probes -> status classification -> cache update

**Timestamp:** 2026-07-10

**Patterns:**
- `^(401|403|429|5\d{2})$` - OpenAI statuses treated as outages

## Narrative
### Structure
The module exports checkProviders and resetProviderHealthCache. checkProviders returns cached provider statuses when available and triggers background refresh after the cache window expires. refreshProviders deduplicates concurrent callers with a shared inFlight promise.

### Dependencies
Relies on VOYAGE_API_KEY, VOYAGE_API_URL, VOYAGE_MODEL, the OpenAI API key, strEnv for the optional probe model override, and logger helpers for failure reporting.

### Highlights
The health probe no longer treats all non-200 OpenAI responses as outages. It specifically distinguishes quota/billing-proof 4xx responses from actual failures, avoiding false red health alarms after quota top-up.

### Rules
Provider reachability checks for /healthz. Neo4j and LibSQL decide the health status (they gate deploy promotion); these are informational — an expired OpenAI key or a Voyage outage previously passed healthchecks and only surfaced on the first real chat. Results are cached so Railway's frequent probes (and any external uptime monitor) don't burn provider quota: at most one real check per provider per minute.

A minimal single-token embed — validates key, model, and reachability.
Deliberately NOT embedQueries(): that path retries with backoff, which a 5s health probe must not do.

A minimal 1-token completion, NOT GET /v1/models: the models endpoint is free and returns 200 even when the account's quota is exhausted — which is exactly the failure mode that takes every chat down (observed in production 2026-07-10). Cost is ~nothing at one call per cache window; during an actual quota outage the call is free (it fails).

Classify by status, not response.ok: 401/403 (bad key), 429 (quota / rate) and 5xx (provider down) are the outages chats would hit. Other 4xx prove the key AND billing work — e.g. gpt-5-mini spends its 1-token budget on reasoning and returns an invalid_request "output limit reached" 400 (observed 2026-07-10 right after the quota top-up), which must not read as an outage.

Stale-while-revalidate: only the first probe after boot waits on the network (bounded by the 5s probe timeout). Every later probe answers instantly from cache, kicking an expired refresh in the background — a hung provider must not add latency to /healthz and trip tight-budget uptime monitors.

Test hook: drop the memoized result so the next check hits the network.

### Examples
The OpenAI probe body uses model gpt-5-mini, messages with a single user ok, and max_completion_tokens: 1.

## Facts
- **health_gate_providers**: Provider health checks for /healthz use Neo4j and LibSQL as the deploy gates, while OpenAI and Voyage are informational providers. [project]
- **provider_health_cache_ttl**: Provider health results are cached for 60 seconds and only one real check per provider per minute is performed. [convention]
- **provider_health_timeout**: Provider checks use a 5 second timeout. [project]
- **openai_health_status_classification**: OpenAI health classification treats 401, 403, 429, and 5xx as outages, while other 4xx statuses prove the key and billing work. [project]
- **openai_probe_model**: The OpenAI probe uses gpt-5-mini by default via HEALTHZ_OPENAI_PROBE_MODEL. [project]
- **voyage_health_probe**: Voyage health checks send a minimal single-token embed request with input healthz and input_type query. [project]
- **provider_health_refresh_strategy**: checkProviders uses stale-while-revalidate behavior so cached probes return immediately and refresh in the background when expired. [project]
- **provider_health_cache_reset**: resetProviderHealthCache clears both the memoized result and any in-flight request. [project]
