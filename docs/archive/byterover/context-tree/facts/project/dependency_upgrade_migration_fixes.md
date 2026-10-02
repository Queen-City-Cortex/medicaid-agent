---
title: Dependency Upgrade Migration Fixes
tags: []
related: [facts/project/context.md, agent_architecture/context/mastra_upgrade_type_and_runtime_boundaries.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-06-23T16:52:52.400Z'
updatedAt: '2026-06-23T16:52:52.400Z'
---
## Raw Concept
**Task:**
Document dependency-upgrade-pass migration fixes from the 2026-06-23 pass.

**Changes:**
- Added explicit expect.extend(matchers) for Vitest 4 runtime matcher registration
- Added explicit node types in packages/policy-corpus/tsconfig.json
- Switched Mastra route and middleware handler typing to ContextWithMastra
- Recorded deferred majors blockers for eslint 10 and zod 4
- Pinned @types/node to ^22 for the Node 22 runtime

**Files:**
- packages/web/tests/setup.ts
- packages/policy-corpus/tsconfig.json

**Flow:**
upgrade pass -> identify runtime/type breakage -> apply targeted fix -> defer blocked majors

**Timestamp:** 2026-06-23

**Author:** unknown

## Narrative
### Structure
This note captures three concrete migration fixes plus two deferred major-version blockers from the dependency-upgrade pass.

### Dependencies
Vitest 4 matcher registration, TS 6 ambient type resolution, and @mastra/core 1.45 server typing changes are the immediate compatibility issues.

### Highlights
The fixes preserve existing behavior while restoring runtime assertions, Node globals, and Mastra route typing. The repo remains blocked on eslint 10 and zod 4 for separate peer-dependency and memory reasons.

### Rules
1) Keep the /vitest import for declare-module type augmentation. 2) Also call expect.extend(matchers) for runtime matcher registration. 3) Add types:["node"] in packages/policy-corpus/tsconfig.json. 4) Use ContextWithMastra from @mastra/core/server for registerApiRoute handlers and server.middleware.

### Examples
packages/web/tests/setup.ts imports both @testing-library/jest-dom/vitest and @testing-library/jest-dom/matchers, then calls expect.extend(matchers).

## Facts
- **vitest_jest_dom_runtime_registration**: Vitest 4 no longer auto-attaches @testing-library/jest-dom matchers at runtime when importing '@testing-library/jest-dom/vitest'; expect.extend(matchers) is required for runtime registration. [project]
- **policy_corpus_types_node**: packages/policy-corpus/tsconfig.json needs explicit types:['node'] because TS 6 stopped auto-including @types/node ambient globals for nested package resolution. [project]
- **mastra_contextwithmastra_handler_typing**: @mastra/core 1.45 requires ContextWithMastra from @mastra/core/server for registerApiRoute handlers and server.middleware instead of bare hono Context. [project]
- **eslint_10_blocker**: Deferred majors include eslint 10 because eslint-config-next depends on eslint-plugin-react with peer cap <10. [project]
- **zod_4_blocker**: Deferred majors include zod 4 because agent tsc -p tsconfig.tests.json OOMs above 8GB and the graph will not unify on a single zod4. [project]
- **types_node_pin**: @types/node is pinned to ^22 to match the Node 22 runtime rather than Node 26. [project]
