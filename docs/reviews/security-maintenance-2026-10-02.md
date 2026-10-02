# Focused production security maintenance

Extracted compatible fixes from PR #129. The audit identified one critical, eleven high and eight moderate production findings. The final resolved lockfile has zero critical, high or moderate findings; eleven low findings remain and are tracked with the deferred SDK/runtime work.

Changes include patched Next.js 16.3.8 and matching lint tooling, fast-uri 4.2.1 (3.1.8 inside Mastra), Undici 7.30.0/8.11.2 within existing major lines, ws 8.22.0, and vulnerable transitive dependencies. Mastra memory is pinned to the minimum patched 1.26.1 while core stays 1.45.0 and AI SDK stays 6. No application API or model changes were needed.

Npm retained stale exact transitive lock entries despite new overrides; those affected entries were regenerated and validated by audit/install/tests. Expired moderate exceptions were removed rather than extended. CI now enforces the existing production audit script.

Validation under pinned Node 22.22.0/npm 11.11.0: contracts 4, corpus 238, agent 393 (9 skipped), web 281 and crawler 249 tests passed. Agent and web production builds passed. Local crawler HTTP fixtures and Turbopack worker ports require unsandboxed execution; clearing the generated Next cache resolved replayed sandbox errors. Fresh GitHub integration, mocked browser and Docker checks remain required before merge.
