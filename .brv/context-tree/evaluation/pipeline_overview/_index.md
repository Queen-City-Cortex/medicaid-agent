---
children_hash: eba71dd91cde168fbaef4b0303b0a1a0cdedcf989ed46fd04bdf13ff28e46f9f
compression_ratio: 0.627906976744186
condensation_order: 1
covers: [context.md, evaluation_pipeline_overview.md]
covers_token_total: 559
summary_level: d1
token_count: 351
type: summary
---
## pipeline_overview (Level 2/3 Evaluation Flow)
- **Structural focus:** Level 2 and Level 3 evaluation routines in `pipeline/src/pipeline/eval/levels` coordinate answer scoring (`answer.py`) and cross-reference verification (`cross_ref.py`) over dataset entries, producing structured per-entry metrics and aggregates.
- **Core flow:** golden entries → agent invocation (with fallback handling) → Neo4j evidence retrieval → judge scoring → cross-reference checks → aggregate updates.
- **Key facts & rules:** agent invocations time out after 180 seconds and surface CLI failures; judge errors return `None` scores and are excluded from aggregates; missing document IDs during cross-reference checks are treated as skips without additional Neo4j queries.
- **Dependencies & integrations:** answer evaluation uses HTTPX, subprocess CLI fallbacks, Neo4j sessions, and `judge_answer`; cross-reference checks depend on Neo4j edge types (REFERENCES_DOCUMENT, AMENDS, HAS_SECTION, REFERENCES).
- **Outcome:** Clarifies how agent errors, evidence sharing, and judge failures propagate through scoring, plus why recent cross-reference counts (now 2/5 resolved) expose gaps in q-004, q-009, q-020 reference extraction.
- **Drill-down path:** see `evaluation_pipeline_overview.md` for raw concept/changes and `context.md` for topic-level overview; related verification actions live under `qa/hallucination_verifier`.