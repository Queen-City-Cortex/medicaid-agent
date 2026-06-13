---
children_hash: ee66841af0ab6891f7ad1fb21b7190900e3c8e8790f9f0c690d54f927798f16d
compression_ratio: 0.3437859608745685
condensation_order: 1
covers: [answer_quality/_index.md, answer_quality_and_cross_reference_evaluation.md, context.md, cross_reference_resolution/_index.md, evaluation_pipeline.md, remediation_plan_2026_06_11_to_2026_06_12.md]
covers_token_total: 3476
summary_level: d1
token_count: 1195
type: summary
---
# Evaluation Pipeline

The QA evaluation pipeline has two tightly connected layers: **Level 3 answer scoring** and **Level 2 cross-reference resolution**. The maintenance thread also includes a June 11–12, 2026 remediation stream that ties together held-out dataset integrity, SSA ingestion rules, citation fidelity, paraphrase rebaseline metrics, and staged fixes.

## Core Structure

- **Level 3 Answer Evaluation** — see `answer_quality/_index.md` and `qa/evaluation_pipeline/answer_evaluation_level_3.md`
  - Runs `evaluate_answers(entries)` in `packages/pipeline/src/pipeline/eval/levels/answer.py`.
  - Flow: golden entry → agent invocation → Neo4j evidence fetch → `judge_answer` scoring → aggregate metrics.
  - Agent invocation is **HTTP-first** with **CLI fallback**.
  - Judge errors are normalized:
    - `judge` error type → `factual_accuracy`, `completeness`, `overall`, and `citation_quality` become `None`.
    - `agent_error` truthy → all numeric scores become `0`, with the explanation preserved for logging.
  - Aggregation excludes judge-error `None` scores so metrics are not skewed.

- **Level 2 Cross-Reference Evaluation** — see `cross_reference_resolution/_index.md` and `qa/evaluation_pipeline/cross_reference_evaluation_level_2.md`
  - Implemented in `packages/pipeline/src/pipeline/eval/levels/cross_ref.py`.
  - Validates document and section relationships in Neo4j.
  - Relationship checks include:
    - `REFERENCES_DOCUMENT`
    - bidirectional `AMENDS`
    - section-level `REFERENCES` fallback
  - Tracks `resolved_count`, `missed_count`, and derived precision/recall.
  - Default metric behavior uses `resolved_count / total_refs` when references exist; `false_resolutions` and `extraction_misses` remain `0` until instrumentation is added.

## Shared Evaluation Dependencies

Covered across `context.md`, `evaluation_pipeline.md`, and `answer_quality_and_cross_reference_evaluation.md`:

- Requires a running **mastra dev HTTP service** on `localhost:4111`.
- Falls back to `npx tsx src/index.ts` when HTTP is unavailable.
- Uses **Neo4j** for evidence retrieval and relationship validation.
- Evaluation metadata includes difficulty, reasoning type, and primary hit for golden dataset entries.

## Key Failure Pattern

The remaining golden dataset failures — **q-004, q-009, q-020** — are tied to the **reference extraction pipeline**, not the scorer itself. Cross-reference improvements recover some missed links, but these entries still indicate incomplete extraction of required relationships.

## June 11–12, 2026 Remediation Thread

See `remediation_plan_2026_06_11_to_2026_06_12.md` for the consolidated maintenance plan covering:

- **Held-out evaluation dataset de-contamination**
  - The held-out dataset must remain separated from training and retrieval corpora.
  - P1 de-contamination preserved quality and matched the contaminated **2026-04-23 baseline** statistically, despite never-seen phrasings.

- **SSA ingestion rules**
  - Do **not** infer SSA membership from section numbering alone.
  - Do **not** assume section suffixes are contiguous.
  - Freestanding USC sections must never receive `SSA_TO_USC` entries.
  - Example mappings preserved:
    - `SSA 1902 -> USC 1396a`
    - `SSA 1905 -> USC 1396d`
    - `SSA 1944 -> USC 1396w-3a`

- **Trustworthiness and citation fidelity**
  - Enforced end-to-end through retrieval, citation checks, answer evaluation, cross-reference evaluation, and remediation.
  - Judge errors remain `None` and are excluded from aggregates.
  - Cross-reference evaluation checks `REFERENCES_DOCUMENT`, `AMENDS` in both directions, and section-level `REFERENCES`.

- **Held-out paraphrase rebaseline**
  - Overall: **2.60/3.00**
  - FA: **2.72**
  - Comp: **2.66**
  - Hall: **2.60**
  - Cit: **2.66**
  - Trail hit: **96%** across `n=50`
  - Judge: `claude-sonnet-4-6`
  - Mode: unified evidence
  - Git commit: `71ef5a0`

- **Remediation roadmap**
  - **P0**: answer integrity/security
  - **P1**: retrieval and UX
  - **P2**: product upgrade / infrastructure hygiene
  - **P3**: staged refactors

- **Operational workflow**
  - issue identification → remediation planning → implementation → verification
  - includes evening re-baseline metrics, score deltas, and P0/P1/P2/P3 clustering

## Drill-down References

- `answer_quality/_index.md` — level-3 answer evaluation rules and scoring behavior
- `cross_reference_resolution/_index.md` — level-2 cross-reference resolution behavior
- `evaluation_pipeline.md` — combined pipeline overview
- `answer_quality_and_cross_reference_evaluation.md` — integrated answer/cross-reference evaluation details
- `remediation_plan_2026_06_11_to_2026_06_12.md` — consolidated June 11–12 remediation, dataset integrity, SSA rules, and rebaseline metrics