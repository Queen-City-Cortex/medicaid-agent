---
children_hash: 6ab16866cac63caea27ed68f3f929dc60f5450b24e8f9aa0a0252d98f944a2e0
compression_ratio: 0.44932432432432434
condensation_order: 0
covers: [production_smoke_test.md, provider_health_checks.md]
covers_token_total: 2072
summary_level: d0
token_count: 931
type: summary
---
## d0 Structural Summary

### Health and Production Verification

This set documents two operational checks that support deployment confidence and production readiness: **provider health checks** for `/healthz` and a **production smoke test** for the chat experience. Both are designed to avoid false positives, reflect real production failure modes, and surface issues that would otherwise only appear after deployment.

#### `provider_health_checks.md`
- Covers `packages/agent/src/health.ts`, which exports `checkProviders` and `resetProviderHealthCache`.
- Core design:
  - **Neo4j and LibSQL are the deploy-gating health sources**.
  - **OpenAI and Voyage are informational** and should not directly determine deploy health.
- Health-check flow:
  - `/healthz` request → cached result or refresh → parallel Voyage/OpenAI probes → status classification → cache update.
- Key reliability pattern:
  - Uses **stale-while-revalidate caching** with a **60-second refresh window** so frequent probes do not burn provider quota.
  - Concurrent refreshes are deduplicated with a shared `inFlight` promise.
  - `resetProviderHealthCache` is a test hook that clears memoized state and in-flight work.
- OpenAI classification is status-based, not `response.ok`-based:
  - Treats `401`, `403`, `429`, and `5xx` as outages.
  - Other `4xx` responses are considered proof that the key and billing work, and must not be mistaken for provider failure.
- Probe characteristics:
  - Uses a **minimal single-token embed** for Voyage.
  - Uses a **minimal 1-token OpenAI completion** with `gpt-5-mini` by default via `HEALTHZ_OPENAI_PROBE_MODEL`.
  - Uses a **5-second timeout** for health probes.
- Drills:
  - See the entry for details on cache semantics, status classification, and probe implementation constraints.

#### `production_smoke_test.md`
- Documents `e2e/scripts/smoke-production.mjs`, a Playwright-based production smoke test for `/chat`.
- Core flow:
  - Load env files → authenticate via WorkOS → open a fresh chat thread → ask a question → wait for final answer → expand research trail → count tool steps → save screenshot.
- Key validation rules:
  - Requires **`TEST_USER_EMAIL`** and **`TEST_USER_PASSWORD`**.
  - Fails if the assistant ends in an error state, returns no answer, or the answer is too short.
  - By default, the answer must be at least **200 characters**.
  - Requires at least **one visible tool step** and visible sources.
- UI-specific behavior:
  - The **research trail collapsible unmounts step cards**, so the script must click `research-trail-trigger` before counting steps.
- Env precedence:
  - Loads `.env.local` before `.env`, including `packages/web/.env.local` before `packages/web/.env`, so local overrides win.
- Output and artifacts:
  - Saves a screenshot on success, and a `.failed` screenshot on error.
  - Default screenshot path: `/tmp/nc-medicaid-prod-smoke.png`.
- Operational significance:
  - Reflects the post-quota-topup production expectation where a healthy run includes visible sources and multiple tool steps.
- Drills:
  - See the entry for exact validation behavior, DOM dependencies, and failure conditions.

### Shared Operational Pattern
- Both entries emphasize **production realism over superficial success**:
  - health checks classify by failure mode rather than shallow status,
  - smoke tests validate actual response quality and visible evidence.
- Both include **guardrails against misleading passes**:
  - provider checks avoid conflating quota/billing states with outages,
  - smoke tests account for collapsed UI elements and incomplete responses.
- Both rely on **cached or preloaded behavior** to reduce unnecessary overhead while preserving correctness.