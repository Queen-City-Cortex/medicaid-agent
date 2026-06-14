---
children_hash: 9809f5a0bb6f4adff8e4764174c51d09dca40d0ba3eb75ef92a5a13754527185
compression_ratio: 0.7089733225545675
condensation_order: 0
covers: [a_b_model_comparison_eval_harness.md]
covers_token_total: 1237
summary_level: d0
token_count: 877
type: summary
---
## A/B Model Comparison Eval Harness

This entry documents the policy-corpus A/B evaluation harness as an extension of the existing pipeline eval system, not a rewrite. The harness adds model-swap comparison for embeddings, reranker, and verifier runs, with `scripts/eval-ab.sh` orchestrating the flow and `runner.py` stamping provenance so `eval-compare` can distinguish baseline vs candidate arms.

### Core structure
- **Pipeline components involved**
  - `packages/pipeline/src/pipeline/config.py`
  - `packages/agent/src/config.ts`
  - `packages/pipeline/src/pipeline/eval/runner.py`
  - `scripts/eval-ab.sh`
  - `docker-compose.ab.yml`
- **Orchestration pattern**
  - baseline eval → candidate eval → `eval-compare`
  - repeated answer runs for verifier stability summary
  - citation gate for verifier output

### Gated comparisons
- **Embeddings gate**
  - Compares `voyage-law-2` vs `voyage-4-large`
  - Uses deterministic retrieval evaluation
- **Reranker gate**
  - Compares LLM reranker vs none/alternate reranker
  - Uses deterministic retrieval evaluation
- **Verifier gate**
  - Compares `gpt-5.4-mini` vs `gpt-5.4-nano`
  - Uses stochastic answer + citation evaluation
  - Repeated across 3 runs

### Key design decisions
- Neo4j Community Edition is treated as **single-database**, so the candidate corpus is isolated in a **second container/volume** on `bolt:7688` rather than relying on multi-db support.
- The harness keeps the **heldout-paraphrase.json** split as the only honest baseline after de-contamination review.
- Adoption is blocked unless the swap shows **no regression greater than `EVAL_REGRESSION_THRESHOLD = 0.05`**.
- The pipeline and agent embedding models must stay in lockstep: **`PIPELINE EMBEDDING_MODEL` must equal `AGENT VOYAGE_MODEL`** for vector similarity to remain meaningful.
- `input_type` remains **asymmetric** between document and query embeddings.

### Environment and runtime behavior
- Embedding/query model settings are **environment-overridable**:
  - `EMBEDDING_MODEL`
  - `EMBEDDING_DIMENSIONS`
  - `VOYAGE_MODEL`
- Eval subprocesses propagate the **full `os.environ`**, so overrides flow through.
- `load_dotenv(override=True)` does not overwrite those variables because the root `.env` only contains three API keys.

### Provenance and comparison metadata
- `runner.py` stamps result config fields such as:
  - `embedding_dimensions`
  - `neo4j_uri`
  - `reranker`
- This provenance is required so comparison tooling can reliably separate the baseline and candidate arms.

### Supporting artifacts and related drill-downs
- `packages/pipeline/evaluation_harness_ab/embeddings_a_b_result_voyage_4_vs_voyage_law_2.md`
- `packages/pipeline/evaluation_harness_ab/embeddings_a_b_result_voyage_law_2_vs_voyage_4_large.md`
- `packages/pipeline/evaluation_harness_ab/a_b_model_comparison_eval_harness_corrections.md`
- `packages/pipeline/eval_a_b_gate_corrections.md`
- `packages/policy_corpus/retrieval/reranker_gate_logic_and_a_b_evaluation.md`
- `packages/policy_corpus/frame/coverage_selection_and_graph_fixtures.md`
- `packages/policy_corpus/retrieval_quality/retrieval_quality_depends_on_decontamination_plus_staged_ranking.md`

### Constraints and patterns
- `BUILD_CANDIDATE=1` optionally rebuilds the candidate corpus before the embeddings gate.
- `POLICY_CORPUS_RERANK_ENABLED=(true|false|1|0)` toggles reranker enablement.
- Example usage:
  - `scripts/eval-ab.sh embeddings`
  - `scripts/eval-ab.sh reranker`
  - `scripts/eval-ab.sh verifier`