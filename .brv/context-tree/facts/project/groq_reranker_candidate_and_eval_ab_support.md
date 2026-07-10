---
title: Groq reranker candidate and eval AB support
tags: []
related: [facts/project/context.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-08T16:45:23.197Z'
updatedAt: '2026-07-08T16:45:23.197Z'
---
## Raw Concept
**Task:**
Document Groq reranker model routing and the eval-ab reranker gate changes.

**Changes:**
- Renamed createModel to createRerankerModel and exported it for tests.
- Added Groq routing via createOpenAI with the Groq base URL.
- Added optional RERANK_CANDIDATE_MODEL support to eval-ab reranker gating.
- Kept the existing fallback path for reranker failures.

**Files:**
- packages/agent/src/policy-corpus-reranker.ts
- scripts/eval-ab.sh
- .env.example

**Flow:**
model prefix detection -> provider selection -> generateObject rerank -> fallback to vector order on error

**Timestamp:** 2026-07-08

**Author:** ByteRover context engineer

## Narrative
### Structure
policy-corpus-reranker.ts now contains provider routing for groq/, openai/, anthropic/, and default Anthropic fallback. eval-ab.sh contains gates for embeddings, reranker, and verifier, with the reranker gate using answer-level evaluation for hard-query behavior.

### Dependencies
Groq routing depends on GROQ_API_KEY and the OpenAI-compatible Groq endpoint. The reranker gate depends on the full agent path because shouldAttemptRerank() is driven by route analysis and only fires for hard or ambiguous queries.

### Highlights
Default reranker remains gpt-5-mini. Groq failures degrade gracefully to the original vector order and increment process diagnostics. The reranker A/B gate can now compare baseline, candidate, and off arms.

### Rules
Groq's own slashed ids may contain slashes; only the leading groq/ segment is stripped. For Medicaid questions that do not explicitly mention CHIP or Title XXI, prefer base-Medicaid CFR parts over 42 CFR 457.

### Examples
Example reranker command: GROQ_API_KEY=... RERANK_CANDIDATE_MODEL=groq/openai/gpt-oss-20b scripts/eval-ab.sh reranker. Example candidate routing: groq/openai/gpt-oss-20b -> openai/gpt-oss-20b.

## Facts
- **groq_reranker_routing**: policy-corpus-reranker.ts now routes model IDs with the leading groq/ prefix to createOpenAI using Groq's OpenAI-compatible endpoint. [project]
- **groq_model_id_normalization**: Only the leading groq/ segment is stripped from Groq model IDs, so groq/openai/gpt-oss-20b becomes openai/gpt-oss-20b. [project]
- **groq_reranker_dependencies**: Groq reranker support adds no new dependencies. [project]
- **groq_api_key_env**: GROQ_API_KEY is optional in .env.example. [project]
- **reranker_default_model**: The default reranker model remains gpt-5-mini. [project]
- **reranker_fallback_behavior**: Any Groq reranker failure falls back to the existing null fallback, which preserves vector order and increments reranker_fallback_count. [project]
- **reranker_ab_eval**: eval-ab.sh gate_reranker now accepts an optional RERANK_CANDIDATE_MODEL third arm. [project]
- **reranker_gate_measurement**: The reranker A/B gate uses answer-level evaluation because reranking only engages in the full agent path for hard or ambiguous queries. [project]
- **reranker_stability_check**: The reranker gate runs stability using eval-answer-stability --last sized by the number of arms times RUNS. [project]
- **reranker_trial_command**: The trial command is GROQ_API_KEY=... RERANK_CANDIDATE_MODEL=groq/openai/gpt-oss-20b scripts/eval-ab.sh reranker. [project]
