---
title: Mastra Server Timeout Tuning
tags: []
related: [agent_architecture/nc_medicaid_agent/nc_medicaid_navigator_agent.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-02T02:36:58.939Z'
updatedAt: '2026-04-02T02:36:58.939Z'
---
## Raw Concept
**Task:**
Document the Mastra server timeout tuning that keeps NC Medicaid agent SSE streams alive during multi-step tool research

**Changes:**
- Raised server.timeout from the 3-minute default to 10 minutes in the Mastra server configuration
- Embedded a comment explaining that agent research can take many tool calls and therefore requires more than the default timeout

**Files:**
- packages/agent/src/index.ts

**Flow:**
Mastra server receives NC Medicaid agent tool research requests -> multi-step research often exceeds 180 seconds -> previous 3-minute timeout terminated SSE streams silently -> new configuration uses a 10-minute timeout to cover longer-running tool sequences

**Timestamp:** 2026-04-02

## Narrative
### Structure
The Mastra server block (host, port, timeout, cors, apiRoutes) now explicitly sets timeout: 10 * 60 * 1000 with a descriptive comment that the navigator agent research can take many tool calls.

### Dependencies
The longer timeout depends on streaming SSE connections remaining open for multi-step research sequences; it relies on the NC Medicaid Navigator agent hitting no stricter upper limit before Mastra terminates the request.

### Highlights
Setting the timeout to 10 minutes prevents silent SSE stream termination that happened when research exceeded 3 minutes, ensuring the navigator agent can complete complex tool-assisted conversations without restarting the stream.

## Facts
- **mastra_default_timeout**: Mastra Hono server default request timeout is 3 minutes (server?.timeout ?? 3*60*1000) in @mastra/deployer/dist/server/index.js line 3998. [environment]
- **nc_medicaid_agent_research_duration**: NC Medicaid agent multi-step tool research regularly exceeds 180 seconds, which previously caused silent SSE stream termination with no logged error when the timeout remained at 3 minutes. [project]
- **mastra_extended_timeout**: Setting server.timeout to 10 minutes (10 * 60 * 1000) in the Mastra config keeps long-running research streams alive. [project]
