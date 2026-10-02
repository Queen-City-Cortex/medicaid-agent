---
children_hash: 3aa8cd1b2bfe4d6f771c4d0fe7f4849b0fa984d886403dd069867c5389545cb8
compression_ratio: 0.5701732362540798
condensation_order: 2
covers: [conventions/_index.md, durable-knowledge-capture-mirrors-project-evaluation-discipline.md, durable-knowledge-capture-uses-the-same-contract-as-project-evaluation.md, project/_index.md]
covers_token_total: 3983
summary_level: d2
token_count: 2271
type: summary
---
# Structural Summary: facts/conventions + project

## Top-level focus
These entries define the project’s **durable knowledge and evaluation discipline**: curation is treated as a structured pipeline, while the broader project knowledge captures **model selection, retrieval/reranking, environment defaults, backups, and operational guardrails**.

## conventions/_index.md
- Centralizes **curation workflow discipline** for the context tree.
- The core pattern is **recon -> extraction -> curate -> verify**.
- Default posture is **UPSERT-first** curation.
- Child entries:
  - **context.md** — broad conventions and workflow framing.
  - **curation_workflow_guardrails.md** — exact execution constraints and verification rules.
- Key preserved rules:
  - Do not print raw context.
  - Use `tools.curation.mapExtract()` for chunked extraction.
  - Pass `taskId` as a bare variable.
  - Verify using `result.applied[].filePath`.
  - Do not rerun recon if already computed.
- Emphasis is on **fact extraction, exact rule preservation, context-tree limits, and verification discipline**.

## Durable knowledge and evaluation alignment
- **durable-knowledge-capture-mirrors-project-evaluation-discipline.md**
  - Frames curation as an **auditable pipeline** with extraction, preservation, verification, and atomic updates.
  - Connects `facts`, `agent_architecture`, and `evaluation` as sharing the same rigor.
- **durable-knowledge-capture-uses-the-same-contract-as-project-evaluation.md**
  - Repeats the same structural claim with broader coverage including `packages`.
  - Highlights that durable knowledge capture is not chat-only; it is part of the engineering system.

## project/_index.md

### Core curation and context-engineering workflow
- **agentic_map_and_rlm_curation_workflow.md**, **curation_workflow_guardrails.md**, and **curated_context_snippet.md** define the RLM-based curation pipeline.
- Shared workflow:
  - recon already computed
  - choose **single-pass** or **chunked** extraction
  - dedupe/group facts if needed
  - **UPSERT** curate
  - verify via `result.applied[].filePath`
- Guardrails:
  - Do not print raw context.
  - Do not rerun `tools.curation.recon()` when precomputed.
  - Use `tools.curation.mapExtract()` only for chunked contexts.
  - Use `tools.curation.dedup()` and `tools.curation.groupBySubject()` before curation when chunked.
- **context.md** in `facts/project` frames durable knowledge capture, UPSERT-first curation, context-tree hierarchy, and verification discipline.

### Model selection, evaluation, and gating
- **model_audit_and_embedding_configuration.md**
  - Establishes key defaults:
    - `AGENT_MODEL = gpt-5.4`
    - `verifier_model = gpt-5.4-mini`
    - `observational_memory_model = gpt-5.4-mini`
    - `policy_corpus_reranker = gpt-5-mini`
    - `prompt_injection_detector = gpt-5-mini`
    - pipeline LLM extractor = `claude-haiku-4-5-20251001`
    - eval judge = `claude-sonnet-4-6`
    - embeddings = `voyage-4`
  - All model changes must go through `scripts/eval-ab.sh` gates.
  - Query and corpus embedding models must match.
- **eval_harness_and_embedding_dimension_constraints.md**
  - `scripts/eval-ab.sh` supports **embedding** and **verifier** gates.
  - Default dataset: `data/golden/heldout-paraphrase.json`
  - Default runs: **3**
  - Embedding dimensions must match model defaults; `voyage-4-large` defaults to **1024**
  - Regression threshold for adoption: **0.05**
- **agent_model_a_b_gate_2026_07_09.md**
  - `CANDIDATE_VERIFIER=gpt-5.6-luna` was tested and **rejected**.
  - `gpt-5.4-mini` remains the verifier model.
  - No code change was required; the model-swap backlog was closed.

### Environment parsing, toggles, and runtime defaults
- **environment_parsing_helpers_and_verifier_toggle.md**
  - Adds `strEnv`, `intEnv`, `boolEnv`, and `isVerifierEnabled()` in `packages/agent/src/env.ts`.
  - `intEnv` rejects malformed integers with `Number.isFinite`.
  - `isVerifierEnabled()` is true unless `VERIFIER_ENABLED === "false"`.
  - `boolEnv` treats only `"1"` or `"true"` as true.
  - Key defaults:
    - `POLICY_CORPUS_RERANK_ENABLED = true`
    - `POLICY_CORPUS_RERANK_MODEL = gpt-5-mini`
    - `POLICY_CORPUS_RERANK_TIMEOUT_MS = 1500`
    - `POLICY_CORPUS_RERANK_MAX_CANDIDATES = 20`
    - `POLICY_CORPUS_RERANK_DEBUG = false`
    - `VOYAGE_MODEL = voyage-4`
    - `VOYAGE_API_URL = https://api.voyageai.com/v1/embeddings`
  - Records **215 agent tests pass** after env consolidation.
- **sentry_environment_and_tracing_defaults.md**
  - Browser instrumentation blocks local hostnames: `localhost`, `127.0.0.1`, `[::1]`, `0.0.0.0`.
  - Default `tracesSampleRate` is **0.1** for agent and web instrumentation.
  - Browser env values are build-time inlined; agent/server env values are runtime-read.
  - Sentry project details: `medicaid-agent`, org `queen-city-cortex-llc`, region `us.sentry.io`.
  - Last 30 days: **37 development errors, zero production events**.

### Policy corpus reranker evolution
- **groq_reranker_candidate_and_eval_ab_support.md**
  - Renames `createModel` to `createRerankerModel` and exports it for tests.
  - Groq routing uses `createOpenAI` with a Groq-compatible base URL.
  - `RERANK_CANDIDATE_MODEL` was added to `scripts/eval-ab.sh`.
  - Routing supports `groq/`, `openai/`, and `anthropic/`, with Anthropic as fallback.
  - Groq failures fall back to original vector order and increment diagnostics.
- **policy_corpus_reranker_evaluation_and_groq_default.md**
  - Compared `gpt-5-mini`, `groq/openai/gpt-oss-20b`, and `rerank-OFF`.
  - `groq/openai/gpt-oss-20b` became the default reranker.
  - On timeout or model errors, reranker returns `null` so vector order is preserved.
  - `GROQ_API_KEY` is required; missing key throws rather than silently falling back.
- **policy_corpus_reranker_removal.md**
  - The LLM policy-corpus reranker was **removed in PR #71 on 2026-07-09**.
  - Removed config, telemetry, contract, provenance plumbing, and `GROQ_API_KEY` usage on the agent service.
  - Deterministic internal `rerank.ts` HitScorers remain.
  - `finalizeHybridHits` became synchronous.
  - Re-entry path, if needed, is **voyage rerank-2.5-lite cross-encoder** in `section-views.ts`.

### Coverage scoring and retrieval ranking
- **policy_corpus_coverage_scoring.md**
  - Main contract for section ranking.
  - Uses shared helpers to normalize/combine title and content, then applies weighted phrase matching with bonuses/penalties.
  - Key numeric anchors:
    - empty section = **0/0**
    - numbered bonus = **+0.5** to both scores
    - attachment penalty = **-3** to both scores
    - limitation bonus = **+3** support-only
    - MA-2180 premium bonus = **+1.5** primary-only
    - phrase match weight = **1.8**
    - low-signal multiplier = **0.35**
  - Query-flag-gated behaviors cover telehealth, certification, and HCWD.
  - Test suite is contamination-free and uses real helpers/term lists.
  - Named implementation pieces: `normalizeSearchText`, `combineText`, `scoreTermMatches`, `isCoverageLimitationText`, `CoverageQueryFlags`.

### Embeddings and evaluation harness constraints
- **eval_harness_and_embedding_dimension_constraints.md**
  - AB harness compares candidate embeddings against `voyage-law-2` at **1024** dimensions.
  - `scripts/eval-ab.sh` gates swaps using the held-out paraphrase split.
  - Dimension mismatches can silently break retrieval.
  - Testing **2048** dimensions requires `voyage_client.embed()` to send `output_dimension`.

### Ops backup workflow and storage
- **ops_backup_workflow_and_storage.md**
  - Documents operational backup flows for corpus and Mastra data.
  - Shared helper: `scripts/ops/lib.sh`
    - centralizes logging, healthchecks, locks, Railway CLI wrapping, and bucket path construction
    - every Railway CLI call strips stale `RAILWAY_API_TOKEN`
  - Corpus backup:
    - `scripts/ops/backup-corpus.sh`
    - runs weekly
    - backs up crawler registry, downloaded docs, parsed artifacts, and durable pipeline data
    - uses `sqlite3 VACUUM INTO` and `rclone sync --backup-dir`
    - deleted-history retention: **120 days**
  - Mastra backup:
    - `scripts/ops/backup-mastra.sh`
    - runs daily
    - snapshots production LibSQL from the agent Railway volume
    - uses container-side `VACUUM INTO` or `@libsql/client` fallback
    - retention: **30 days**
  - Storage facts:
    - bucket: **`backups-opc52lfuqxshx6vyl`**
    - region: **iad**
    - endpoint: **https://t3.storageapi.dev**
    - credentials require `ncmedicaid:<bucketName>/` paths and cannot list buckets
  - Healthchecks use `hc_start`, `hc_ok`, `hc_fail`; healthcheck outages must not fail backups.

## Overall theme
The knowledge base is organized around three reinforced concerns:
1. **Durable curation discipline** — facts, exact rules, verification, UPSERT-first.
2. **Evaluation-backed engineering changes** — model, reranker, embedding, and verifier changes are gated by reproducible AB checks.
3. **Runtime reliability** — environment parsing, tracing defaults, deterministic fallbacks, and backup/ops safety.