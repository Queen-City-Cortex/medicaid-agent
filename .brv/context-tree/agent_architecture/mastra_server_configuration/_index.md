---
children_hash: f0ed1856bc9d7f3bc1cf4481bc2afe3d93f433430eb81e479596f5c380453310
compression_ratio: 0.5949926362297496
condensation_order: 1
covers: [context.md, mastra_server_timeout_tuning.md]
covers_token_total: 679
summary_level: d1
token_count: 404
type: summary
---
### mastra_server_configuration overview
- **Purpose**: Explain why the Mastra server timeout was increased to support the NC Medicaid Navigator agent’s long-running SSE tool research.
- **Key topics**: Mastra server timeout controls SSE stream lifecycle; NC Medicaid agent’s multi-step research regularly exceeds the previous 3-minute default; the configuration comment documents the 10-minute resilience safeguard for streaming.

### mastra_server_timeout_tuning specifics
- **Task & change**: Raised `server.timeout` from 3 minutes to `10 * 60 * 1000` in `packages/agent/src/index.ts`, noting that navigator research often requires many tool calls and longer streams.
- **Flow**: Mastra receives NC Medicaid agent tool research requests → sequences exceed 180 seconds → default 3-minute timeout silently killed SSE → new 10-minute timeout keeps streaming alive through complex conversations.
- **Structure**: Mastra server block now explicitly sets `timeout`, alongside host/port/cors/apiRoutes, with a descriptive comment about long research runs.
- **Dependencies**: Relies on SSE streams staying open for multi-step research and assumes no tighter limit is hit before Mastra terminates.
- **Highlights**: Prevents silent SSE termination by aligning timeout with research duration, enabling uninterrupted navigator agent flows.
- **Facts preserved**:
  - Default Mastra Hono timeout is 3 minutes (`server?.timeout ?? 3*60*1000`).
  - NC Medicaid agent multi-step research frequently exceeds 180 seconds, causing prior silent terminations.
  - The extended 10-minute timeout keeps those long-lived streams alive.