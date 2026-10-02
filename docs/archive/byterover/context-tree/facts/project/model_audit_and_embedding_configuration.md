---
title: Model Audit and Embedding Configuration
tags: []
related: [facts/project/context.md, facts/conventions/context.md, agent_architecture/context/context.md, agent_architecture/packages_pipeline/context.md, evaluation/context.md, facts/project/agent_model_a_b_gate_2026_07_09.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-08T16:33:27.704Z'
updatedAt: '2026-07-08T16:33:27.704Z'
---
## Raw Concept
**Task:**
Audit model assignments, pricing, and gating rules for the agent and pipeline stack

**Changes:**
- Reviewed current model defaults for agent, verifier, memory, reranker, injection detector, pipeline extractor, and eval judge
- Captured July 2026 market comparison and no-swap decision
- Recorded action items for reranker trial, Terra evaluation, and data-governance guidance

**Files:**
- packages/agent/src/model.ts
- packages/agent/src/config.ts
- packages/pipeline/src/pipeline/config.py

**Flow:**
model inventory -> pricing comparison -> no-swap decision -> gated trial recommendations

**Timestamp:** 2026-07-08

**Patterns:**
- `^gpt-(5\.4|5\.4-mini|5-mini)$` - OpenAI model IDs used in the agent stack
- `^claude-(haiku-4-5-20251001|sonnet-4-6)$` - Anthropic model IDs used in the pipeline stack

## Narrative
### Structure
The agent package centralizes model selection in createModel(), while config.ts owns reranker, detector, and embedding defaults. The pipeline config.py mirrors the embedding choice and defines the evaluation judge and LLM extractor used by the corpus pipeline.

### Dependencies
Model selection depends on OpenAI and Anthropic SDK factories; embedding correctness depends on the query-side VOYAGE_MODEL matching the corpus EMBEDDING_MODEL; evaluation changes should be validated through scripts/eval-ab.sh.

### Highlights
As of 2026-07-08, the documented stance is no model swaps now because pinned models are current in tier or imminent upgrades. Recommended follow-ups are a Groq-hosted reranker trial, gating GPT-5.6 Terra as a future agent default, and keeping healthcare query-path inference on US-hosted providers.

### Rules
All model changes MUST go through scripts/eval-ab.sh gates. The eval judge model (EVAL_JUDGE_MODEL) should NEVER change casually because judge changes break eval-run comparability. The query side MUST match the corpus embedding model or vector similarity is meaningless.

### Examples
Example: set AGENT_MODEL=gpt-5.4, POLICY_CORPUS_RERANK_MODEL=gpt-5-mini, and EMBEDDING_MODEL=voyage-4 to keep the agent and pipeline aligned.

## Facts
- **agent_model**: AGENT_MODEL defaults to gpt-5.4 for the chat agent and deep research agents. [project]
- **verifier_model**: The verifier model defaults to gpt-5.4-mini. [project]
- **observational_memory_model**: Observational memory defaults to gpt-5.4-mini. [project]
- **policy_corpus_reranker**: The policy corpus reranker defaults to gpt-5-mini with a 1500 ms timeout. [project]
- **prompt_injection_detector**: The prompt-injection detector uses gpt-5-mini with threshold 0.8. [project]
- **pipeline_llm_extractor**: The pipeline LLM extractor defaults to claude-haiku-4-5-20251001. [project]
- **eval_judge_model**: The evaluation judge model is claude-sonnet-4-6 and should not be changed casually. [project]
- **embedding_model**: Embeddings use voyage-4 on both query and corpus sides. [project]
- **embedding_alignment_rule**: Voyage query embeddings must match the corpus embedding model or cosine similarity is meaningless. [project]
- **data_governance_inference_policy**: The project prefers US-hosted inference providers for query-path roles in the healthcare context. [convention]
