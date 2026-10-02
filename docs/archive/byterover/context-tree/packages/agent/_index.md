---
children_hash: 01fc55a79538140543686ad0291b70b2c9277931e64cf964c30b8e50bab21c54
compression_ratio: 0.7218344965104686
condensation_order: 1
covers: [src/_index.md]
covers_token_total: 1003
summary_level: d1
token_count: 724
type: summary
---
## d1 Structural Summary

### Operational Readiness and Verification
This level groups two production-facing checks that validate deployment health and user-visible chat behavior. Both prioritize **real failure modes over superficial success**, using careful classification and UI-aware validation to avoid misleading passes.

#### `provider_health_checks.md`
- Documents `packages/agent/src/health.ts`.
- Exports `checkProviders` and `resetProviderHealthCache`.
- **Deploy-gating sources:** Neo4j and LibSQL.
- **Informational sources:** OpenAI and Voyage; their failures should not directly fail deploy health.
- Flow: `/healthz` request → cached result or refresh → parallel provider probes → status classification → cache update.
- Uses **stale-while-revalidate caching** with a **60-second refresh window** and deduplicated refreshes via a shared `inFlight` promise.
- `resetProviderHealthCache` is a test hook for clearing memoized state and in-flight work.
- OpenAI health is classified by **status code**, not `response.ok`:
  - Treat `401`, `403`, `429`, and `5xx` as outages.
  - Other `4xx` responses indicate the key/billing works and must not be treated as provider failure.
- Probe constraints:
  - Voyage uses a minimal single-token embed.
  - OpenAI uses a minimal 1-token completion with `gpt-5-mini` by default via `HEALTHZ_OPENAI_PROBE_MODEL`.
  - Health probes use a **5-second timeout**.

#### `production_smoke_test.md`
- Documents `e2e/scripts/smoke-production.mjs`.
- A **Playwright-based production smoke test** for `/chat`.
- Flow: load env files → authenticate via WorkOS → open a fresh chat thread → ask a question → wait for final answer → expand research trail → count tool steps → save screenshot.
- Required credentials: `TEST_USER_EMAIL` and `TEST_USER_PASSWORD`.
- Fails if:
  - the assistant ends in an error state,
  - no answer is returned,
  - the answer is too short.
- Default minimum answer length: **200 characters**.
- Requires at least **one visible tool step** and visible sources.
- Important UI detail: the research trail collapsible unmounts step cards, so `research-trail-trigger` must be clicked before counting steps.
- Env precedence: loads `.env.local` before `.env`, including `packages/web/.env.local` before `packages/web/.env`, so local overrides win.
- Artifacts: saves a success screenshot, and a `.failed` screenshot on error.
- Default screenshot path: `/tmp/nc-medicaid-prod-smoke.png`.

### Shared Pattern: Production Realism
- Both entries enforce **correctness under realistic production conditions** rather than shallow success signals.
- Both use guardrails against false positives:
  - provider checks separate billing/key validity from true outages,
  - smoke tests account for collapsed UI state and incomplete assistant output.
- Both rely on **cached or preloaded behavior** to reduce overhead without sacrificing validity.