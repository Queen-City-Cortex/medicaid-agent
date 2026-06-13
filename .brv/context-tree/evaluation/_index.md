---
children_hash: a15a8a075b613f673184cfe7d80940b4834c8aefced1d8142c4c9611e5b06482
compression_ratio: 0.47497089639115253
condensation_order: 2
covers: [answer_quality/_index.md, context.md, cross_reference_resolution/_index.md, pipeline_overview/_index.md]
covers_token_total: 1718
summary_level: d2
token_count: 816
type: summary
---
# Evaluation

Central QA evaluation domain for the Medicaid Navigator, covering answer scoring, cross-reference verification, and the shared Neo4j-backed pipeline shape. The evaluation stack is organized around two primary Level 2/3 paths: answer quality scoring and graph reference resolution.

## Shared pipeline structure
- Common flow: golden entries → agent invocation → Neo4j evidence retrieval → judge/scoring logic → per-entry metrics or cross-reference checks → aggregate updates.
- Primary implementation modules:
  - `packages/pipeline/src/pipeline/eval/levels/answer.py`
  - `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`
- The domain is focused on measurable QA checks, not general runtime configuration or unrelated business logic.

## Answer quality evaluation
See `answer_quality/_index.md` and its source `answer_quality_evaluation.md` for the Level 3 answer-scoring pipeline.
- Executes `_invoke_agent` with HTTP first and CLI fallback.
- HTTP path uses `HTTPX` and supports `OPENAI_API_KEY` and `AGENT_MODEL` passthrough overrides.
- CLI path uses `subprocess`; invocations time out after 180 seconds and fail on non-zero exit codes.
- Evidence is fetched from Neo4j for both primary and supporting sections before scoring.
- Scoring is delegated to `judge_answer`.
- Error handling is asymmetric:
  - judge errors produce `None` scores and are excluded from aggregates
  - agent errors produce zero scores and include the agent error in the explanation
- `primary_hit` is true when overall score is at least 2, when available.

## Cross-reference resolution evaluation
See `cross_reference_resolution/_index.md` and `cross_reference_resolution_evaluation.md` for the Level 2 relationship-validation pipeline.
- Inspects golden entries against Neo4j relationships to determine whether cross-references resolve correctly.
- Checks document-level edges first: `REFERENCES_DOCUMENT` and `AMENDS`.
- Falls back to section-level paths using `HAS_SECTION` and `REFERENCES`.
- Metrics track resolved vs missed cross-refs, with precision/recall computed from `resolved_count / total_cross_refs`.
- Missing document IDs count as missed without querying the graph.
- Coverage improvements raised success from `0/5` to `2/5`, but `q-004`, `q-009`, and `q-020` still fail due to missing reference extraction coverage.

## Evaluation pipeline overview
See `pipeline_overview/_index.md` and `evaluation_pipeline_overview.md` for the combined Level 2/3 structural view.
- Confirms the shared pipeline shape across answer scoring and cross-reference checks.
- Highlights the core dependencies:
  - Answer scoring: `HTTPX`, `subprocess`, Neo4j sessions, `judge_answer`
  - Cross-ref validation: Neo4j edge types `REFERENCES_DOCUMENT`, `AMENDS`, `HAS_SECTION`, `REFERENCES`
- Reinforces the key error-handling rule: agent invocations time out after 180 seconds, and CLI non-zero exits raise immediately.
- Notes that judge errors now use `None` rather than zero values, so they do not pollute aggregate metrics.

## Drill-down references
- `answer_quality/_index.md`
- `answer_quality_evaluation.md`
- `cross_reference_resolution/_index.md`
- `cross_reference_resolution_evaluation.md`
- `pipeline_overview/_index.md`
- `evaluation_pipeline_overview.md`