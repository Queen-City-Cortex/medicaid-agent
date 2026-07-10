---
children_hash: d6061694d0c1994f0f9b87fae6221c1fa5c5002f01c2567cb47c8df047ca6182
compression_ratio: 0.25346687211093993
condensation_order: 1
covers: [agent_model_a_b_gate_2026_07_09.md, context.md, curated_context_snippet.abstract.md, curated_context_snippet.overview.md, dependency_upgrade_migration_fixes.md, environment_parsing_helpers_and_verifier_toggle.md, eval_harness_and_embedding_dimension_constraints.md, groq_reranker_candidate_and_eval_ab_support.md, model_audit_and_embedding_configuration.md, policy_corpus_coverage_scoring.md, policy_corpus_reranker_evaluation_and_groq_default.md, policy_corpus_reranker_removal.md, sentry_environment_and_tracing_defaults.md]
covers_token_total: 9086
summary_level: d1
token_count: 2303
type: summary
---
# Project-level structural summary

This set of entries documents the project’s operational standards and several recent engineering decisions across model selection, evaluation harnesses, environment/config handling, reranking, dependency migration, and observability. A common pattern is to encode decisions as durable project facts with explicit files, flows, rules, and numeric defaults so future changes can be validated against them.

## 1) Knowledge curation and context-tree discipline
- **See:** `context.md`, `curated_context_snippet.abstract.md`, `curated_context_snippet.overview.md`
- The project’s curation model uses **UPSERT-first** updates, a **two-part context format** (`rawConcept` + `narrative`), and strict verification after curation.
- Knowledge is organized in a **domain/topic/subtopic** tree, with emphasis on preserving:
  - exact rules and regex patterns,
  - timestamps and other temporal markers,
  - concrete file references,
  - durable facts rather than chat-only notes.
- Core workflow: **recon -> extract -> curate -> verify**, with `result.summary.failed` and applied file paths used for validation.
- The `facts/` domain is the default home for standalone project facts and conventions.

## 2) Model selection, audit, and A/B gating
- **See:** `model_audit_and_embedding_configuration.md`, `agent_model_a_b_gate_2026_07_09.md`
- The agent stack has a clear model inventory:
  - `AGENT_MODEL = gpt-5.4`
  - `VERIFIER_MODEL = gpt-5.4-mini`
  - observational memory also uses `gpt-5.4-mini`
  - reranker defaults changed over time, but the project records gating decisions separately.
- `model_audit_and_embedding_configuration.md` establishes a policy that **all model changes must go through `scripts/eval-ab.sh` gates** and that the eval judge model should not be changed casually.
- `agent_model_a_b_gate_2026_07_09.md` records the verifier-model decision:
  - `gpt-5.6-luna` was rejected for verifier use,
  - `gpt-5.4-mini` remains the verifier model,
  - no code change was required,
  - the model-swap backlog was closed after Terra adoption and Luna rejection.
- The decisive criterion was **hallucination detection quality vs. cost**: the more expensive candidate had to clearly outperform the incumbent, and tying was insufficient.

## 3) Environment parsing and verifier enablement
- **See:** `environment_parsing_helpers_and_verifier_toggle.md`
- `packages/agent/src/env.ts` centralizes env parsing with:
  - `strEnv`
  - `intEnv`
  - `boolEnv`
  - `isVerifierEnabled()`
- Important semantics:
  - helpers read `process.env` at call time,
  - `boolEnv` only treats `'1'` or `'true'` as true,
  - `isVerifierEnabled()` is intentionally different: it returns true unless `VERIFIER_ENABLED === 'false'`,
  - `intEnv` rejects malformed integers with `Number.isFinite`.
- This change also codifies stable defaults for policy-corpus reranking and Voyage embedding settings, including:
  - rerank enabled by default,
  - `POLICY_CORPUS_RERANK_MODEL = gpt-5-mini`,
  - `POLICY_CORPUS_RERANK_TIMEOUT_MS = 1500`,
  - `POLICY_CORPUS_RERANK_MAX_CANDIDATES = 20`,
  - `POLICY_CORPUS_RERANK_DEBUG = false`,
  - `VOYAGE_MODEL = voyage-4`,
  - `VOYAGE_API_URL = https://api.voyageai.com/v1/embeddings`.

## 4) Eval harness behavior and embedding constraints
- **See:** `eval_harness_and_embedding_dimension_constraints.md`
- `scripts/eval-ab.sh` serves as the shared gate for:
  - embedding swaps,
  - verifier swaps,
  - regression comparison against a held-out paraphrase split.
- The harness defaults are:
  - `DATASET = data/golden/heldout-paraphrase.json`
  - `RUNS = 3`
- Key rule: **candidate embedding dimensions must match the model default**; otherwise retrieval can break silently.
- The document notes that `voyage-4-large` returns **1024 dimensions by default**, and that trying 2048 requires `voyage_client.embed()` to send `output_dimension`.

## 5) Policy-corpus reranker routing, evaluation, and removal
### Reranker candidate and Groq routing
- **See:** `groq_reranker_candidate_and_eval_ab_support.md`, `policy_corpus_reranker_evaluation_and_groq_default.md`
- `packages/agent/src/policy-corpus-reranker.ts` routes model IDs by prefix:
  - `groq/` models use Groq via `createOpenAI` with the Groq base URL,
  - `gpt-`, `o3`, `o4` route to OpenAI,
  - other models fall back to Anthropic/default behavior.
- `createModel` was renamed to **`createRerankerModel`** and exported for tests.
- `scripts/eval-ab.sh` gained a reranker gate with optional `RERANK_CANDIDATE_MODEL`.
- The reranker remains fail-soft: on error it returns `null` and the caller uses the original vector order.

### Evaluation outcome and default switch
- `policy_corpus_reranker_evaluation_and_groq_default.md` records a three-arm evaluation over three 50-question runs:
  - `gpt-5-mini`
  - `groq/openai/gpt-oss-20b`
  - rerank-OFF
- Result:
  - Groq matched quality while reducing timeout fallbacks,
  - the default reranker was switched to `groq/openai/gpt-oss-20b`,
  - the product value of reranking remained somewhat unresolved because rerank-OFF was within noise.

### Full removal
- **See:** `policy_corpus_reranker_removal.md`
- The LLM policy-corpus reranker was later removed entirely in PR #71 after a 2026-07-08 evaluation showed no meaningful benefit.
- Removal scope included:
  - reranker config,
  - telemetry,
  - contract,
  - provenance plumbing,
  - GROQ_API_KEY deployment plumbing.
- Important retained behavior:
  - deterministic internal `rerank.ts` HitScorers were left untouched,
  - `finalizeHybridHits` became synchronous.
- Re-entry guidance is explicit: if retrieval failures reappear, use **`voyage rerank-2.5-lite`** at the frame-selection point in `section-views.ts`.

## 6) Coverage scoring for policy corpus sections
- **See:** `policy_corpus_coverage_scoring.md`
- This entry documents the section-ranking scorer used in policy-corpus retrieval:
  - `scoreCoverageSections` in `packages/policy-corpus/src/frame/coverage-sections/selection/scoring.ts`
  - tests in `packages/policy-corpus/tests/frame/coverage-sections/scoring.test.ts`
- The scorer:
  - normalizes and combines title/content text,
  - uses weighted phrase matching,
  - applies bonuses/penalties based on section structure and query flags.
- Important numeric anchors preserved by tests:
  - empty section: `0/0`
  - numbered section bonus: `+0.5` to both scores
  - attachment title penalty: `-3`
  - limitation support bonus: `+3` support only
  - MA-2180 bonus: `+1.5` primary only
  - focus-term hit example: `2.16/1.08`
- The tests run against **real shared helpers and term lists with no mocks**, making them a direct contract for the scoring formula.
- Query-flag-gated behavior includes:
  - telehealth,
  - certification,
  - HCWD-related scoring paths.

## 7) Dependency upgrade migration fixes
- **See:** `dependency_upgrade_migration_fixes.md`
- This entry captures a targeted migration pass with concrete compatibility fixes:
  - added `expect.extend(matchers)` for Vitest 4 runtime matcher registration,
  - added explicit `types: ['node']` in `packages/policy-corpus/tsconfig.json`,
  - switched Mastra route/middleware typing to `ContextWithMastra`,
  - pinned `@types/node` to `^22`.
- Deferred blockers remain:
  - **eslint 10** due to peer dependency constraints,
  - **zod 4** due to `tsc` OOM / graph-unification issues.
- The note preserves an important rule set for the migration:
  - keep `/vitest` import for type augmentation,
  - also call `expect.extend(matchers)` at runtime,
  - use `ContextWithMastra` for `registerApiRoute` handlers and `server.middleware`.

## 8) Sentry setup and tracing defaults
- **See:** `sentry_environment_and_tracing_defaults.md`
- The project’s Sentry configuration now distinguishes browser and agent/server behavior:
  - browser instrumentation uses build-time env inlining plus a runtime hostname guard,
  - agent instrumentation uses runtime DSN/env checks and installs global exception handlers when enabled.
- Defaults and rules:
  - `tracesSampleRate` defaults to `0.1` unless overridden,
  - local hostnames must not report into shared Sentry,
  - browser runtime guard blocks `localhost`, `127.0.0.1`, `[::1]`, and `0.0.0.0`.
- The document clarifies that zero production events reflected a quiet production window, not misconfiguration.
- Key env binding distinction:
  - web: `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT` are build-time inlined,
  - agent/server: `SENTRY_DSN`, `SENTRY_ENVIRONMENT` are read at runtime.

## Cross-cutting themes
- **Gating and evaluation** recur throughout the entries:
  - model selection,
  - reranker changes,
  - embedding swaps,
  - dependency migrations.
- **Explicit defaults** are treated as part of the contract, especially for:
  - verifier models,
  - reranker configuration,
  - embedding models/dimensions,
  - tracing sample rates.
- **Fail-soft behavior** is preferred where possible:
  - reranker fallback to vector order,
  - guarded env parsing,
  - controlled deployment rollbacks.
- **Durable facts over prose** is the main documentation style:
  - preserve file paths, API names, constants, model IDs, thresholds, and exact rules for later drill-down.