---
consolidated_at: '2026-06-14T19:24:30.758Z'
consolidated_from: [{date: '2026-06-14T19:24:30.758Z', path: evaluation/answer_quality/embeddings_a_b_result_voyage_law_2_vs_voyage_4_large.md, reason: 'Both files describe the same answer-quality evaluation domain and overlap heavily in topic scope. The A/B embeddings result is a specialized evaluation artifact that fits under the broader answer_quality evaluation topic, so they should be consolidated rather than kept separate.'}]
---
# Answer Quality Evaluation

## Raw Concept
**Task:**
Document the Level 3 end-to-end answer quality evaluation for ncMedicaidAgent entries.

**Changes:**
- Added transparent handling for HTTP API vs CLI agent invocation, including OpenAI env passthrough and fallbacks.
- Captured evidence retrieval via Neo4j section queries for both primary and supporting sections before judge scoring.
- Clarified that judge errors use None scores while agent errors continue returning zeros plus error explanations.
- Recorded an embeddings A/B test result for voyage-law-2 versus voyage-4-large on a legal corpus.
- Captured the verdict that voyage-4-large was a wash relative to voyage-law-2.
- Captured the follow-up candidate voyage-4 for potential cost savings.

**Files:**
- packages/pipeline/src/pipeline/eval/levels/answer.py

**Flow:**
golden entries -> _invoke_agent (HTTP -> CLI) -> fetch evidence texts (primary + supporting) -> judge_answer -> build metrics per question

**Timestamp:** 2026-04-03

**Patterns:**
- `mrr 0\.203->0\.232 \(\+0\.029\)` - Reported MRR change for the A/B test
- `precision@k 0\.058->0\.056 \(-0\.002\)` - Reported precision@k change for the A/B test
- `primary_hit_rate 0\.480->0\.460 \(-0\.020\)` - Reported hit rate change for the A/B test
- `recall@k 0\.305->0\.305 \(0\.000\)` - Reported recall change for the A/B test

## Narrative
### Structure
Answer evaluation lives in pipeline/src/pipeline/eval/levels/answer.py with helper functions for extracting the content after ---ANSWER--- markers, invoking agents via HTTP or CLI, and retrieving Neo4j section texts. The embeddings evaluation compared two 1024-dim embedding models on a legal corpus using 50 held-out questions and deterministic retrieval.

### Dependencies
Depends on HTTPX for API calls, subprocess for CLI fallbacks, Neo4j sessions for evidence, and the judge_answer scoring module. The A/B conclusion depends on the evaluation threshold of 0.05 and on the eval-compare result showing no regression.

### Highlights
Judge errors now emit None to prevent aggregation, and agent invocation passes through optional OPENAI_API_KEY and AGENT_MODEL overrides. voyage-4-large was deemed a wash versus voyage-law-2; the real issue is retrieval structure, not the embedding model. A cheaper voyage-4 test remains worth trying if it matches quality.

### Rules
Rule: agent invocation times out at 180 seconds and raises if non-zero exit code before judge scoring proceeds.
No metric crosses the 0.05 threshold.
Same price (/bin/zsh.12/M), so no reason to switch to voyage-4-large.

### Examples
Suggested follow-up: run CANDIDATE_MODEL=voyage-4 scripts/eval-ab.sh embeddings.

## Facts
- **judge_error_handling**: Judge errors now emit None for every score dimension and are excluded from aggregate metrics. [project]
- **agent_error_scoring**: Agent errors assign zeros for all scoring metrics and capture an explanation with the agent error message. [project]
- **primary_hit_threshold**: Primary_hit is marked true whenever the overall score is at least 2, if available. [project]
- **embedding_models**: The comparison was between voyage-law-2 and voyage-4-large. [project]
- **embedding_dimension**: Both models used 1024-dimensional embeddings. [project]
- **evaluation_setup**: The evaluation used a matched mixed corpus and 50 held-out questions with deterministic retrieval. [project]
- **mrr**: MRR improved from 0.203 to 0.232, a gain of 0.029. [project]
- **precision_at_k**: precision@k changed from 0.058 to 0.056, a decrease of 0.002. [project]
- **primary_hit_rate**: primary_hit_rate changed from 0.480 to 0.460, a decrease of 0.020. [project]
- **recall_at_k**: recall@k stayed at 0.305. [project]
- **verdict**: No metric crossed the 0.05 threshold, so voyage-4-large was judged a wash versus voyage-law-2 on this legal corpus. [project]
- **regression_status**: eval-compare flagged no regression. [project]
- **price**: Both models had the same price of /bin/zsh.12/M, so there was no reason to switch to voyage-4-large. [project]
- **bottleneck**: The bottleneck was identified as structural rather than embedding-model choice. [project]
- **follow_up_candidate**: A follow-up test was suggested for voyage-4 (non-large) at $0.06/M, half the price, to see if it matches voyage-law-2 quality. [project]

# Topic: answer_quality

## Overview
Captures the Level 3 evaluation routine that generates agent answers, fetches evidence, scores them, and prepares output for aggregates, plus related retrieval-model A/B findings.

## Key Concepts
- agent invocation HTTP then CLI fallback
- Neo4j section content fetching
- judge_answer scoring
- aggregates handling of judge vs agent errors
- embedding-model A/B testing for retrieval quality
- cost/performance evaluation of voyage-law-2 vs voyage-4-large and voyage-4