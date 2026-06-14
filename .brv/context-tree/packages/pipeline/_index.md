---
children_hash: d65ee7938e4a8276616fc7210ca3d91c7d6e28e0e82c2c1d89c4fafa47705bc6
compression_ratio: 0.41785714285714287
condensation_order: 1
covers: [eval_a_b_gate_corrections.md, evaluation_harness_ab/_index.md]
covers_token_total: 1960
summary_level: d1
token_count: 819
type: summary
---
# A/B Embedding Evaluation Harness

This cluster covers the corrected A/B evaluation workflow in `scripts/eval-ab.sh` and the embedding benchmark results used to choose between `voyage-law-2`, `voyage-4`, and `voyage-4-large`.

## Harness corrections and gate behavior
See **Eval A/B Gate Corrections** and **A/B Model Comparison Eval Harness Corrections** for the implementation details.

- `scripts/eval-ab.sh` now dispatches three gates: **embeddings**, **reranker**, and **verifier**.
- The embeddings gate is now apples-to-apples: both arms are built from the **same controlled mixed corpus**, not the production graph.
- The mixed corpus sources are **dhhs_policy, clinical_policy, state_plan_amendment, CFR, and SSA**.
- `CANDIDATE_DIMS` defaults to **1024**, matching `voyage-law-2` and `voyage-4-large` native output dimensions.
- `embeddings_arm` writes progress to **stderr** so stdout only returns the latest `run_id`.
- `reranker` evaluation must be measured through **answer eval**, because retrieval-only eval omits route analysis.
- `verifier` is **stochastic** and uses repeated answer runs.
- Adoption rule: only accept a swap if regression stays within **`EVAL_REGRESSION_THRESHOLD = 0.05`**.
- The harness relies on the **pipeline CLI**, **Docker Compose** for the isolated AB Neo4j container, and the **held-out paraphrase dataset**.

## Embedding benchmark results
See the two result entries for the comparative outcomes.

### `Embeddings A/B Result: voyage-4 vs voyage-law-2`
- Uses a **matched mixed corpus** with **1024-dim vectors** and **50 held-out items**.
- `voyage-4` matches quality on **precision@k** and **primary_hit_rate**, with a slight **MRR** improvement.
- It reduces embedding cost by about **50%**.
- Recommendation: **adopt voyage-4**.
- Migration requires re-embedding the production corpus and updating **both** `EMBEDDING_MODEL` and `VOYAGE_MODEL` together.
- `voyage-4` stays **1024-dimensional**, so index dimensions do not change.

### `Embeddings A/B Result: voyage-law-2 vs voyage-4-large`
- Compares two **1024-dimensional** models on the same matched corpus with **50 held-out samples**.
- `MRR` improves slightly, but **precision@k**, **primary_hit_rate**, and **recall@k** are flat or worse.
- Both models cost **$0.12/M**, so there is no cost advantage.
- Verdict: `voyage-4-large` is a **wash** versus `voyage-law-2`.
- The bottleneck is likely **structural** rather than embedding-specific, pointing to **chunking, query routing, or retrieval design**.
- Follow-up suggestion: test **`voyage-4` non-large** at **$0.06/M**.

## Structural pattern across the cluster
The common evaluation flow is:

1. build a **matched corpus**
2. run **retrieval or answer evaluation**
3. compare held-out metrics
4. apply the **0.05 regression threshold**
5. decide based on **quality + cost tradeoff**

## Drill-down map
- **Eval A/B Gate Corrections** → gate logic, CLI behavior, and embedding dimension default
- **A/B Model Comparison Eval Harness Corrections** → harness implementation and correction details
- **Embeddings A/B Result: voyage-4 vs voyage-law-2** → preferred migration to the cheaper embedder
- **Embeddings A/B Result: voyage-law-2 vs voyage-4-large** → rejection of the larger embedder and structural diagnosis