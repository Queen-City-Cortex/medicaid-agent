---
children_hash: 257a0ae471cc596d98c6389dee9ab5e931ecfa378a3aad4676569fdceecca2cc
compression_ratio: 0.6166180758017493
condensation_order: 1
covers: [cross_reference_resolution_evaluation.md]
covers_token_total: 686
summary_level: d1
token_count: 423
type: summary
---
# Evaluation

Structural overview of evaluation topics centered on pipeline-level scoring and verification. The key emphasis is on how the system measures answer quality and whether cross-references are correctly resolved in the Neo4j-backed graph.

## Core topics

- **Answer Quality Evaluation** — see `answer_quality_evaluation.md` for the Level 3 answer scoring workflow and quality criteria.
- **Cross-Reference Resolution Evaluation** — see `cross_reference_resolution_evaluation.md` for the Level 2 graph relationship validation pipeline.

## Shared evaluation pattern

- Both topics belong to the broader evaluation pipeline and focus on measurable checks rather than narrative analysis.
- Each evaluation encodes a specific level in the pipeline and produces metrics that reflect system performance.
- The outputs are used to identify gaps in retrieval, citation fidelity, or reference extraction coverage.

## Cross-reference resolution specifics

`cross_reference_resolution_evaluation.md` documents a Level 2 process in `packages/pipeline/src/pipeline/eval/levels/cross_ref.py` that inspects golden entries against Neo4j relationships.

- It first checks document-level `REFERENCES_DOCUMENT` and `AMENDS` edges.
- If those do not resolve, it falls back to section-level `REFERENCES` paths via `HAS_SECTION`.
- Metrics track resolved vs missed cross-refs; precision/recall are computed from `resolved_count / total_cross_refs`.
- Evaluation improvements raised success from 0/5 to 2/5, but `q-004`, `q-009`, and `q-020` still fail due to missing reference extraction coverage.

## Drill-down references

- `answer_quality_evaluation.md`
- `cross_reference_resolution_evaluation.md`