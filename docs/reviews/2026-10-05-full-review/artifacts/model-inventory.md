# Working artifact from the model-inventory reviewer

## A. Inference inventory

Code as of commit c48a9d4. Vendor facts fetched from the vendors' own pages on 2026-10-04. "Sees": U = end-user text, P = retrieved policy text, S = synthetic or benchmark text only. "Rec." = written to `usage_events`. Paths are relative to `packages/`.

### A1. Chat request path (agent)

| # | Call site | Model: default -> override | Purpose | Sees | Provider, endpoint, hosting | Timeout | Retries | Bounds / cost cap | Rec. |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Chat agent, `agent/src/index.ts:218` via `model.ts:34` | `gpt-5.6-terra` -> `AGENT_MODEL` (production overrides to `gpt-5.4` per the project's 2026-10-03 audit) | Tool loop and answer | U + P (+ memory observations) | OpenAI Responses API, `api.openai.com` through `@ai-sdk/openai` 3.0.74; ids not starting `gpt-`/`o1`/`o3`/`o4` go to Anthropic Messages. No region pin | None in code (server 10 min; client abort) | SDK / Mastra defaults | 99 steps; 128k-token input limiter; no output cap; reasoning effort = provider default (none on gpt-5.4, medium on terra); 30/h and 150/day per user | Yes, agent totals only. Aborted runs store NULL tokens. Cache-write tokens not captured |
| 2 | Chat verifier, `agent/src/processors/verifier/verify.ts:94` (called from `processor.ts:83`) | `gpt-5.6-terra` -> `VERIFIER_MODEL` (OpenAI ids only; provider is hard-wired) | Exact-text grounding check and one correction | U (question) + draft answer + P (up to `VERIFIER_MAX_SOURCE_TOKENS`=30k tokens) | OpenAI Responses | 30 s | 0 | At most 2 passes; reasoning effort low; no output cap; fails closed | **No** on the chat path (no `onUsage`); no on CLI/eval |
| 3 | Scope gate, `agent/src/processors/scope-gate.ts:51` | `gpt-5-mini` (**deprecated; removal 2026-12-11**) -> `SCOPE_GATE_MODEL`; kill switch `SCOPE_GATE_ENABLED` | Off-topic classifier before the main model | U (new input messages, 300 chars each) | OpenAI Responses | **None** | SDK default 2 | Default reasoning effort; no output cap; fails open on error | No |
| 4 | Scope gate, Jev variant (opt-in), `agent/src/jev/scope.ts:17` -> `policy-corpus/src/jev/client.ts:42` | `jev-1.13.0` (pinned constant; `SCOPE_GATE_PROVIDER=jev` + `TYPESAFE_API_KEY`) | Same | U | TypeSafe, `api.typesafe.ai/v1/systemone`. Vendor states no training on requests; hosting region not stated on the pages read. Not on the governance allowlist | 500 ms | 0 | Body <= 30,000 bytes; $0.042/M input, output free; fails open | No (usage is logged as `scope_gate.jev` only) |
| 5 | Prompt-injection detector, `agent/src/index.ts:160-165` | `openai/gpt-5-mini` (**deprecated**), hard-coded, no override | Injection / jailbreak / system-override classifier | U (each new user message, up to 10,000 chars) | Mastra model router -> Mastra's bundled OpenAI provider -> OpenAI Responses with `OPENAI_API_KEY` | None | Not set | Threshold 0.8, block; default reasoning effort; Mastra 1.58.0 allows content on any model error with `console.warn` | No |
| 6 | Observational memory observer and reflector, `agent/src/chat-memory.ts:27` | `openai/gpt-5.4-mini`, hard-coded; kill switch `OBSERVATIONAL_MEMORY_ENABLED` | Compress thread history into observations | U + P (thread messages, tool results) | Mastra router -> OpenAI Responses. (Mastra's own default would be `google/gemini-2.5-flash`.) | Not set | Not set | Mastra defaults: observe at 30k message tokens (async buffer about every 6k), reflect at 40k observation tokens; no output cap for a non-default model | No. Not active on CLI/eval |
| 7 | Query embedding, `agent/src/policy-corpus.ts:33-47` | `voyage-4` -> `VOYAGE_MODEL` (pipeline uses `EMBEDDING_MODEL`) | Vector half of hybrid retrieval | U (the user question, passed verbatim to `resolveAnswerFrame` and embedded at `policy-corpus/src/retrieval/hybrid.ts:29`, plus model-written search queries; frame internals not traced) | Voyage AI, `api.voyageai.com/v1/embeddings`. Vendor FAQ: storage and training use apply unless the organization opts out. Not on the governance allowlist | 15 s (`VOYAGE_TIMEOUT_MS`) | 1, after 1 s | No `output_dimension` sent (default 1024); degrades to lexical on failure; $0.06/M | No |
| 8 | Thread title | none | - | - | No model call: `generateTitle` is unset and Mastra's default is false | - | - | - | - |

### A2. Deep research

| # | Call site | Model: default -> override | Purpose | Sees | Provider | Timeout | Retries | Bounds / cost cap | Rec. |
|---|---|---|---|---|---|---|---|---|---|
| 9 | Planner, `agent/src/deep-research/agents.ts:38-65`, `workflow.ts:245` | `DEEP_RESEARCH_MODEL`, default = `AGENT_MODEL` | Brief and sub-questions | U + P | As row 1 | None per call | Defaults | 6 steps; plus its own scope gate and injection detector (rows 3 and 5 again, `agents.ts:55-64`) | Yes (`planner`); its two classifiers no |
| 10 | Worker, `agents.ts:72-89`, `workflow.ts:207` | same | Research one sub-question | P + sub-question (U-derived) + web snippets | As row 1 | None per call | Defaults | 16 steps; at most 6 sub-questions (config ceiling 8); concurrency 3; step reservations | Yes (`worker`), only when `generate()` resolves |
| 11 | Reflection, `workflow.ts:369` (planner agent) | same | Gap analysis | U-derived brief + findings | As row 1 | None per call | Defaults | At most 2 rounds; rows 3 and 5 run again on the reflection prompt | Yes (`reflection`) |
| 12 | Report writer, `agents.ts:96-113`, `workflow.ts:447` | same | Final report | U question + findings | As row 1 | None per call | Defaults | 1 step | Yes (`reporter`) |
| 13 | Research verifier, `workflow.ts:194-200` | `VERIFIER_MODEL` | As row 2, per worker and for the report | Sub-question or question + draft + P + web snippets | OpenAI Responses | 30 s | 0 (checkpointed) | At most 2 passes each | Yes (`verifier`), on success only |
| 14 | Web search (opt-in), `agent/src/tools/web-search.ts:42` | Exa search (`exa-js` 2.25.0), enabled by `EXA_API_KEY` | Supplementary web context | Model-written queries derived from the user's question | Exa. Not an LLM; not on the governance allowlist; not in the privacy page's subprocessor list | Not set | None; errors return no results | 5 results x 800 chars | No |

Run-level limits for rows 9-14: two research starts per user per day, one active run per user, service concurrency 2, at most two recovery claims.

### A3. Health probes (`/dependencyz`, unauthenticated, cached 60 s)

| # | Call site | Model | Sends | Endpoint | Timeout | Notes |
|---|---|---|---|---|---|---|
| 15 | `agent/src/health.ts:56-72` | `gpt-5-mini` (**deprecated**) -> `HEALTHZ_OPENAI_PROBE_MODEL` | `ok`, `max_completion_tokens: 1` | Chat Completions, host hard-coded `api.openai.com` | 5 s | Only 401/403/429/5xx count as failure, so a 404 for a removed model reads as healthy |
| 16 | `health.ts:29-37` | `VOYAGE_MODEL` | `healthz` | Voyage embeddings | 5 s | Checks `response.ok` only, not vector width |
| 17 | `health.ts:98-111` | `process.env.AGENT_MODEL` when it starts `claude-` | `ok`, `max_tokens: 1` | Anthropic Messages | 5 s | Not triggered by `DEEP_RESEARCH_MODEL=claude-*` |

### A4. Pipeline, evaluation and offline campaigns (no end-user text)

| # | Call site | Model: default -> override | Purpose | Sees | Provider | Timeout | Retries | Bounds / cost cap | Usage kept? |
|---|---|---|---|---|---|---|---|---|---|
| 18 | `pipeline/src/pipeline/embeddings/voyage_client.py:73-81` | `voyage-4` -> `EMBEDDING_MODEL`; `EMBEDDING_DIMENSIONS` 1024 | Document embeddings | P | Voyage | 120 s | 5 attempts, backoff, honours Retry-After | Pinned local tokenizer; <= 1000 inputs and 60k tokens per batch; `truncation: false`; no dollar cap (about 1.92B tokens, about $115, before compaction per gotchas) | No (planning counts only) |
| 19 | `pipeline/src/pipeline/eval/judge.py:73-87` | `claude-sonnet-4-6`, hard-coded (`config.py:89`) | Answer-eval judge | S (golden question, reference, agent answer, evidence up to 80 KB) | Anthropic Messages | 60 s | None | `max_tokens` 1024; `temperature` 0 | No. The 2026-10-03 audit records the service Anthropic keys returning 401 |
| 20 | `pipeline/src/pipeline/eval/levels/answer.py:189` (spawns the agent CLI) | `AGENT_MODEL` from env + verifier (rows 1-2 without rows 3, 5, 6) | Answer eval | S + P | OpenAI with `EVAL_OPENAI_API_KEY`, falling back to `OPENAI_API_KEY` | 180 s per question | None | - | No. The result file does not record the agent model |
| 21 | `pipeline/src/pipeline/references/llm_extractor.py:129-153` (only with `--llm-assist`) | `claude-haiku-4-5-20251001`, hard-coded (`config.py:57`) | Implicit cross-reference extraction | P (2,000 chars x 30 sections per batch) | Anthropic Messages | 120 s | None; aborts after 3 consecutive failures | `max_tokens` 4096; prompt caching on system and tool; forced `tool_choice` | Cache-creation count is logged only |
| 22 | `pipeline/src/pipeline/jev/inference.py:22-26` -> `jev/client.py:87` | `jev-1.13.0`, pinned | Section-role and routing diagnostics | P, S | TypeSafe | 15 s | Up to 3 on 429/5xx | Reserve-before-call SQLite ledger, hard cap $25, pricing must be confirmed by env | Yes, in the campaign ledger |
| 23 | `pipeline/src/pipeline/jev/ai_review.py:74-86` | `gpt-5-mini` (**deprecated**) and `claude-opus-4-6`, hard-coded | Independent AI diagnostic labels | P, S | OpenAI Responses; Anthropic Messages | 180 s | One resumed retry | `max_output_tokens` 8192; ledger + confirmed pricing file | Yes, in the campaign ledger |
| 24 | `agent/src/jev/eval-worker.ts:26` (driven by `jev/benchmarks.py:161`) | `gpt-5-mini` required (**deprecated**) | Scope-gate baseline for Jev comparison | S | OpenAI Responses | 45 s worker | SDK default | Metered by the fetch interceptor in `agent/src/jev/validation-budget.ts` | Yes, in the campaign ledger |
| 25 | `pipeline/src/pipeline/parse/converter.py:65-75` | Docling layout / table-structure / OCR models, local | PDF parsing | P | Local inference in the corpus job | 600 s per file | - | Weights are not prefetched in `pipeline/Dockerfile` | n/a |
| 26 | `scripts/ops/sample-budget-gateway.py` | Allowlist: gpt-5.4, gpt-5.6-terra, gpt-5-mini, gpt-5.4-mini, voyage-4 | Finite paid diagnostic | S + P | OpenAI, Voyage | 90 s | - | $5 and 64 requests; output capped at 8,192 | Yes, in `budget-ledger.json` |

## B. `pricing.ts` against live vendor pricing (USD per 1M tokens, 2026-10-04)

| Key | Table: in / out / cached | Live: in / out / cached read | Live cache write | Referenced by code? | Result |
|---|---|---|---|---|---|
| `gpt-5.6-terra` | 2 / 12 / 0.2 | 2.00 / 12.00 / 0.20 | **2.50** | Default agent, verifier, deep research | Rates match; write rate missing |
| `gpt-5.4` | 2.5 / 15 / 0.25 | 2.50 / 15.00 / 0.25 | none | Deployed agent override (audit) | Match |
| `gpt-5.4-mini` | 0.75 / 4.5 / 0.075 | 0.75 / 4.50 / 0.075 | none | Memory observer (unrecorded) | Match |
| `gpt-5-mini` | 0.25 / 2 / 0.025 | 0.25 / 2.00 / 0.025 | none | Scope gate, injection detector, probe (unrecorded) | Match; model deprecated |
| `gpt-6.1-sol` | 2 / 10 / 0.1 | 2.00 / 10.00 / 0.10 | **2.50** | No (audit candidate) | Match; the 5% read rate is correct, not a typo; write rate missing |
| `gpt-6-luna` | 0.1 / 0.5 / 0.01 | 0.10 / 0.50 / 0.01 | **0.125** | No (audit candidate) | Match; write rate missing |
| `gpt-6-astra` | 10 / 50 / 1 | 10.00 / 50.00 / 1.00 | **12.50** | No | Match; write rate missing |
| `claude-sonnet-4-6` | 3 / 15 / 0.3 | 3 / 15 / 0.30 | 3.75 (5 min), 6 (1 h) | Eval judge (unrecorded); `.env.example` example | Match |
| `claude-sonnet-5-5` | 2 / 10 / 0.2 | 2 / 10 / 0.20 | 2.50, 4 | No | Match |
| `claude-opus-4-8` | 5 / 25 / 0.5 | 5 / 25 / 0.50 | 6.25, 10 | No | Match |

Not in the table, and not needed while their usage is unrecorded: `voyage-4` ($0.06/M), `jev-1.13.0` ($0.042/M input), `claude-haiku-4-5` ($1 / $5), `claude-opus-4-6` ($5 / $25). Not modelled: long-context pricing above 272K input tokens (2x input, 1.5x output on gpt-5.4, terra and gpt-6; unreachable while the 128k limiter is in place), regional-processing uplift (10% OpenAI, 1.1x Anthropic), batch and flex discounts.

Token semantics checked in the installed providers: OpenAI `outputTokens` includes reasoning tokens and `inputTokens` includes cached tokens, so `input - cached` and ignoring `reasoningTokens` are both correct. Anthropic `inputTokens` is reported by `@ai-sdk/anthropic` 3.0.85 as input + cache creation + cache read, so `input - cached` is also correct there, but cache-creation tokens are priced at the base rate (no effect today: the agent sets no `cache_control`).

## C. Lifecycle status of every model id in the repository (2026-10-04)

| Model id | Where | Vendor status |
|---|---|---|
| `gpt-5-mini` | rows 3, 5, 9, 11, 15, 23, 24 | **Deprecated.** Only snapshot `gpt-5-mini-2025-08-07` is removed 2026-12-11; vendor replacement `gpt-5.6-terra` |
| `gpt-5.6-terra` | rows 1, 2, 9-13 | Current; no dated snapshot exists to pin |
| `gpt-5.4` | deployed agent override; `scripts/eval-ab.sh` baseline | Current (alias of `gpt-5.4-2026-03-05`) |
| `gpt-5.4-mini` | row 6; `scripts/eval-ab.sh` baseline verifier | Current (alias of `gpt-5.4-mini-2026-03-17`) |
| `gpt-5.4-nano` | `scripts/eval-ab.sh:49` candidate verifier | **Deprecated 2026-10-01**, removal 2027-04-01 |
| `gpt-6.1-sol`, `gpt-6-luna`, `gpt-6-astra` | `pricing.ts` only | Current. Sol does not accept reasoning effort `none`/`minimal` and needs the Responses API for tool calls |
| `claude-sonnet-4-6` | row 19; `.env.example:17`; `RUNBOOK.md:65` | Active; retirement not sooner than 2027-02-17. Accepts `temperature`; 4.7-and-later models reject non-default values |
| `claude-haiku-4-5-20251001` | row 21 | Active; retirement not sooner than **2026-10-15** (earliest floor in the repo; no deprecation notice yet) |
| `claude-opus-4-6` | row 23 | Active; not sooner than 2027-02-05 |
| `claude-sonnet-5-5`, `claude-opus-4-8` | `pricing.ts` only | Active; not sooner than 2027-09-28 and 2027-05-28 |
| `voyage-4` | rows 7, 16, 18 | Current; 1024 default, 256/512/2048 selectable; all 4-series embeddings are mutually compatible |
| `voyage-4-large` | tokenizer pin; A/B candidate | Current |
| `voyage-law-2` | `scripts/eval-ab.sh:173`, `docker-compose.ab.yml:4`, `docs/roadmap.md:166` | Still served ($0.12/M, 16k context) but no tokenizer pin in `tokenizer.py`, so the pipeline can no longer embed with it |
| `jev-1.13.0` | rows 4, 22, 24 | Current; `jev-latest` points to it; price $0.042/M input matches the code |

## D. What one verified chat answer costs versus what is recorded

Recomputed from the repository's own retained ledger (`docs/validation/cost-audit-sample-2026-10-03/budget-ledger.json`: six questions, CLI path, gpt-5.4 agent, gpt-5.6-terra verifier).

| Component | Requests | Input / cached / cache-write / output tokens | Cost | Share | In `usage_events` on the web chat path? |
|---|---|---|---|---|---|
| Agent (gpt-5.4) | 18 | 149,987 / 53,120 / 0 / 4,606 | $0.3245 | 62.6% | Yes |
| Verifier (gpt-5.6-terra) | 8 | 73,778 / 10,997 / 62,757 / 2,887 | $0.1938 | 37.4% | **No** |
| Voyage queries | 13 | 208 | $0.00001 | 0.0% | No |
| Scope gate, injection detector, memory observer | - | not measured (the CLI skips them) | unknown | - | No |

Verifier at `pricing.ts` rates (no write rate): $0.1624, which is 16.2% below the write-aware figure. Write premium paid by the verifier: $0.0314; saved by cache reads: $0.0198 (only the 1,571-token static system prompt was ever reused, including on both second passes).
