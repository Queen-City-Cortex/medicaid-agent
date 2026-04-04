---
children_hash: 96f4ae45c6fea65bcf9649f095046e2c8bd28761fa1e4d6f43d9d6a16382721c
compression_ratio: 0.3729752770673487
condensation_order: 1
covers: [answer_quality/_index.md, answer_quality_and_cross_reference_evaluation.md, context.md, cross_reference_resolution/_index.md, evaluation_pipeline.md]
covers_token_total: 2346
summary_level: d1
token_count: 875
type: summary
---
# Evaluation Pipeline (level d1 structural overview)

- **Overall QA Architecture**
  - Pipeline composed of two linked evaluation layers described in `evaluation_pipeline.md`, coordinating Level 3 answer scoring with Level 2 cross-reference resolution to produce recall/precision/primary-hit aggregates for the NC Medicaid agent’s golden dataset.
  - Flow: golden entry → Level 3 answer evaluation (`answer_quality/_index.md`, `answer_quality_and_cross_reference_evaluation.md`) → Level 2 cross-reference resolution (`cross_reference_resolution/_index.md`) → aggregated QA metrics.

- **Level 3 Answer Evaluation (`answer_quality/_index.md`, `answer_quality_and_cross_reference_evaluation.md`)**
  - Task: Drive controlled scoring run via `packages/pipeline/src/pipeline/eval/levels/answer.py`, invoking the ncMedicaidAgent (HTTP POST to `http://localhost:4111/api/agents/ncMedicaidAgent/generate`, falling back to `npx tsx src/index.ts` in `AGENT_DIR`), fetching evidence from Neo4j sections, and applying `judge_answer`.
  - Key decisions:
    - Agent errors zero all numeric scores but keep the explanation string; judge errors now record `None` for numeric scores and are excluded from aggregates to avoid metric pollution.
    - Evidence enrichment concatenates `Section.title` with `content_text`, and scoring metadata (precision/recall/MRR/primary hit) is preserved for downstream aggregates.
  - Dependencies: running mastra dev HTTP service (`localhost:4111`), Neo4j graph connection via `pipeline.graph.connection.get_session`.
  - Facts highlighted: HTTP-first agent invocation, Neo4j evidence sourcing, judge error handling conventions, `None`-score exclusion rule.

- **Level 2 Cross-Reference Resolution (`cross_reference_resolution/_index.md`)**
  - Task: `packages/pipeline/src/pipeline/eval/levels/cross_ref.py` iterates each golden entry’s `cross_references` and resolves them through Neo4j MATCH queries.
  - Architectural patterns:
    - Bidirectional AMENDS edges augment `REFERENCES_DOCUMENT` coverage to capture richer document-to-document links.
    - Section-level `REFERENCES` chains serve as fallbacks when document edges are missing, ensuring indirect relationships remain auditable.
    - Metrics track resolved/missed counts per entry (precision/recall = `resolved_count / total_refs`), with false resolutions and extraction misses currently placeholder zeros pending instrumentation.
  - Outcomes: 2 of 5 previously failing references recovered; entries q-004, q-009, q-020 remain flagged as reference extraction gaps.

- **Inter-layer Relationships**
  - Cross-reference checks run after Level 3 scoring, enriching aggregated QA metrics with difficulty/reasoning metadata to surface both answer quality and citation fidelity.
  - Shared dependencies include Neo4j evidence helpers and the same evaluation codebase (`packages/pipeline/src/pipeline/eval/levels/*`), aligning scoring and reference resolution flows.

- **Key Rules & Facts**
  - Judge errors emit `None` scores and are dropped from aggregates (`answer_quality_and_cross_reference_evaluation.md`).
  - Cross-reference resolution relies on `REFERENCES_DOCUMENT`, AMENDS (both directions), and section-level `REFERENCES` paths to prove relationships before counting them as resolved (`cross_reference_resolution/_index.md`).
  - Evidence fetching always precedes judging, pulling Neo4j section data enumerated in each golden entry’s `evidence` payload (`answer_quality_and_cross_reference_evaluation.md`).