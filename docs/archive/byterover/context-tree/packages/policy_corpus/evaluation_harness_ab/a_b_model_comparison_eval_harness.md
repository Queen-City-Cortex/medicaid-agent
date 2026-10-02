---
title: A/B Model Comparison Eval Harness
tags: []
related: [packages/policy_corpus/frame/coverage_selection_and_graph_fixtures.md, packages/policy_corpus/retrieval_quality/retrieval_quality_depends_on_decontamination_plus_staged_ranking.md, packages/pipeline/evaluation_harness_ab/embeddings_a_b_result_voyage_4_vs_voyage_law_2.md, packages/pipeline/evaluation_harness_ab/embeddings_a_b_result_voyage_law_2_vs_voyage_4_large.md, packages/pipeline/evaluation_harness_ab/a_b_model_comparison_eval_harness_corrections.md, packages/pipeline/eval_a_b_gate_corrections.md, packages/policy_corpus/retrieval/reranker_gate_logic_and_a_b_evaluation.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-06-14T05:03:20.603Z'
updatedAt: '2026-06-14T05:03:20.603Z'
---
## Raw Concept
**Task:**
Document the A/B model-comparison evaluation harness for policy corpus runs.

**Changes:**
- Extended the existing pipeline eval harness to compare model swaps.
- Added env-overridable embedding and query model settings.
- Added result provenance stamping for eval comparison.
- Added an isolated Neo4j container for candidate embedding corpora.
- Created scripts/eval-ab.sh to orchestrate embeddings, reranker, and verifier gates.

**Files:**
- packages/pipeline/src/pipeline/config.py
- packages/agent/src/config.ts
- packages/pipeline/src/pipeline/eval/runner.py
- scripts/eval-ab.sh
- docker-compose.ab.yml

**Flow:**
baseline eval -> candidate eval -> eval-compare for embeddings and reranker; repeated answer runs -> stability summary -> citation gate for verifier

**Timestamp:** 2026-06-14

**Patterns:**
- `^s*BUILD_CANDIDATE=1s*$` - Optional flag to rebuild the candidate corpus before the embeddings gate
- `^s*POLICY_CORPUS_RERANK_ENABLED=(true|false|1|0)s*$` - Boolean environment toggle for reranker enablement

## Narrative
### Structure
The harness reuses the existing pipeline eval runner and layers a shell orchestrator on top. The shell script drives separate baseline and candidate runs, while runner.py records provenance fields so comparison tooling can distinguish the arms.

### Dependencies
Depends on Neo4j Community Edition isolation, full environment propagation into eval subprocesses, and matching embedding/query models. The candidate corpus is intentionally disposable and lives in its own container/volume.

### Highlights
The design explicitly avoids multi-database Neo4j assumptions, keeps the held-out paraphrase split as the honest baseline, and gates adoption on the configured regression threshold. The verifier gate is stochastic and therefore repeated across multiple runs.

### Rules
All comparisons use heldout-paraphrase.json (only honest baseline per the 2026-06-11 de-contamination review). A swap is adopted only if its gate shows no regression (metric drop > EVAL_REGRESSION_THRESHOLD, 0.05).

### Examples
Example workflows: scripts/eval-ab.sh embeddings; scripts/eval-ab.sh reranker; scripts/eval-ab.sh verifier.

## Facts
- **eval_harness_strategy**: The evaluation harness was extended, not rebuilt, to support A/B model-comparison runs. [project]
- **ab_swaps**: There are three gated swaps: embeddings, reranker, and verifier. [project]
- **embeddings_gate**: The embeddings gate compares voyage-law-2 against voyage-4-large for deterministic retrieval evaluation. [project]
- **reranker_gate**: The reranker gate compares an LLM reranker against none or another reranker for deterministic retrieval evaluation. [project]
- **verifier_gate**: The verifier gate compares gpt-5.4-mini against gpt-5.4-nano using stochastic answer and citation evaluation with 3 runs. [project]
- **neo4j_isolation**: Neo4j Community Edition is single-database, so the candidate corpus is isolated in a second container on bolt:7688 instead of using multi-DB. [project]
- **embedding_model_lockstep**: Pipeline EMBEDDING_MODEL must equal agent VOYAGE_MODEL for vector similarity to be meaningful. [project]
- **embedding_input_type**: input_type remains asymmetric between document and query embeddings. [project]
- **env_overrides**: EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, and VOYAGE_MODEL are environment-overridable. [project]
- **subprocess_env_propagation**: Both eval subprocesses pass the full os.environ through, so the overrides propagate. [project]
- **dotenv_override_safety**: load_dotenv(override=True) does not clobber the override variables because the root .env only contains three API keys. [project]
- **result_provenance**: runner.py stamps embedding_dimensions, neo4j_uri, and reranker into result config so eval-compare can distinguish arms. [project]
- **comparison_dataset**: All comparisons use heldout-paraphrase.json as the baseline dataset. [project]
- **ab_script_orchestration**: scripts/eval-ab.sh orchestrates all three gates. [project]
- **adoption_threshold**: A swap is adopted only if its gate shows no regression greater than EVAL_REGRESSION_THRESHOLD of 0.05. [project]
