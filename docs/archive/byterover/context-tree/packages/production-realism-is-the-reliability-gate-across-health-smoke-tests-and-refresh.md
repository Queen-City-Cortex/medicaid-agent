---
confidence: 0.91
sources: [packages/_index.md, agent_architecture/_index.md, qa/_index.md]
synthesized_at: '2026-07-26T18:01:44.042Z'
type: synthesis
title: Production realism is the reliability gate across health, smoke tests, and refresh jobs
summary: Real service probes and visible end-to-end evidence are preferred over synthetic checks throughout agent, UI, and ops workflows.
tags: [production, health-checks, smoke-test, qa, ops]
related: []
keywords: [real, probe, smoke, workos, healthz, playwright, deploy, verification]
createdAt: '2026-07-26T18:01:44.042Z'
updatedAt: '2026-07-26T18:01:44.042Z'
---

# Production realism is the reliability gate across health, smoke tests, and refresh jobs

Several domains reject synthetic success signals in favor of probing real behavior. packages documents realistic provider health checks and a Playwright smoke test that exercises authenticated `/chat`; agent_architecture and evaluation both emphasize operational verification and dataset correctness; qa’s e2e harness uses real or faithfully mocked routes to validate the full chain. The shared insight is that production readiness depends on live-service evidence, not placeholder health responses.

## Evidence

- **packages**: Provider health checks probe real Neo4j and LibSQL deploy gates, while the production smoke test authenticates through WorkOS, opens a fresh chat, waits for a final answer, and requires visible tool steps and sources.
- **agent_architecture**: Operational hardening entries emphasize production smoke verification, weekly refresh guardrails, and launchd scheduling as part of safe release behavior.
- **qa**: The Playwright suite is split into mocked and smoke paths, with smoke tests running the real integration path and using long timeouts for slower agent/Neo4j flows.
