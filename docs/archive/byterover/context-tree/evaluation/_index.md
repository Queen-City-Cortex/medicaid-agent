---
children_hash: 7b9fd1a34b6bed5f5ea84e2333e2cb7b4c9d358c065f838f3cbff74e4e6243a7
compression_ratio: 0.5508105970739423
condensation_order: 2
covers: [answer_quality/_index.md, context.md, cross_reference_resolution/_index.md, pipeline_overview/_index.md]
covers_token_total: 2529
summary_level: d2
token_count: 1393
type: summary
---
# Evaluation

This domain centers on QA and reference-validation evaluation for the Medicaid Navigator, with a shared emphasis on Neo4j-backed evidence, dataset integrity, and separating true model failures from infrastructure or data mismatches.

## Main evaluation tracks

- **Answer quality evaluation** — `answer_quality/_index.md`
  - Level 3 scoring pipeline for answer quality in `packages/pipeline/src/pipeline/eval/levels/answer.py`.
  - Flow: golden entries → `_invoke_agent` via HTTP, with CLI fallback → Neo4j section evidence fetch → `judge_answer` → per-question metrics.
  - Supports both API and CLI execution paths, extracting answers after `---ANSWER---`.
  - Failures are handled asymmetrically:
    - judge failures emit `None` score dimensions and are excluded from aggregation
    - agent failures return zero scores plus an error explanation
    - agent invocation times out after 180 seconds and raises on non-zero exit
  - `primary_hit` is set when overall score is at least 2.
  - Depends on `HTTPX`, `subprocess`, Neo4j sessions, and `judge_answer`.
  - OpenAI env passthrough supports `OPENAI_API_KEY` and `AGENT_MODEL` overrides.
  - Includes an embeddings A/B result comparing `voyage-law-2` vs `voyage-4-large`:
    - 1024-dim embeddings, 50 held-out questions, deterministic retrieval
    - `MRR 0.203 -> 0.232`, `precision@k 0.058 -> 0.056`, `primary_hit_rate 0.480 -> 0.460`, `recall@k 0.305 -> 0.305`
    - verdict: no meaningful win; no metric crossed the `0.05` threshold
    - `voyage-4-large` was a wash, with no cost advantage; `voyage-4` remains a cheaper follow-up candidate

- **Cross-reference resolution evaluation** — `cross_reference_resolution/_index.md`
  - Level 2 graph-relationship validation pipeline in `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`.
  - Evaluates golden entries against Neo4j references.
  - Resolution order:
    - document-level `REFERENCES_DOCUMENT` and `AMENDS`
    - fallback to section-level `REFERENCES` via `HAS_SECTION`
  - Metrics track resolved vs missed cross-refs; precision/recall are based on `resolved_count / total_cross_refs`.
  - Improvements raised success from `0/5` to `2/5`.
  - Remaining failures: `q-004`, `q-009`, `q-020`, attributed to missing reference extraction coverage.

- **Evaluation pipeline overview** — `pipeline_overview/_index.md`
  - Broad structural view of Level 2/3 evaluation and applied fixes from WS4 customer-readiness PR #78.
  - Core pipeline shape: golden entries → agent invocation → Neo4j evidence fetch → judge scoring → per-entry metrics and cross-reference checks → aggregate updates.
  - Shared code locations:
    - `packages/pipeline/src/pipeline/eval/levels/answer.py`
    - `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`
  - Highlights:
    - judge errors are recorded as `None`, not `0`, so they do not skew aggregates
    - cross-reference validation improved resolved counts from `0/5` to `2/5`
    - missing document IDs in cross-reference entries are treated as missed without querying the graph
    - agent invocations time out after 180 seconds and fail on non-zero CLI exit codes
  - Dependencies: `HTTPX`, subprocess fallback, Neo4j, `judge_answer`
  - Related downstream topic: `qa/hallucination_verifier`

## Applied evaluation hardening

- **WS4 customer-readiness PR #78** — `pipeline_overview/_index.md`
  - Tightened citation evaluation, graph stats reporting, and eval-compare behavior.
  - Key fixes:
    - citation eval now inherits the cached dataset when evaluating from a prior result
    - relative dataset paths are anchored to `pipeline PROJECT_ROOT`
    - `eval-compare` gained `--fail-on-regression` and exits `1` on regression or missing result files
    - stats CLI reports freshness and chunk-aware embedding coverage
  - Important diagnostic outcome:
    - citation eval failure was caused by dataset mismatch: answer runs used `data/golden/heldout-paraphrase.json` with `h-*` IDs, while citation grading defaulted to the golden dataset with `q-*` IDs
    - all 50 lookups in `eval/levels/citation.py` `cached_by_id` returned null because of this mismatch
    - `runner.py::_dataset_from_cached_result()` now inherits the cached run’s dataset when `--level citation` is used without `--dataset`
  - Metrics and audit notes:
    - first valid held-out citation metrics after the fix: `P 0.81, R 0.90, F1 0.84, primary-hit 0.90`
    - freshness audit on `2026-07-10` reported `4,467 docs`, `12/12 waivers loaded`, and `203/219 bulletins loaded`
    - April audit was stale
  - Operational guidance:
    - do not trust bare `embedding IS NULL` counts for coverage
    - use the stats query pattern
    - `stats` should warn when embedding coverage is below 99%
    - `eval-compare` exits `1` on regression and missing result files
  - Real graph gaps identified:
    - `SPA missing_graph_load:107`
    - `fee_schedule` mostly unparsed by design

## Shared structural conclusions

- Evaluation quality depends on graph-backed evidence retrieval and correct dataset provenance, not just model choice.
- Answer scoring and cross-reference validation are separate but closely related layers of the same pipeline.
- Several failure modes are treated as non-model issues:
  - judge exceptions
  - stale or mismatched datasets
  - missing graph coverage
  - partial embedding coverage masked by chunking or section structure
- The dominant theme across these entries is that correctness comes from structural rigor: aligned datasets, explicit graph relationships, and careful handling of edge cases.