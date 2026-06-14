---
children_hash: 5bda64d38ea9d10fbd28660ba9417060b2e58ae520034f5ad6c822a89f88eb59
compression_ratio: 0.26257796257796256
condensation_order: 2
covers: [intent-aware-staged-retrieval-dominates-both-policy-search-and-graph-frame-assem.md, pipeline/_index.md, policy_corpus/_index.md, retrieval-quality-depends-on-decontamination-plus-staged-ranking.md, retrieval-quality-depends-on-staged-overscan-filtering-and-reranking-across-sear.md, retrieval_quality/_index.md, staged-retrieval-is-the-common-answer-to-policy-search-graph-frame-assembly-and-.md]
covers_token_total: 4810
summary_level: d2
token_count: 1263
type: summary
---
# d2 Structural Summary: Staged Retrieval as the Shared Architectural Pattern

## Core theme
Across **packages**, **database_operations**, **agent_architecture**, and **qa**, retrieval is consistently modeled as a **staged pipeline** rather than a single top-k query. The shared pattern is:

**overscan broadly -> filter by intent/type/coverage -> dedupe by stable identity -> rerank/fuse/verify**

This design is repeated in policy search, graph frame assembly, hybrid Neo4j search, and QA trust/evaluation flows.

## Shared architectural decisions
- **Single-pass global top-k is insufficient**
  - Neo4j `queryNodes(k)` only provides global top-k, so systems compensate with **per-group overscan** first.
  - Relevant drill-down: **Retrieval Quality / Staged Ranking** and **Intent-aware staged retrieval dominates both policy search and graph frame assembly**.

- **Identity-stable deduplication is required before fusion**
  - Candidates are deduped by **`sectionId`** or **`section_id`** before final merging.
  - This prevents duplicate or redundant evidence from dominating the final frame.

- **Reranking and fusion happen after broad candidate collection**
  - Final ordering uses **reciprocal rank fusion (RRF)** or similar staged merge logic.
  - The system prefers multiple signals over trusting one global score.

## Policy-corpus retrieval stack
### `pipeline/_index.md`
- The A/B harness is structured around **embeddings**, **reranker**, and **verifier** gates.
- Evaluation uses a **matched mixed corpus**, with adoption controlled by **`EVAL_REGRESSION_THRESHOLD = 0.05`**.
- Key operational facts:
  - `CANDIDATE_DIMS` defaults to **1024**
  - `embeddings_arm` writes progress to **stderr**
  - verifier evaluation is **stochastic**
  - answer-level evaluation is required for reranker assessment

### `policy_corpus/_index.md`
- **Coverage routing** and **document selection** form a documented routing chain:
  - `lookup documents -> infer documents from hits -> apply setting preference -> narrow -> return routing documents`
- A major rule: **setting-preferred routing documents are authoritative before inferred narrowing**.
- In frame assembly, routed documents feed into **primary**, **supporting**, and **avoid** evidence buckets.
- Intent-sensitive authority handling pairs **statute + regulation** when authority citations are requested.

### `retrieval_quality/_index.md`
- Canonical retrieval flow:
  - **query intent -> candidate scoring -> vector overscan -> topical filtering -> group-specific ranking -> RRF merge**
- `section-vector.ts` overscans each type group with `vectorScanK(profile.perGroupK)`, then filters by `document_type`.
- `collector.ts` performs staged ranking and final merge ordering.
- Decontamination rules are part of retrieval quality:
  - HCWD history cleanup removes misleading limit-history cues
  - HCBS preserves real waiver section numbers while removing hardcoded heuristics

## Cross-domain synthesis on staged retrieval
### `retrieval-quality-depends-on-decontamination-plus-staged-ranking`
- Combines policy corpus and agent retrieval into one principle:
  - broader candidate collection
  - filtering and reranking after collection
  - no trust in a single top-k pass

### `retrieval-quality-depends-on-staged-overscan-filtering-and-reranking-across-sear`
- Extends the same idea across search stacks:
  - embeddings
  - graph matching
  - reciprocal rank fusion
  - reranking before final topK

### `staged-retrieval-is-the-common-answer-to-policy-search-graph-frame-assembly-and-`
- Connects retrieval with QA trust:
  - retrieval must surface the right evidence first
  - verifier and rewriting stages depend on that evidence
  - unsupported answers are corrected immediately

## Resulting pattern across systems
The dominant architectural choice is a **correctness-first retrieval pipeline**:
1. gather broadly
2. filter by intent or document type
3. preserve authoritative matches
4. dedupe by stable section identity
5. rerank or fuse
6. verify against evidence when needed

This shows up consistently in:
- **policy search**
- **graph frame assembly**
- **Neo4j hybrid search**
- **A/B retrieval evaluation**
- **QA verification**

## Drill-down map
- **`pipeline/_index.md`** → A/B evaluation harness, gate behavior, embeddings comparisons
- **`policy_corpus/_index.md`** → coverage routing, frame assembly, authority handling, rerank gating
- **`retrieval_quality/_index.md`** → staged ranking, per-group overscan, decontamination rules
- **`retrieval-quality-depends-on-decontamination-plus-staged-ranking`** → retrieval correctness across packages and agent architecture
- **`retrieval-quality-depends-on-staged-overscan-filtering-and-reranking-across-sear`** → shared overscan/filter/rerank pattern
- **`intent-aware-staged-retrieval-dominates-both-policy-search-and-graph-frame-assem`** → intent-aware staged retrieval as the unifying principle
- **`staged-retrieval-is-the-common-answer-to-policy-search-graph-frame-assembly-and-`** → retrieval as the basis for QA trust