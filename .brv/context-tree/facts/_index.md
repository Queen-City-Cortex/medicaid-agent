---
children_hash: 0480b79cbcee8455c7926db313fdabf70a87bbad39394fa678870f48789d1cdd
compression_ratio: 0.7614834977883634
condensation_order: 2
covers: [conventions/_index.md, project/_index.md]
covers_token_total: 2939
summary_level: d2
token_count: 2238
type: summary
---
# d2 Structural Summary

This level groups the curated knowledge into two main clusters: **curation/conventions** and **project operational decisions**. Together, the entries emphasize durable knowledge capture, explicit gating, and stable defaults across models, retrieval, embeddings, and observability.

## 1) Curation workflow conventions
- **See:** `conventions/_index.md`
- The conventions domain defines the standard **recon -> extraction -> curate -> verify** workflow for durable knowledge curation.
- It is centered on **UPSERT-first** updates and a **two-part context format** (`rawConcept` + `narrative`), with verification based on applied file paths and result status.
- Key preserved rules include:
  - do **not** print raw context,
  - use `tools.curation.mapExtract()` for chunked extraction,
  - pass `taskId` as a bare variable,
  - verify via `result.applied[].filePath`,
  - do not rerun recon when it has already been computed.
- Drill down into `curation_workflow_guardrails.md` for exact execution constraints, and `context.md` for the broader conventions summary.

## 2) Project-level operational decisions
- **See:** `project/_index.md`
- The project entries record a set of engineering decisions with strong emphasis on **explicit contracts**: model selection, evaluation gating, environment parsing, reranking, dependency migration, coverage scoring, and Sentry defaults.
- A recurring pattern is to store **file paths, API names, numeric defaults, and exact rules** so future changes can be validated against documented behavior rather than memory.

### 2.1 Knowledge curation and context-tree discipline
- **See:** `context.md`, `curated_context_snippet.abstract.md`, `curated_context_snippet.overview.md`
- The project applies the same durable-knowledge discipline as the conventions domain:
  - UPSERT-first curation,
  - `rawConcept` + `narrative`,
  - preservation of exact rules, timestamps, file references, and facts,
  - `recon -> extract -> curate -> verify` as the core workflow.
- The `facts/` domain is used for standalone project facts and conventions.

### 2.2 Model selection, audit, and A/B gating
- **See:** `model_audit_and_embedding_configuration.md`, `agent_model_a_b_gate_2026_07_09.md`
- The agent stack maintains a fixed model inventory:
  - `AGENT_MODEL = gpt-5.4`
  - `VERIFIER_MODEL = gpt-5.4-mini`
  - observational memory also uses `gpt-5.4-mini`
- Model changes must go through **`scripts/eval-ab.sh`** gates; judge models should not be changed casually.
- On 2026-07-09, `gpt-5.6-luna` was rejected for verifier use; `gpt-5.4-mini` remained the verifier model and the swap backlog was closed after Terra adoption and Luna rejection.
- The deciding criterion was **hallucination detection quality vs. cost**; parity was not enough to justify the more expensive candidate.

### 2.3 Environment parsing and verifier toggle behavior
- **See:** `environment_parsing_helpers_and_verifier_toggle.md`
- `packages/agent/src/env.ts` centralizes:
  - `strEnv`
  - `intEnv`
  - `boolEnv`
  - `isVerifierEnabled()`
- Important semantics:
  - helpers read `process.env` at call time,
  - `boolEnv` only treats `'1'` or `'true'` as true,
  - `isVerifierEnabled()` returns true unless `VERIFIER_ENABLED === 'false'`,
  - `intEnv` rejects malformed integers with `Number.isFinite`.
- This entry also locks in stable defaults for policy-corpus reranking and Voyage embeddings, including:
  - rerank enabled by default,
  - `POLICY_CORPUS_RERANK_MODEL = gpt-5-mini`,
  - `POLICY_CORPUS_RERANK_TIMEOUT_MS = 1500`,
  - `POLICY_CORPUS_RERANK_MAX_CANDIDATES = 20`,
  - `POLICY_CORPUS_RERANK_DEBUG = false`,
  - `VOYAGE_MODEL = voyage-4`,
  - `VOYAGE_API_URL = https://api.voyageai.com/v1/embeddings`.

### 2.4 Eval harness behavior and embedding constraints
- **See:** `eval_harness_and_embedding_dimension_constraints.md`
- `scripts/eval-ab.sh` is the shared gate for embedding swaps, verifier swaps, and regression comparison against a held-out paraphrase split.
- Defaults are:
  - `DATASET = data/golden/heldout-paraphrase.json`
  - `RUNS = 3`
- A key invariant is that **candidate embedding dimensions must match the model default** or retrieval can fail silently.
- The entry notes that `voyage-4-large` returns **1024 dimensions by default**, and that using 2048 requires `voyage_client.embed()` to send `output_dimension`.

### 2.5 Policy-corpus reranker routing, evaluation, and removal
- **See:** `groq_reranker_candidate_and_eval_ab_support.md`, `policy_corpus_reranker_evaluation_and_groq_default.md`, `policy_corpus_reranker_removal.md`

#### Routing and candidate support
- `packages/agent/src/policy-corpus-reranker.ts` routes model IDs by prefix:
  - `groq/` → Groq via `createOpenAI` with the Groq base URL,
  - `gpt-`, `o3`, `o4` → OpenAI,
  - others → Anthropic/default behavior.
- `createModel` was renamed to **`createRerankerModel`** and exported for tests.
- `scripts/eval-ab.sh` gained a reranker gate with optional `RERANK_CANDIDATE_MODEL`.
- The reranker is fail-soft: on error it returns `null` and callers keep the original vector order.

#### Evaluation outcome
- A three-arm evaluation compared:
  - `gpt-5-mini`
  - `groq/openai/gpt-oss-20b`
  - rerank-OFF
- Groq matched quality while reducing timeout fallbacks, so the default reranker switched to `groq/openai/gpt-oss-20b`.
- The product value of reranking remained somewhat unresolved because rerank-OFF was within noise.

#### Removal
- The LLM policy-corpus reranker was later removed entirely in PR #71 after a 2026-07-08 evaluation found no meaningful benefit.
- Removal included reranker config, telemetry, contract, provenance plumbing, and `GROQ_API_KEY` deployment plumbing.
- Retained behavior:
  - deterministic internal `rerank.ts` HitScorers remained unchanged,
  - `finalizeHybridHits` became synchronous.
- Re-entry guidance: if retrieval failures return, use **`voyage rerank-2.5-lite`** at the frame-selection point in `section-views.ts`.

### 2.6 Coverage scoring for policy corpus sections
- **See:** `policy_corpus_coverage_scoring.md`
- The section-ranking scorer lives in:
  - `packages/policy-corpus/src/frame/coverage-sections/selection/scoring.ts`
  - tests in `packages/policy-corpus/tests/frame/coverage-sections/scoring.test.ts`
- It combines normalized title/content text with weighted phrase matching and structure/query-flag bonuses and penalties.
- Preserved numeric anchors include:
  - empty section: `0/0`
  - numbered section bonus: `+0.5` to both scores
  - attachment title penalty: `-3`
  - limitation support bonus: `+3` support only
  - MA-2180 bonus: `+1.5` primary only
  - focus-term hit example: `2.16/1.08`
- Tests run against real shared helpers and term lists, making them a direct contract for the scoring formula.
- Query-flag behavior includes telehealth, certification, and HCWD paths.

### 2.7 Dependency upgrade migration fixes
- **See:** `dependency_upgrade_migration_fixes.md`
- This entry captures a migration pass with compatibility fixes:
  - `expect.extend(matchers)` for Vitest 4 runtime matcher registration,
  - explicit `types: ['node']` in `packages/policy-corpus/tsconfig.json`,
  - `ContextWithMastra` typing for Mastra routes/middleware,
  - `@types/node` pinned to `^22`.
- Deferred blockers remain:
  - **eslint 10** due to peer dependency constraints,
  - **zod 4** due to `tsc` OOM / graph-unification issues.
- Rules preserved for the migration:
  - keep `/vitest` import for type augmentation,
  - also call `expect.extend(matchers)` at runtime,
  - use `ContextWithMastra` for `registerApiRoute` handlers and `server.middleware`.

### 2.8 Sentry setup and tracing defaults
- **See:** `sentry_environment_and_tracing_defaults.md`
- Sentry configuration is split between browser and agent/server behavior:
  - browser instrumentation uses build-time env inlining plus a runtime hostname guard,
  - agent instrumentation uses runtime DSN/env checks and installs global exception handlers when enabled.
- Defaults and guards:
  - `tracesSampleRate` defaults to `0.1` unless overridden,
  - local hostnames must not report into shared Sentry,
  - browser guard blocks `localhost`, `127.0.0.1`, `[::1]`, and `0.0.0.0`.
- Web env uses `NEXT_PUBLIC_SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_ENVIRONMENT` at build time; agent/server uses `SENTRY_DSN` and `SENTRY_ENVIRONMENT` at runtime.

## Cross-cutting patterns
- **Gating and evaluation** appear throughout: model swaps, reranker changes, embedding swaps, and dependency migrations.
- **Explicit defaults** are part of the contract, especially for verifier models, reranker settings, embedding models/dimensions, and tracing sample rates.
- **Fail-soft behavior** is preferred where possible: reranker fallback, guarded env parsing, and controlled deployment behavior.
- The documentation style favors **durable facts over prose**, preserving names, paths, constants, thresholds, and exact rules for later drill-down.