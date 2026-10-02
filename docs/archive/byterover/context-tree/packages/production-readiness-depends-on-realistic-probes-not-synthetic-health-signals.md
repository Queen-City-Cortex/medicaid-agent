---
confidence: 0.88
sources: [packages/_index.md, packages/_index.md, frontend_ui/_index.md, agent_architecture/_index.md]
synthesized_at: '2026-07-26T03:28:08.852Z'
type: synthesis
title: Production readiness depends on realistic probes, not synthetic health signals
summary: The project repeatedly avoids false confidence by probing real service behavior, real chat flows, and real smoke conditions.
tags: [ops, health-checks, smoke-test, chat, deployment]
related: []
keywords: [probe, smoke, health, real, workos, sources, outage, gating]
createdAt: '2026-07-26T03:28:08.852Z'
updatedAt: '2026-07-26T03:28:08.852Z'
---

# Production readiness depends on realistic probes, not synthetic health signals

packages, agent_architecture, and frontend_ui all reject synthetic success signals in favor of realistic checks: provider health probes distinguish real outages, smoke tests exercise live chat completion, and UI flows verify visible sources and restored state.

## Evidence

- **packages**: Provider health checks classify OpenAI outages by status code, use 5-second timeouts, and distinguish deploy-gating sources from informational ones.
- **packages**: The production smoke test loads real envs, authenticates via WorkOS, opens a fresh chat, waits for a final answer, and requires at least one visible tool step and visible sources.
- **frontend_ui**: Chat streaming and thread restoration are validated through the real chat page, with Playwright mocks only for targeted test paths.
- **agent_architecture**: Weekly refresh and provider health checks treat eval gates, change gates, and real service probes as separate operational checks before deploy or backup actions.
