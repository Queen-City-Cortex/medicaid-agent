---
children_hash: 0cc2925dcc0a65a0a35503a08bd9707dd48b49124e8a16bea7f12fca089b0ec6
compression_ratio: 0.5640636846095527
condensation_order: 2
covers: [answer_quality/_index.md, context.md, cross_reference_resolution/_index.md, pipeline_overview/_index.md]
covers_token_total: 1319
summary_level: d2
token_count: 744
type: summary
---
## evaluation domain overview
- **Purpose & scope:** Centralizes Level 2/3 evaluation for answer quality, cross-reference resolution, Neo4j evidence relationships, and agent invocation/error handling (see `context.md`).
- **Ownership & usage:** Maintained by Evaluation Engineering; use this domain for documenting scoring flows, heuristics, and instrumentation tied to QA metrics.

### Level 3 answer quality evaluation (`answer_quality/_index.md`)
- **Core implementation:** `packages/pipeline/src/pipeline/eval/levels/answer.py` orchestrates HTTP-first agent answering (with CLI fallback), enforces a 180s timeout, and passes `OPENAI_API_KEY`/`AGENT_MODEL` overrides through every path.
- **Evidence & scoring flow:** Answers trigger Neo4j section queries to fetch primary/supporting texts before `judge_answer` computes per-question metrics; judge failures emit `None` scores and are excluded, while agent/process errors return zeros plus explanations.
- **Primary hit rule:** Any overall score ≥ 2 flags a primary hit; aggregates ignore unavailable judge scores.
- **Drill down:** Consult `answer_quality_evaluation.md` for task/flow details and `context.md` for domain scope.

### Level 2 cross-reference resolution (`cross_reference_resolution/_index.md`)
- **Workflow focus:** Validates golden cross-references before computing precision/recall, relying on Neo4j edges (`REFERENCES_DOCUMENT`, `AMENDS`, `HAS_SECTION`, `REFERENCES`) to connect questions to documents/sections.
- **Processing steps:** `packages/pipeline/src/pipeline/eval/levels/cross_ref.py` iterates each `cross_refs` entry, skips missing document IDs, then searches for document-level edges or section-level references to count resolved vs. missed items.
- **Metrics & impact:** Precision/recall = resolved ÷ total (zero when no references); false positives always zero; recent coverage rose from 0/5 to 2/5 resolved, with q-004, q-009, q-020 still unresolved, revealing extraction gaps.
- **Refer to:** `cross_reference_resolution_evaluation.md` for flow specifics and `context.md` for domain definitions.

### Evaluation pipeline overview (`pipeline_overview/_index.md`)
- **Structural summary:** Levels 2 and 3 routines in `pipeline/src/pipeline/eval/levels` link golden entries → agent invocation → Neo4j evidence retrieval → judge scoring → cross-reference checking → aggregate updates.
- **Rules & dependencies:** Agent errors surface CLI failures, judge timeouts/errors return `None` or zeros, missing document IDs skip Neo4j queries, and cross-reference checks depend on specific Neo4j relationships.
- **Results & gaps:** Documentation ties judge behavior and evidence sharing to scoring, explains why unresolved references persist (q-004, q-009, q-020), and captures aggregate handling of judge failures/errors.
- **Explore further:** `evaluation_pipeline_overview.md` for raw flow/changes and `context.md` for apparatus; related verification work appears under `qa/hallucination_verifier`.