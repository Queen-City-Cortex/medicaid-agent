---
title: Policy Corpus Reranker Evaluation and Groq Default
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-08T23:25:56.611Z'
updatedAt: '2026-07-08T23:25:56.611Z'
related: [facts/project/policy_corpus_reranker_removal.md, facts/project/groq_reranker_candidate_and_eval_ab_support.md]
---
## Raw Concept
**Task:**
Document policy corpus reranker evaluation results, fallback behavior, and model selection.

**Changes:**
- Compared gpt-5-mini, groq/openai/gpt-oss-20b, and rerank-OFF across three 50-question runs.
- Observed that groq/openai/gpt-oss-20b matched quality with fewer timeout fallbacks.
- Flipped the default reranker to groq/openai/gpt-oss-20b.
- Captured the unresolved question of whether reranking adds lift over raw vector order.

**Files:**
- packages/agent/src/config.ts
- packages/agent/src/policy-corpus-reranker.ts

**Flow:**
query -> candidate selection -> optional reranker -> timeout or model ranking -> fallback to vector order on error

**Timestamp:** 2026-07-08

**Patterns:**
- `^groq/` - Model prefix that selects the Groq OpenAI-compatible endpoint
- `^gpt-|^o3|^o4` - Model prefixes routed to OpenAI

## Narrative
### Structure
The config module defines rerank enablement, model, timeout, max candidates, and debug flags. The reranker module builds a candidate preview, sends a structured ranking prompt, and returns null on timeout or model errors so the caller can use the original vector order.

### Dependencies
Uses ai generateObject with structured output validation, Anthropic and OpenAI SDK providers, and Groq via an OpenAI-compatible baseURL. Groq selection depends on GROQ_API_KEY and the Railway environment.

### Highlights
Groq/openai/gpt-oss-20b is the new default reranker because it preserves quality while cutting fallback frequency. The evaluation also records that rerank-off was within noise of the reranked arms, leaving the product value of reranking unresolved.

### Rules
Groq model ids must start with groq/ to use the Groq provider. Without GROQ_API_KEY, createRerankerModel throws an error instead of silently sending the wrong key. The reranker must return only sectionIds from the provided candidates and must not invent ids, citations, or facts.

### Examples
Example config: POLICY_CORPUS_RERANK_MODEL=groq/openai/gpt-oss-20b. Example fallback path: generateObject timeout after 1500ms -> record fallback -> return null -> caller uses vector order.

## Facts
- **reranker_eval_run**: Reranker A/B gate results were recorded on 2026-07-08 with 3 runs and 50 questions per arm, judged by claude-sonnet-4-6. [project]
- **gpt_5_mini_quality**: gpt-5-mini had overall mean±σ quality of 2.728±.033. [project]
- **groq_gpt_oss_20b_quality**: groq/openai/gpt-oss-20b had overall mean±σ quality of 2.759±.052. [project]
- **rerank_off_quality**: rerank-OFF had overall mean±σ quality of 2.773±.023. [project]
- **gpt_5_mini_fallback_rate**: gpt-5-mini fallback counts were 16/16/16 per run, about 32%, because the 1500ms timeout is too short. [project]
- **groq_fallback_rate**: groq fallback counts were 6/10/6 per run, about 15%, roughly 60% fewer than gpt-5-mini. [project]
- **reranker_default**: The default reranker model was flipped to groq/openai/gpt-oss-20b because it matched quality, reduced timeout degradations, and was about 10x cheaper. [project]
- **rerank_off_result**: rerank-off was nominally best on every metric, but the differences were within noise and baseline timeouts made it hard to compare at scale. [project]
- **groq_api_key_requirement**: The groq default requires GROQ_API_KEY in Railway env; without it, the guard throws and reranking falls back to vector order. [environment]
- **reranker_timeout_ms**: The reranker timeout is configured at 1500ms in POLICY_CORPUS_RERANK_TIMEOUT_MS. [project]
