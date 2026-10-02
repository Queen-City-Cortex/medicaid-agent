---
title: Provider Health Checks and Production Smoke Verification
tags: []
related: [agent_architecture/context/health.md, agent_architecture/context/weekly_eval_and_launchd_ops_guardrails.md, agent_architecture/context/backup_mastra_shell_script_learnings.md, agent_architecture/context/ws5_customer_readiness.md, agent_architecture/context/ws2_customer_readiness_reliability_fixes.md, agent_architecture/context/railway_pr6_corpus_operations.md]
keywords: []
importance: 55
recency: 1
maturity: draft
updateCount: 1
createdAt: '2026-07-10T21:20:36.640Z'
updatedAt: '2026-07-10T21:22:05.499Z'
---
## Raw Concept
**Task:**
Document post-quota-topup verification for provider health checks and production smoke testing

**Changes:**
- Adjusted OpenAI health probe classification to treat only 401, 403, 429, and 5xx as outages
- Confirmed gpt-5-mini can fail with invalid_request 400 when max_completion_tokens is exhausted by reasoning
- Updated smoke script behavior to expand the research trail before counting tool steps
- Verified live production usage tracking and production modelId reporting

**Files:**
- packages/agent/src/health.ts
- e2e/scripts/smoke-production.mjs

**Flow:**
health check -> provider request -> status classification -> smoke script -> expand research trail -> count tool steps -> verify answer and sources

**Timestamp:** 2026-07-10

**Author:** ByteRover context engineer

## Narrative
### Structure
The health module caches provider checks for one minute and shares a single in-flight request across concurrent callers. The production smoke script loads env files in precedence order, authenticates into the chat UI, starts a fresh thread, submits a question, waits for the assistant answer, then verifies sources and tool steps.

### Dependencies
Health checks depend on VOYAGE_API_KEY, VOYAGE_API_URL, VOYAGE_MODEL, and OPENAI_API_KEY. The smoke script depends on TEST_USER_EMAIL, TEST_USER_PASSWORD, Playwright, and data-testid hooks in the chat UI.

### Highlights
Provider health is based on real provider calls rather than endpoint reachability alone. The OpenAI probe intentionally uses a minimal chat completion so a quota or billing problem is surfaced before production chat fails. The smoke test now accounts for collapsed research-trail UI state after P2.

### Rules
Classify OpenAI health by status code: 401, 403, 429, and any 5xx are outages; other 4xx prove key and billing work. Do not rely on response.ok for OpenAI probe decisions. Do not use GET /v1/models as a substitute for a quota-sensitive health check. In the smoke script, click research-trail-trigger before counting tool-step because the Collapsible unmounts step cards.

### Examples
The health probe may receive invalid_request 400 "output limit reached" from gpt-5-mini when max_completion_tokens is set to 1. A successful smoke run reported 5 tool steps and 6 cited sources.

## Facts
- **gpt_5_mini_health_probe_behavior**: gpt-5-mini with max_completion_tokens:1 can return invalid_request 400 "output limit reached" because reasoning consumes the budget. [project]
- **health_probe_status_classification**: Health probes must classify OpenAI outages by status codes 401, 403, 429, and 5xx, not by response.ok. [convention]
- **openai_health_probe_non_outage_4xx**: Other 4xx responses prove the key and billing work for OpenAI health checks. [project]
- **smoke_script_research_trail_requirement**: The production smoke script must click research-trail-trigger before counting tool-step because the Collapsible unmounts step cards. [project]
- **usage_tracking_schema**: Live production usage tracking logs chat.usage with userId, modelId, input tokens, output tokens, and cached tokens. [project]
- **production_model_id**: The production reports modelId gpt-5.4, and the Railway AGENT_MODEL env override predates the gpt-5.6-terra default. [project]
- **post_topup_recovery_status**: After the $10 OpenAI credit top-up, production was fully recovered with smoke:prod green, 5 tool steps, 6 cited sources, and verifier high. [project]
