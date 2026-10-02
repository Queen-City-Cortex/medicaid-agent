---
children_hash: f71ba72dd92425c582cd84b6eca0264ecf6e5bab87719f7720829ce092007986
compression_ratio: 0.21168764006205826
condensation_order: 1
covers: [agent_model_a_b_gate_2026_07_09.md, agentic_map_and_rlm_curation_workflow.md, context.md, curated_context_snippet.md, curation_workflow_guardrails.md, dependency_upgrade_migration_fixes.md, environment_parsing_helpers_and_verifier_toggle.md, eval_harness_and_embedding_dimension_constraints.md, groq_reranker_candidate_and_eval_ab_support.md, model_audit_and_embedding_configuration.md, ops_backup_workflow_and_storage.md, policy_corpus_coverage_scoring.md, policy_corpus_reranker_evaluation_and_groq_default.md, policy_corpus_reranker_removal.md, sentry_environment_and_tracing_defaults.md]
covers_token_total: 11602
summary_level: d1
token_count: 2456
type: summary
---
# Project Knowledge Structure Summary

## Core curation and context-engineering workflow
- **agentic_map_and_rlm_curation_workflow.md**, **curation_workflow_guardrails.md**, and **curated_context_snippet.md** define the RLM-based curation path used to preserve durable knowledge in the context tree.
- Shared structure across these notes: **recon already computed → choose single-pass or chunked extraction → dedupe/group facts if needed → UPSERT curate → verify via `result.applied[].filePath`**.
- Key guardrails:
  - Do **not** print raw context.
  - Do **not** rerun `tools.curation.recon()` when precomputed.
  - Use `tools.curation.mapExtract()` only for chunked contexts.
  - Use `tools.curation.dedup()` and `tools.curation.groupBySubject()` before curation when extraction is chunked.
- **context.md** in `facts/project` frames the topic as operational guidance for durable knowledge capture, UPSERT-first curation, the context-tree hierarchy, and verification discipline.

## Model selection, evaluation, and gating
- **model_audit_and_embedding_configuration.md** is the broad inventory of agent/pipeline model assignments, pricing, and gating rules. It establishes:
  - **AGENT_MODEL = gpt-5.4**
  - **verifier_model = gpt-5.4-mini**
  - **observational_memory_model = gpt-5.4-mini**
  - **policy_corpus_reranker = gpt-5-mini**
  - **prompt_injection_detector = gpt-5-mini**
  - **pipeline LLM extractor = claude-haiku-4-5-20251001**
  - **eval judge = claude-sonnet-4-6**
  - **embeddings = voyage-4** on both query and corpus sides
- It also states that **all model changes must go through `scripts/eval-ab.sh` gates**, and that the query embedding model must match the corpus embedding model.
- **eval_harness_and_embedding_dimension_constraints.md** focuses on the AB harness for embeddings and verifier swaps:
  - `scripts/eval-ab.sh` supports **embedding** and **verifier** gates.
  - Default dataset is `data/golden/heldout-paraphrase.json` and default runs = **3**.
  - Candidate embedding dimensions must match the model default; **voyage-4-large defaults to 1024 dimensions**.
  - Regression threshold for adoption is **0.05**.
- **agent_model_a_b_gate_2026_07_09.md** documents the verifier-model decision:
  - `scripts/eval-ab.sh` ran with `CANDIDATE_VERIFIER=gpt-5.6-luna`.
  - **gpt-5.6-luna was rejected** for verifier use.
  - **gpt-5.4-mini remains the verifier model**.
  - No code change was required; the model-swap backlog was closed after Terra adoption and Luna rejection.
  - The key decision criterion was verifier-quality, especially hallucination detection, where Luna underperformed despite higher cost.
- **dependency_upgrade_migration_fixes.md** captures dependency migration fixes and blockers:
  - Added `expect.extend(matchers)` for Vitest 4 runtime matcher registration.
  - Added explicit `types: ["node"]` in `packages/policy-corpus/tsconfig.json`.
  - Switched Mastra route/middleware typing to `ContextWithMastra`.
  - Deferred majors: **eslint 10** and **zod 4**.
  - Pinned `@types/node` to **^22** to match the Node 22 runtime.

## Environment parsing, toggles, and runtime defaults
- **environment_parsing_helpers_and_verifier_toggle.md** centralizes env parsing for the agent:
  - Added `strEnv`, `intEnv`, `boolEnv`, and `isVerifierEnabled()` in `packages/agent/src/env.ts`.
  - `intEnv` rejects malformed integers via `Number.isFinite`.
  - `isVerifierEnabled()` returns true unless `VERIFIER_ENABLED` is exactly `"false"`.
  - `boolEnv` only treats `"1"` or `"true"` as true when set.
  - Key defaults include:
    - `POLICY_CORPUS_RERANK_ENABLED = true`
    - `POLICY_CORPUS_RERANK_MODEL = gpt-5-mini`
    - `POLICY_CORPUS_RERANK_TIMEOUT_MS = 1500`
    - `POLICY_CORPUS_RERANK_MAX_CANDIDATES = 20`
    - `POLICY_CORPUS_RERANK_DEBUG = false`
    - `VOYAGE_MODEL = voyage-4`
    - `VOYAGE_API_URL = https://api.voyageai.com/v1/embeddings`
- The note also records that **215 agent tests pass** after the env consolidation.
- **sentry_environment_and_tracing_defaults.md** documents Sentry setup:
  - Browser instrumentation now blocks local hostnames at runtime: `localhost`, `127.0.0.1`, `[::1]`, `0.0.0.0`.
  - Default `tracesSampleRate` is **0.1** for both agent and web instrumentation.
  - Browser env values are build-time inlined; agent/server env values are runtime-read.
  - The project uses Sentry for `medicaid-agent` in org `queen-city-cortex-llc`, project `medicaid-agent`, region `us.sentry.io`.
  - The last 30 days showed **37 development errors and zero production events**.

## Policy corpus reranker evolution
- **groq_reranker_candidate_and_eval_ab_support.md** documents the reranker routing extension:
  - `createModel` was renamed to **`createRerankerModel`** and exported for tests.
  - Groq routing uses `createOpenAI` with the Groq-compatible base URL.
  - `RERANK_CANDIDATE_MODEL` was added to `scripts/eval-ab.sh` reranker gating.
  - The reranker now routes prefixes across **groq/**, **openai/**, **anthropic/**, with Anthropic as default fallback.
  - Groq failures degrade to the original vector order and increment diagnostics.
- **policy_corpus_reranker_evaluation_and_groq_default.md** records the evaluation that flipped the default reranker:
  - Compared **gpt-5-mini**, **groq/openai/gpt-oss-20b**, and **rerank-OFF** across three 50-question runs.
  - **groq/openai/gpt-oss-20b** matched quality, reduced timeout fallbacks, and became the default reranker.
  - The reranker still returns `null` on timeout or model errors so the caller can preserve vector order.
  - `GROQ_API_KEY` is required for Groq routing; without it, the guard throws instead of silently using the wrong key.
- **policy_corpus_reranker_removal.md** supersedes the reranker lifecycle with the final state:
  - The LLM policy-corpus reranker was **removed entirely in PR #71 on 2026-07-09**.
  - Deleted pieces included reranker config, telemetry, contract, provenance plumbing, and `GROQ_API_KEY` usage on the agent service.
  - Deterministic internal `rerank.ts` HitScorers were left untouched.
  - `finalizeHybridHits` became synchronous.
  - Re-entry path, if needed, is **voyage rerank-2.5-lite cross-encoder** at the frame selection point in `section-views.ts`.

## Coverage scoring and retrieval ranking
- **policy_corpus_coverage_scoring.md** is the main contract for section ranking:
  - Source files: `packages/policy-corpus/tests/frame/coverage-sections/scoring.test.ts` and `packages/policy-corpus/src/frame/coverage-sections/selection/scoring.ts`.
  - The scorer uses shared helpers to normalize/combine title and content, then applies weighted phrase matching plus bonuses/penalties.
  - Core numeric anchors include:
    - empty section => **0/0**
    - numbered bonus => **+0.5** to both scores
    - attachment penalty => **-3** to both scores
    - limitation bonus => **+3** support-only
    - MA-2180 premium bonus => **+1.5** primary-only
    - phrase match weight = **1.8**
    - low-signal multiplier = **0.35**
  - Query-flag-gated paths include telehealth, certification, and HCWD behaviors.
  - The test suite is contamination-free: it uses real helpers and term lists, not mocks.
- The file also names the key implementation pieces:
  - `normalizeSearchText`
  - `combineText`
  - `scoreTermMatches`
  - `isCoverageLimitationText`
  - `CoverageQueryFlags`

## Embeddings and evaluation harness constraints
- **eval_harness_and_embedding_dimension_constraints.md** ties retrieval quality to model-width alignment:
  - AB harness compares candidate embeddings against `voyage-law-2` at **1024** dimensions.
  - `scripts/eval-ab.sh` uses the held-out paraphrase split to gate swaps.
  - Mismatched embedding widths can silently break retrieval.
  - To test **2048** dimensions, `voyage_client.embed()` must send `output_dimension`.

## Ops backup workflow and storage
- **ops_backup_workflow_and_storage.md** documents operational backup flows for corpus and Mastra data.
- Shared helper script: `scripts/ops/lib.sh`
  - Centralizes logging, healthchecks, locks, Railway CLI wrapping, and bucket path construction.
  - Every Railway CLI call must strip stale `RAILWAY_API_TOKEN` via the `railway_cli` wrapper.
- Corpus backups:
  - `scripts/ops/backup-corpus.sh`
  - Runs **weekly**
  - Backs up crawler registry, downloaded documents, parsed artifacts, and durable pipeline data
  - Uses `sqlite3 VACUUM INTO` for a consistent snapshot and `rclone sync` with `--backup-dir` so deleted/overwritten files are retained
  - Retention deletes deleted-history after **120 days**
- Mastra backups:
  - `scripts/ops/backup-mastra.sh`
  - Runs **daily**
  - Snapshots the production LibSQL store from the agent Railway volume
  - Uses container-side `VACUUM INTO` or `@libsql/client` fallback, then downloads, integrity-checks, and uploads the snapshot
  - Retention prunes bucket copies after **30 days**
- Storage facts:
  - Railway bucket: **`backups-opc52lfuqxshx6vyl`**
  - Region: **iad**
  - Endpoint: **https://t3.storageapi.dev**
  - Bucket-scoped credentials require `ncmedicaid:<bucketName>/` paths and cannot list buckets
- Healthchecks:
  - Scripts use `hc_start`, `hc_ok`, and `hc_fail`
  - Healthchecks outages must not fail the backup itself

## Theme summary
- The corpus is centered on **durable context engineering**, **model/reranker governance**, **retrieval quality guardrails**, and **operational reliability**.
- Recurrent patterns:
  - Use **evaluation gates** before changing models or embeddings.
  - Preserve **runtime-boundary correctness** in env, Sentry, and deployment-sensitive code.
  - Prefer **deterministic fallbacks** when LLM-driven ranking or reranking fails.
  - Treat curation as a disciplined pipeline: **extract facts, preserve rules, verify by applied file paths, and UPSERT durable knowledge**.