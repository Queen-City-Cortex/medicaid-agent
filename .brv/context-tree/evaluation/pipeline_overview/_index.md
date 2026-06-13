---
children_hash: 40a38aec6abbce6e58e05618cbc10b2c73926b83df60ae484e192b5fce3bad45
compression_ratio: 0.7381316998468607
condensation_order: 1
covers: [evaluation_pipeline_overview.md]
covers_token_total: 653
summary_level: d1
token_count: 482
type: summary
---
# Evaluation Pipeline Overview

- **Core purpose:** Captures the Level 2 and Level 3 evaluation flow for QA and reference resolution, centered on agent invocation, Neo4j evidence retrieval, judge scoring, and cross-reference verification.
- **Primary modules:** `packages/pipeline/src/pipeline/eval/levels/answer.py` and `packages/pipeline/src/pipeline/eval/levels/cross_ref.py` define the two evaluation paths.

## Structural flow
- **Shared pipeline shape:** golden entries → agent invocation → Neo4j evidence fetch → judge scoring → per-entry metrics / cross-reference checks → aggregate updates.
- **Answer evaluation:** handles response scoring, including agent CLI fallback via subprocess and HTTPX-based execution paths.
- **Cross-reference evaluation:** validates reference relationships in Neo4j and tracks resolved vs missed references.

## Key behaviors and decisions
- **Judge errors:** now use `None` scores instead of zeros and remain excluded from aggregates.
- **Cross-reference coverage:** validation extends to `DOCUMENT` and section-level relationships, improving resolved counts from `0/5` to `2/5`.
- **Failure hotspots:** remaining `q-004`, `q-009`, and `q-020` failures indicate missing reference extraction coverage.

## Dependencies and graph relationships
- **Answer scoring dependencies:** HTTPX, subprocess CLI fallback, Neo4j sessions, and `judge_answer` scoring.
- **Cross-ref dependencies:** Neo4j edge types `REFERENCES_DOCUMENT`, `AMENDS`, `HAS_SECTION`, and `REFERENCES`.
- **Error handling rule:** agent invocations time out after 180 seconds and raise on non-zero CLI exit codes.
- **Cross-ref rule:** missing document IDs count as missed without querying the graph.

## Drill-down references
- **`evaluation_pipeline_overview.md`** — full overview of Level 2/3 evaluation structure and metrics behavior.
- **Related topic:** `qa/hallucination_verifier` for downstream verification actions.