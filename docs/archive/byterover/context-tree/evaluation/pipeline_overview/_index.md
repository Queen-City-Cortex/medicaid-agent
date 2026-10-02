---
children_hash: 35cf154339644bca7e1856ca55c29116ec934df172c9513fb47a1aa4aace2d45
compression_ratio: 0.6445383222691611
condensation_order: 1
covers: [evaluation_pipeline_overview.md, ws4_customer_readiness_pr_78.md]
covers_token_total: 1657
summary_level: d1
token_count: 1068
type: summary
---
# Evaluation Pipeline Overview

## Structural summary
This collection centers on two related evaluation tracks in `packages/pipeline`: the main Level 2/Level 3 QA evaluation flow and the WS4 customer-readiness PR #78 fixes that tightened citation evaluation and graph coverage reporting. Both entries emphasize how eval correctness depends on dataset provenance, graph-backed evidence retrieval, and clear separation between genuine failures and infrastructure or data mismatches.

## Core evaluation flow
- **Entry:** `evaluation_pipeline_overview.md`
- **Focus:** Level 2 and Level 3 evaluation for question answering and reference resolution.
- **Pipeline shape:** golden entries -> agent invocation -> Neo4j evidence fetch -> judge scoring -> per-entry metrics and cross-reference checks -> aggregate updates.
- **Code locations:** `packages/pipeline/src/pipeline/eval/levels/answer.py` and `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`.

### Key behaviors
- Answer evaluation now records judge errors as `None` rather than `0`, and excludes them from aggregates.
- Cross-reference validation checks `DOCUMENT` and section-level relationships, improving resolved counts from `0/5` to `2/5`.
- Remaining failures `q-004`, `q-009`, and `q-020` point to missing reference extraction coverage.
- Agent invocations time out after 180 seconds and fail on non-zero CLI exit codes.
- Missing document IDs in cross-reference entries are treated as missed without querying the graph.

### Dependencies and relationships
- Answer scoring depends on `HTTPX`, subprocess CLI fallback, Neo4j sessions, and `judge_answer`.
- Cross-reference checks rely on Neo4j edges: `REFERENCES_DOCUMENT`, `AMENDS`, `HAS_SECTION`, and `REFERENCES`.
- Related downstream topic: `qa/hallucination_verifier`.

## WS4 customer-readiness PR #78
- **Entry:** `ws4_customer_readiness_pr_78.md`
- **Focus:** eval runner behavior, CLI gating, graph stats reporting, and freshness audit findings.
- **Code locations:** `packages/pipeline/src/pipeline/eval/runner.py`, `packages/pipeline/src/pipeline/cli/eval.py`, `packages/pipeline/src/pipeline/cli/graph.py`.

### Key fixes
- Citation eval now inherits the cached dataset when evaluating from a prior result.
- Relative dataset paths are anchored to `pipeline PROJECT_ROOT`.
- `eval-compare` gained `--fail-on-regression`, and exits `1` on regression or missing result files.
- The stats CLI now reports freshness and chunk-aware embedding coverage.

### Metrics and audit findings
- The cached-dataset fix eliminated dataset drift in citation grading.
- First valid held-out citation metrics after the fix: **P 0.81, R 0.90, F1 0.84, primary-hit 0.90**.
- Freshness audit on `2026-07-10` reported **4,467 docs**, **12/12 waivers loaded**, and **203/219 bulletins loaded**.
- The April audit was noted as stale.

### Rules and operational guidance
- Do not trust bare `embedding IS NULL` counts for coverage.
- Use the stats query pattern for coverage assessment.
- `stats` should warn when embedding coverage is below 99%.
- `eval-compare` exits `1` on regression and when result files are missing.

### Important facts and diagnostics
- The citation eval root cause was a dataset mismatch: answer runs used `data/golden/heldout-paraphrase.json` with `h-*` IDs, while citation grading defaulted to the golden dataset with `q-*` IDs.
- All 50 lookups in `eval/levels/citation.py` `cached_by_id` returned null because of that mismatch.
- `runner.py::_dataset_from_cached_result()` now inherits the cached run’s dataset when `--level citation` is used without `--dataset`.
- `embedding IS NULL` suggested 1,800 unembedded sections, but this is not a true gap because large sections are covered through `HAS_CHUNK`.
- Chunk-aware coverage is 100%.
- Real graph gaps identified were `SPA missing_graph_load:107` and `fee_schedule` being mostly unparsed by design.

## Cross-entry relationship
- `ws4_customer_readiness_pr_78.md` links back to `evaluation_pipeline_overview.md`, indicating the PR work is an applied refinement of the broader evaluation pipeline.
- Together, these entries show a shared theme: reliable evaluation requires dataset integrity, correct graph interpretation, and careful handling of partial or non-failure conditions.