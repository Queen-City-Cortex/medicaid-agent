---
title: 'WS4 Customer-Readiness PR #78'
summary: 'WS4 customer-readiness: citation eval dataset mismatch fixed, eval CLI gained regression gating, stats now report chunk-aware embedding coverage and freshness.'
tags: []
related: [evaluation/pipeline_overview/evaluation_pipeline_overview.md]
keywords: []
createdAt: '2026-07-10T18:38:49.665Z'
updatedAt: '2026-07-10T18:38:49.665Z'
---
## Reason
Document eval runner, CLI, coverage, and audit findings from the WS4 readiness context

## Raw Concept
**Task:**
Document WS4 customer-readiness findings and eval/graph behavior changes from PR #78

**Changes:**
- Fixed citation eval to inherit cached dataset when evaluating from a prior result
- Anchored relative dataset paths to pipeline PROJECT_ROOT
- Added fail-on-regression behavior to eval-compare
- Improved stats CLI to report freshness and chunk-aware embedding coverage

**Files:**
- packages/pipeline/src/pipeline/eval/runner.py
- packages/pipeline/src/pipeline/cli/eval.py
- packages/pipeline/src/pipeline/cli/graph.py

**Flow:**
cached citation result -> resolve dataset -> evaluate citations -> compare runs / report graph stats

**Timestamp:** 2026-07-10T00:00:00Z

**Author:** WS4 customer-readiness

## Narrative
### Structure
The context spans eval runner behavior, eval CLI commands, graph stats reporting, and a freshness audit performed on 2026-07-10.

### Dependencies
Citation evaluation depends on the original run dataset; graph coverage checks depend on chunk-aware stats rather than raw embedding IS NULL counts.

### Highlights
The fix eliminated dataset drift in citation grading and produced first valid held-out citation metrics of P 0.81, R 0.90, F1 0.84, and primary-hit 0.90.

### Rules
Do not trust bare embedding IS NULL counts for coverage. Use the stats query pattern, not bare embedding IS NULL, to assess coverage. eval-compare exits 1 on regression and exits 1 when result files are missing.

### Examples
Use --level citation with --from-result to inherit the cached dataset automatically. stats should warn when embedding coverage is below 99%.

## Facts
- **citation_eval_dataset_mismatch**: Citation eval root cause was a dataset mismatch: answer runs used config.dataset = data/golden/heldout-paraphrase.json with h-* IDs, while citation grading defaulted to the golden dataset with q-* IDs. [project]
- **citation_eval_lookup_failures**: All 50 lookups in eval/levels/citation.py cached_by_id returned null because of the dataset mismatch. [project]
- **citation_dataset_inheritance**: runner.py::_dataset_from_cached_result() now inherits the cached run’s dataset when --level citation is used without an explicit --dataset. [project]
- **dataset_path_resolution**: Relative dataset paths recovered from cached result config are anchored at pipeline PROJECT_ROOT. [project]
- **citation_eval_metrics**: Measured citation results after the fix were Precision 0.81, Recall 0.90, F1 0.84, and primary-hit 0.90. [project]
- **eval_compare_regression_gate**: eval-compare now supports --fail-on-regression, exits 1 on regression, and exits 1 when result files are missing. [project]
- **graph_stats_freshness_and_coverage**: stats CLI now leads with max(d.last_indexed) and warns when embedding coverage is below 99%. [project]
- **embedding_coverage_clarification**: The reported 1,800 unembedded sections from naive embedding IS NULL queries are not true gaps because large sections are covered via HAS_CHUNK chunks. [project]
- **chunk_aware_coverage**: Chunk-aware coverage is 100% and bare embedding IS NULL should not be used to assess coverage. [project]
- **fresh_audit_status**: Fresh audit on 2026-07-10 reported 4,467 docs, waivers 12/12 loaded, and bulletins 203/219 loaded. [project]
- **audit_recency**: The April audit was long stale. [project]
- **remaining_graph_gaps**: Real gaps identified were SPA missing_graph_load:107 and fee_schedule being mostly unparsed by design. [project]
