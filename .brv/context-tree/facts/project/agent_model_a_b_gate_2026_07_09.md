---
title: Agent Model A/B Gate 2026-07-09
tags: []
related: [facts/project/context.md]
keywords: []
importance: 55
recency: 1
maturity: draft
updateCount: 1
createdAt: '2026-07-09T22:13:58.778Z'
updatedAt: '2026-07-10T01:07:39.448Z'
---
## Raw Concept
**Task:**
Document the verifier-model A/B gate and final model selection

**Changes:**
- Rejected gpt-5.6-luna for verifier use
- Kept gpt-5.4-mini as the verifier model
- Confirmed no code change was required
- Closed the model-swap backlog after Terra adoption and Luna rejection

**Files:**
- scripts/eval-ab.sh

**Flow:**
compare candidate verifier -> run 3 trials per arm -> evaluate overall/factual/hallucination/citation -> reject higher-cost loser -> keep gpt-5.4-mini

**Timestamp:** 2026-07-09

**Patterns:**
- `^CANDIDATE_VERIFIER=gpt-5\.6-luna$` - Candidate verifier model override used in the evaluation script

## Narrative
### Structure
This note captures a model-selection decision for the verifier layer, including the benchmark setup, score comparison, and the resulting default model.

### Dependencies
The decision depends on verifier evaluation runs and the existing role split between the verifier configuration and observational memory.

### Highlights
The decisive factor was hallucination detection quality: gpt-5.6-luna was worse on the verifier’s core job while also costing more.

### Rules
A more-expensive candidate must clearly beat the incumbent; tying is not sufficient.
Backlog for model swaps is closed after the Terra and Luna decisions.

## Facts
- **verifier_model_ab_gate**: The verifier-model A/B gate ran on 2026-07-09/10 with gpt-5.6-terra held as the agent model while VERIFIER_MODEL varied. [project]
- **verifier_model**: gpt-5.6-luna was rejected for the verifier role and gpt-5.4-mini remains the verifier model. [project]
- **evaluation_script**: The evaluation used scripts/eval-ab.sh with CANDIDATE_VERIFIER=gpt-5.6-luna and 3 runs per arm. [project]
- **mini_scores**: gpt-5.4-mini scored 2.820±0.072 overall, 2.893±0.046 factual, 2.640±0.072 hallucination, and 2.733±0.042 citation. [project]
- **luna_scores**: gpt-5.6-luna scored 2.773±0.042 overall, 2.833±0.023 factual, 2.547±0.042 hallucination, and 2.773±0.050 citation. [project]
- **luna_comparison**: gpt-5.6-luna was worse on overall, factual, and hallucination metrics, and only tied or slightly better on citation. [project]
- **pricing_comparison**: gpt-5.6-luna costs about 33% more than gpt-5.4-mini. [project]
- **mini_usage**: gpt-5.4-mini is used in two roles: verifier in processors/verifier/config.ts via VERIFIER_MODEL default, and observational memory in index.ts. [project]
- **model_swap_backlog**: No code change was made and the backlog for model swaps is fully closed with Terra adopted for the agent and Luna rejected for the verifier. [project]
