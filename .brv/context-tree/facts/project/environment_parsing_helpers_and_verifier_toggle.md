---
title: Environment Parsing Helpers and Verifier Toggle
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-07T16:52:01.998Z'
updatedAt: '2026-07-07T16:52:01.998Z'
---
## Raw Concept
**Task:**
Document agent environment parsing consolidation and verifier toggle semantics

**Changes:**
- Added shared env helpers in packages/agent/src/env.ts
- Centralized verifier enablement logic into isVerifierEnabled()
- Adjusted intEnv to reject malformed integers via Number.isFinite
- Preserved distinct semantics for raw api keys, logger level, and sentry defaults

**Files:**
- packages/agent/src/env.ts
- packages/agent/src/config.ts

**Flow:**
process.env -> env helper -> config constant or verifier gate

**Timestamp:** 2026-07-07

**Author:** context-engineering run

## Narrative
### Structure
A new env.ts module centralizes string, integer, and boolean env parsing for the agent package. Config.ts consumes these helpers for Voyage and policy corpus rerank settings, while verifier enablement uses a dedicated predicate instead of boolEnv semantics.

### Dependencies
Relies on process.env at call time so module-scope constants stay eager and lazy config functions retain their timing. The verifier logic intentionally differs from generic boolean parsing to keep the kill switch enabled unless VERIFIER_ENABLED is exactly false.

### Highlights
This consolidation removes repeated env parsing logic across multiple call sites and keeps semantics explicit for each setting. The rerank settings now have stable defaults for enablement, model selection, timeout, candidate count, and debug mode.

## Facts
- **env_helpers**: packages/agent/src/env.ts defines strEnv, intEnv, boolEnv, and isVerifierEnabled [project]
- **env_read_timing**: All helpers read process.env at call time to preserve original evaluation timing [project]
- **bool_env_semantics**: boolEnv returns fallback when unset and otherwise only '1' or 'true' count as true [project]
- **verifier_enabled_semantics**: isVerifierEnabled returns true unless VERIFIER_ENABLED is exactly 'false' [project]
- **int_env_semantics**: intEnv falls back when the parsed integer is not finite [project]
- **policy_corpus_rerank_enabled_default**: POLICY_CORPUS_RERANK_ENABLED defaults to true [project]
- **policy_corpus_rerank_model_default**: POLICY_CORPUS_RERANK_MODEL defaults to gpt-5-mini [project]
- **policy_corpus_rerank_timeout_ms_default**: POLICY_CORPUS_RERANK_TIMEOUT_MS defaults to 1500 [project]
- **policy_corpus_rerank_max_candidates_default**: POLICY_CORPUS_RERANK_MAX_CANDIDATES defaults to 20 [project]
- **policy_corpus_rerank_debug_default**: POLICY_CORPUS_RERANK_DEBUG defaults to false [project]
- **voyage_model_default**: VOYAGE_MODEL defaults to voyage-4 [project]
- **voyage_api_url**: VOYAGE_API_URL is https://api.voyageai.com/v1/embeddings [project]
- **agent_test_status**: 215 agent tests pass after the env consolidation changes [project]
