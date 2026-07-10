---
title: Policy-corpus reranker removal
tags: []
related: [database_operations/neo4j_hybrid_search/context.md, facts/project/context.md]
keywords: []
importance: 55
recency: 1
maturity: draft
updateCount: 1
createdAt: '2026-07-09T01:38:43.139Z'
updatedAt: '2026-07-09T02:45:13.928Z'
---
## Raw Concept
**Task:**
Document removal of the LLM policy-corpus reranker and its evidence

**Changes:**
- Removed the policy-corpus reranker in PR #71
- Deleted reranker config, telemetry, contract, and provenance plumbing
- Kept deterministic internal rerank.ts HitScorers untouched
- Made finalizeHybridHits synchronous

**Files:**
- agent policy-corpus-reranker.ts
- POLICY_CORPUS_RERANK_* config
- reranker_last_error verifier telemetry
- CorpusReranker contract
- rerankHits threading
- runner.py reranker provenance
- GROQ_API_KEY env block

**Flow:**
evaluation -> trace analysis -> removal -> synchronous finalization -> deploy cleanup

**Timestamp:** 2026-07-09

**Author:** unknown

## Narrative
### Structure
The reranker was removed after a 2026-07-08 9-run A/B evaluation showed no meaningful benefit and trace analysis showed rerank ordering was discarded by downstream term-match re-sorting and positional frame selection.

### Dependencies
Re-entry path would use voyage rerank-2.5-lite cross-encoder at the frame selection point in section-views.ts if retrieval failures reappear. Railway follow-up is to delete GROQ_API_KEY from the agent service.

### Highlights
Stable misses were attributed to judge variance rather than retrieval failures. The post-removal answer eval remained within noise, supporting full removal.

### Rules
If retrieval failures appear, reintroduce voyage rerank-2.5-lite cross-encoder and apply it at the frame selection point in section-views.ts.

### Examples
Deployment follow-up: remove GROQ_API_KEY from the Railway agent service after the removal deploy.

## Facts
- **policy_corpus_reranker_status**: The LLM policy-corpus reranker was removed entirely in PR #71 merged on 2026-07-09. [project]
- **policy_corpus_ab_evaluation**: A 9-run A/B evaluation on 2026-07-08 found rerank-off 2.773, groq 2.759, and gpt-5-mini 2.728. [project]
- **policy_corpus_ab_ties**: Each A/B arm used 150 scores and 84-85% of cases were ties. [project]
- **policy_corpus_post_removal_eval**: Post-removal answer eval stayed within noise at 2.760 versus the off-arm 2.773 ± 0.023. [project]
