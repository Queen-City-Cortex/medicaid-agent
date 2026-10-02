---
children_hash: 0b458fe38028efd5f69406adaac89c46c53ad1392ce03e1731452be595a161e0
compression_ratio: 0.5398230088495575
condensation_order: 1
covers: [cli/_index.md, eval_a_b_gate_corrections.md, evaluation_harness_ab/_index.md]
covers_token_total: 2486
summary_level: d1
token_count: 1342
type: summary
---
# A/B Evaluation Harness and CLI Split

This cluster covers two related areas: the corrected A/B evaluation workflow for embedding/reranker/verifier gates, and the pipeline CLI package refactor that preserved command behavior while splitting a monolithic module into a package. The common theme is preserving behavior under structural change and validating with controlled, repeatable runs.

## Pipeline CLI Package Split
See **Pipeline CLI Package Split** for the full refactor details and validation results.

- `packages/pipeline/src/pipeline/cli.py` was split into a `pipeline.cli` package.
- New structure:
  - `pipeline/cli/_shared.py` for shared `click` group setup and Rich console
  - `pipeline/cli/__init__.py` as package entry point
  - `pipeline/cli/__main__.py` to preserve `python -m pipeline.cli`
  - command modules: `build.py`, `references.py`, `federal.py`, `graph.py`, `eval.py`, `audit.py`
- The package entry point imports command modules for registration side effects, preserving the full command suite.
- Backward-compatible exports were retained to avoid breaking direct imports.
- The split also avoids partially initialized package import issues by moving helper targets to their defining modules.
- Tests were updated to monkeypatch module-local helpers in `pipeline.cli.build`, `pipeline.cli.eval`, and `pipeline.cli.audit`.
- Preserved behavior includes mixed-corpus build orchestration, eval defaults, answer-stability behavior, and fee-schedule backlog handling.
- Validation was reported as clean build, `ruff` clean, **301 passed**, **2 skipped**.
- The command suite still registers **25 commands**.

## Eval A/B Gate Corrections
See **Eval A/B Gate Corrections** for the script-level fixes in `scripts/eval-ab.sh`.

- The script defines shared helpers for `latest_run_id`, `summarize_metric`, `answer_arm`, and `embeddings_arm`, then dispatches to `gate_embeddings`, `gate_reranker`, or `gate_verifier`.
- The harness now runs **three gates**: embeddings, reranker, and verifier.
- Embeddings comparisons are run on the **isolated AB Neo4j container** using the **same controlled matched mixed corpus** for both arms.
- The intended comparison dimension is the **embedding model only**, not corpus composition.
- `CANDIDATE_DIMS` defaults to **1024**, matching `voyage-law-2` and avoiding width mismatch with `voyage-4-large`.
- `embeddings_arm` keeps progress on **stderr** so stdout only contains the latest `run_id`.
- Reranker evaluation is measured through **answer eval**, not retrieval eval, because route analysis exists only in the full agent path.
- Verifier evaluation is stochastic and uses repeated answer runs with citation checking.
- Adoption rule: a swap is accepted only if regression stays within `EVAL_REGRESSION_THRESHOLD = 0.05`.
- The script depends on the pipeline CLI, Docker Compose for the isolated Neo4j container, and the held-out paraphrase dataset.

## A/B Embedding Evaluation Harness and Results
See **A/B Embedding Evaluation Harness and Results** for the corrected harness behavior and the model comparisons.

### Harness behavior and gate rules
- Embeddings gates compare models on a **matched mixed corpus** in the isolated AB container.
- Reranker and verifier gates use **answer-level evaluation**, since retrieval-only evaluation misses routing behavior.
- The verifier gate adds a citation check against the newest answer run.
- The evaluation baseline is the **held-out paraphrase split**.
- Shared evaluation pattern:
  1. build or embed a matched corpus
  2. run deterministic retrieval / benchmark comparison
  3. compare held-out metrics
  4. apply the **0.05 regression threshold**
  5. decide migration based on quality and cost

### Embeddings A/B Result: voyage-4 vs voyage-law-2
- Setup: matched mixed corpus, **1024-dim vectors**, **50 held-out items**.
- Outcome: `voyage-4` matches quality on `precision@k` and `primary_hit_rate`, while slightly improving `MRR`.
- Cost: `voyage-4` cuts embedding cost by about **50%**.
- Recommendation: **adopt voyage-4**.
- Migration requirement: re-embed the production corpus and update both `EMBEDDING_MODEL` and `VOYAGE_MODEL` together.
- `voyage-4` remains **1024-dimensional**, so index dimensions do not change.

### Embeddings A/B Result: voyage-law-2 vs voyage-4-large
- Comparison: both embedders are **1024-dimensional** and evaluated on a matched mixed corpus with **50 held-out samples**.
- Metrics: `MRR` improves slightly, but `precision@k`, `primary_hit_rate`, and `recall@k` are flat or worse.
- Price: both models cost **$0.12/M**, so there is no cost advantage.
- Verdict: `voyage-4-large` is a **wash** versus `voyage-law-2`.
- Interpretation: the bottleneck appears **structural**, pointing to chunking, query routing, or retrieval design.
- Follow-up: test `voyage-4` non-large at **$0.06/M** as a cheaper candidate.

## Cross-entry relationships
- **Pipeline CLI Package Split** provides the command surface used by the evaluation scripts.
- **Eval A/B Gate Corrections** documents the script fixes that make the A/B harness trustworthy.
- **A/B Embedding Evaluation Harness and Results** records the outcomes that motivated the migration recommendations.
- The recurring structural pattern is: controlled corpus, isolated environment, held-out metrics, regression threshold, then adoption decision based on quality/cost.