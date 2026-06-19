---
children_hash: 585c193495ccfb02cd5f7ec31aefa63b4cfaba20304f3cc8e7df5188b0dba781
compression_ratio: 0.5209834675710047
condensation_order: 0
covers: [hybrid_retrieval_collector_pipeline.md, reranker_gate_logic_and_a_b_evaluation.md]
covers_token_total: 2359
summary_level: d0
token_count: 1229
type: summary
---
## Structural Overview

These entries describe two linked parts of the policy-corpus retrieval stack: the **hybrid retrieval collector pipeline** and the **reranker gate / A/B evaluation path**. Together, they explain how hits are collected, expanded, boosted, reranked, and evaluated, with a strong emphasis on stage ordering and on using the correct evaluation layer for meaningful results.

### 1) Hybrid Retrieval Collector Pipeline
**Entry:** `hybrid_retrieval_collector_pipeline.md`

- The collector in `packages/policy-corpus/src/retrieval/collector.ts` uses a **multi-stage merge pipeline**:
  - stage 1: backends + fulltext
  - stage 3: amendment-title expansion
  - stage 4: document expansion
  - stage 5: change-notice header expansion
  - final rerank
- Core functions called out:
  - `mergeMax`
  - `collectHybridHitMap`
  - `mergeFulltextHits`
  - `finalizeHybridHits`
- Key behavioral rules:
  - stages are applied in order
  - `mergeMax` keeps the highest-scored hit per `sectionId`
  - fulltext recovery is the exception and uses score adjustment rather than merge-max semantics
- Important architectural detail:
  - `computeDocumentCoverageBoosts()` is intentionally called **twice**
    - first on the **pre-expansion** map to help choose titles for later expansion stages
    - second in `finalizeHybridHits` on the **post-expansion** map to feed reranking
  - these two calls must not be deduped or reused across stages
- `finalizeHybridHits` contains a safe cleanup refactor:
  - repeated `Array.from(sectionMap.values())` calls can be hoisted into a local `hits` const because `sectionMap` is not mutated there
- Dependencies and constraints:
  - relies on Neo4j session isolation because concurrent branches cannot share a session
  - uses internal shared `computeDocumentCoverageBoosts()`
  - feeds into `maybeRerankHits` for final ordering
- Related note:
  - source explicitly warns that using the first boost result in `finalizeHybridHits` would produce stale boosts and alter ranking
- Verification status recorded in the entry: `typecheck:tests` and `vitest 153/153 pass`

### 2) Reranker Gate Logic and A/B Evaluation
**Entry:** `reranker_gate_logic_and_a_b_evaluation.md`

- The reranker lives in `packages/policy-corpus/src/retrieval/rerank.ts` and is controlled by `shouldAttemptRerank()`.
- The reranker is **selective**, not always-on:
  - it fail-opens back to baseline hits when gate conditions are not met
  - activation depends on query analysis, route lane, hit count, and query hardness/ambiguity
- Gate conditions documented:
  - disabled for explicit document types
  - disabled for `deterministic_evidence`
  - disabled when hits are below `MIN_RERANK_CANDIDATES`
  - enabled for hard queries with question types:
    - `federal_authority`
    - `amendment`
    - `policy_variant`
  - enabled for HCWD income premium queries
  - enabled for `ambiguous_top_hits` when:
    - `distinctDocuments.size >= 3`
    - `scoreGap <= 0.2`
- Evaluation finding:
  - **retrieval-level reranker A/B is misleading**
  - the standalone retrieval CLI lacks route analysis, so it reports `reason=not_hard_query` and effectively skips reranking
  - retrieval-level comparisons were byte-identical across precision, recall, MRR, and hit metrics on the 50 held-out questions
- Correct evaluation path:
  - reranker comparisons should run through **answer-level evaluation**
  - `scripts/eval-ab.sh` was corrected so `gate_reranker` goes through `answer_arm()`
  - this aligns with the same helper used by `gate_verifier`
- Broader conclusion:
  - the retrieval baseline is weak, so embeddings are the higher-value optimization target
  - the reranker is dormant for many queries because the route analysis often selects deterministic paths
- Example gate reasons recorded:
  - `explicit_document_types`
  - `deterministic_route`
  - `too_few_candidates`
  - `not_hard_query`
  - `hard_query:federal_authority`
  - `hard_query:hcwd_income_premium`
  - `ambiguous_top_hits`

### 3) Relationship Between the Two Entries
- The collector pipeline feeds the hit set that the reranker may later evaluate.
- `computeDocumentCoverageBoosts()` appears in the collector as part of staged expansion and again before reranking, showing that **pre-expansion selection** and **post-expansion ranking** are distinct phases.
- The reranker entry clarifies that correct measurement must happen at the **answer evaluation layer**, not the retrieval CLI layer.
- Both entries reinforce a shared design principle: **stage-specific logic matters**, and reusing results outside their intended stage can produce misleading behavior or stale ranking decisions.

### Drill-down map
- `hybrid_retrieval_collector_pipeline.md` — staged retrieval, coverage boosts, expansion order, finalize cleanup
- `reranker_gate_logic_and_a_b_evaluation.md` — reranker gates, evaluation routing, and why answer-level A/B is required