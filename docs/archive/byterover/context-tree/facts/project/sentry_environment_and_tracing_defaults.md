---
title: Sentry Environment and Tracing Defaults
tags: []
related: [facts/conventions/context.md, facts/project/environment_parsing_helpers_and_verifier_toggle.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-09T22:41:40.372Z'
updatedAt: '2026-07-09T22:41:40.372Z'
---
## Raw Concept
**Task:**
Document Sentry setup and tracing defaults for medicaid-agent

**Changes:**
- Added runtime hostname guard in browser instrumentation to block local sessions from leaking into shared Sentry
- Raised default tracesSampleRate from 0 to 0.1 for agent and web instrumentation
- Clarified production reporting behavior: zero production events reflected quiet prod, not misconfiguration

**Files:**
- packages/web/src/instrumentation-client.ts
- packages/agent/src/sentry.ts

**Flow:**
browser/client init -> runtime localhost check -> env gate -> Sentry.init; agent init -> DSN check -> development gate -> Sentry.init

**Timestamp:** 2026-07-09

**Patterns:**
- `^localhost$|^127\.0\.0\.1$|^\[::1\]$|^0\.0\.0\.0$` - Local hostname guard used by browser instrumentation

## Narrative
### Structure
Browser Sentry initialization now combines build-time env gating with a runtime hostname check so stale local production builds cannot report into the shared project. Agent initialization is a server-side DSN/environment gate that also installs global exception handlers when enabled.

### Dependencies
Browser config depends on Next.js client-side env inlining and must be rebuilt when NEXT_PUBLIC values change. Agent config depends on process.env populated before importing the Sentry module.

### Highlights
This fixes two gaps: local/dev leakage into shared Sentry and missing span context on errors. The production environment was silent during the incident window, so the lack of production events was expected rather than a configuration failure.

### Rules
Development sessions must not report into shared Sentry.
TracesSampleRate defaults to 0.1 unless explicitly overridden.
Runtime hostname checks must catch localhost, 127.0.0.1, [::1], and 0.0.0.0.

### Examples
The browser client skips Sentry.init when window.location.hostname is localhost. The agent init runs only when SENTRY_DSN is present and environment is not development.

## Facts
- **sentry_project**: The project uses Sentry for medicaid-agent in org queen-city-cortex-llc, project medicaid-agent, region us.sentry.io. [project]
- **sentry_event_distribution**: All 37 project errors in the last 30 days were in development; there were zero production events. [project]
- **browser_localhost_skip**: The browser instrumentation skips localhost, 127.0.0.1, [::1], and 0.0.0.0 at runtime to prevent local sessions from reporting into shared Sentry. [project]
- **agent_sentry_gate**: The agent Sentry init is suppressed only when environment equals development and DSN is set. [project]
- **sentry_traces_sample_rate_default**: The default tracesSampleRate is 0.1 in both agent and web instrumentation, overridable by SENTRY_TRACES_SAMPLE_RATE or NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE. [project]
- **missing_trace_spans_root_cause**: The previous default of tracesSampleRate 0 produced errors with no spans in trace data. [project]
- **env_binding_model**: NEXT_PUBLIC_SENTRY_DSN and NEXT_PUBLIC_SENTRY_ENVIRONMENT are build-time inlined on the web client, while SENTRY_DSN and SENTRY_ENVIRONMENT are runtime-read on the agent/server. [project]
