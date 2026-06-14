---
title: 'Embeddings A/B Result: voyage-law-2 vs voyage-4-large'
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-06-14T05:58:53.544Z'
updatedAt: '2026-06-14T05:58:53.544Z'
---
## Raw Concept
**Task:**
Curate an embeddings A/B test result and strategic recommendation for retrieval quality.

**Changes:**
- Recorded the measured A/B outcomes for voyage-law-2 versus voyage-4-large
- Captured the verdict that voyage-4-large is a wash on this legal corpus
- Captured the follow-up candidate voyage-4 for potential cost savings

**Flow:**
embed documents -> deterministic retrieval -> compare metrics -> assess threshold -> record verdict -> propose follow-up

**Timestamp:** 2026-06-14

**Patterns:**
- `mrr 0\.203->0\.232 \(\+0\.029\)` - Reported MRR change for the A/B test
- `precision@k 0\.058->0\.056 \(-0\.002\)` - Reported precision@k change for the A/B test
- `primary_hit_rate 0\.480->0\.460 \(-0\.020\)` - Reported hit rate change for the A/B test
- `recall@k 0\.305->0\.305 \(0\.000\)` - Reported recall change for the A/B test

## Narrative
### Structure
The evaluation compared two 1024-dim embedding models on a legal corpus using 50 held-out questions. Results showed a small MRR gain for voyage-4-large, but precision, hit rate, and recall did not meaningfully improve.

### Dependencies
The conclusion depends on the evaluation threshold of 0.05 and on the eval-compare result showing no regression.

### Highlights
voyage-4-large was deemed a wash versus voyage-law-2; the real issue is retrieval structure, not the embedding model. A cheaper voyage-4 test remains worth trying if it matches quality.

### Rules
No metric crosses the 0.05 threshold.
Same price (/bin/zsh.12/M), so no reason to switch to voyage-4-large.

### Examples
Suggested follow-up: run CANDIDATE_MODEL=voyage-4 scripts/eval-ab.sh embeddings.

## Facts
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
