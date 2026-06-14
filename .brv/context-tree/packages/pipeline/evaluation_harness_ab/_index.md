---
children_hash: 52aec83dd5734cfbb0f628afd86db3c9964f2ee7892fcfcbba676e833a66051f
compression_ratio: 0.33889104303993794
condensation_order: 0
covers: [a_b_model_comparison_eval_harness_corrections.md, embeddings_a_b_result_voyage_4_vs_voyage_law_2.md, embeddings_a_b_result_voyage_law_2_vs_voyage_4_large.md]
covers_token_total: 2579
summary_level: d0
token_count: 874
type: summary
---
# A/B Embedding Evaluation Harness and Results

This cluster documents the corrected A/B evaluation flow for embedding models in `scripts/eval-ab.sh` and the resulting benchmark comparisons between `voyage-law-2`, `voyage-4`, and `voyage-4-large`.

## Evaluation harness corrections
See **A/B Model Comparison Eval Harness Corrections** for the structural fixes to `scripts/eval-ab.sh`.

- The harness now runs **three gates**: embeddings, reranker, and verifier.
- Embeddings comparisons must be run on the **isolated AB Neo4j container** using the **same matched mixed corpus** for both arms.
- The intended embeddings-only difference is the **embedding model**, not corpus composition.
- `CANDIDATE_DIMS` default changed from **2048 to 1024** to match `voyage-law-2` and avoid dimension mismatch.
- `embeddings_arm` must emit progress to **stderr** so command substitution captures only the `run_id`.
- Adoption rule: a swap is accepted only if the gate shows **no regression beyond `EVAL_REGRESSION_THRESHOLD = 0.05`**.
- All comparisons are run against the **held-out paraphrase split**, described as the only honest baseline.

Key dependencies:
- `gate_embeddings` depends on the isolated AB container and pipeline CLI.
- Reranker and verifier gates rely on **answer-level evaluations**, since the standalone retrieval CLI does not exercise those behaviors correctly.
- The verifier gate adds a **citation check** against the newest answer run.

## Embedding model A/B results

### `Embeddings A/B Result: voyage-4 vs voyage-law-2`
This result records the preferred migration direction for the embedding layer.

- Benchmark setup: **matched mixed corpus**, **1024-dim vectors**, **50 held-out items**.
- Outcome: `voyage-4` **matches quality** on `precision@k` and `primary_hit_rate`, while **slightly improving MRR**.
- Cost: `voyage-4` cuts embedding cost by about **50%**.
- Recommendation: **adopt voyage-4**.
- Migration requirement: re-embed the production corpus and update **both** `EMBEDDING_MODEL` and `VOYAGE_MODEL` together.
- `voyage-4` remains **1024-dimensional**, so index dimensions do not change.

### `Embeddings A/B Result: voyage-law-2 vs voyage-4-large`
This result argues against switching to the larger model.

- Comparison: both embedders are **1024-dimensional** and evaluated on a matched mixed corpus with **50 held-out samples**.
- Metrics: `MRR` improves slightly (`0.203 -> 0.232`), but `precision@k`, `primary_hit_rate`, and `recall@k` are flat or worse.
- Price: both models are at **$0.12/M**, so there is no cost advantage.
- Verdict: `voyage-4-large` is a **wash** versus `voyage-law-2`.
- Interpretation: the bottleneck appears **structural** rather than embedding-specific, pointing to chunking, query routing, or retrieval design.
- Follow-up: test **`voyage-4` non-large** at **$0.06/M** as a cheaper candidate.

## Relationships and drill-down map
- **Harness behavior and gate rules** → `A/B Model Comparison Eval Harness Corrections`
- **Preferred migration to cheaper embedder** → `Embeddings A/B Result: voyage-4 vs voyage-law-2`
- **Rejection of larger embedder** → `Embeddings A/B Result: voyage-law-2 vs voyage-4-large`

## Shared structural pattern
Across the entries, the evaluation pattern is consistent:
1. build or embed a **matched corpus**
2. run **deterministic retrieval / benchmark comparison**
3. compare held-out metrics
4. apply the **0.05 regression threshold**
5. decide whether to migrate based on **quality + cost tradeoff**