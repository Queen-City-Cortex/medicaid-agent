---
children_hash: 53ec8d2118efecbf7bc55cd2f6bae60bb39c055a4021494f88a23c6004ec116f
compression_ratio: 0.5614754098360656
condensation_order: 2
covers: [context.md, pipeline_detection/_index.md]
covers_token_total: 732
summary_level: d2
token_count: 411
type: summary
---
# amendment_detection (domain-level structural summary)
- **Purpose & scope** (`context.md`): Focuses on graph-based detection of DHHS amendment relationships in Medicaid documentation, including sanitizing change notices, revised SPAs, context extraction heuristics, and AMENDS edge updates; excludes unrelated ingestion tasks.
- **Pipeline detection topic** (`pipeline_detection/_index.md` covering `amendment_detection_pipeline.md` and `context.md`): Describes the NC Medicaid amendment detection pipeline implementation in `packages/pipeline/src/pipeline/references/amendments.py`, covering the full flow from document querying through section filtering (signal predicates such as `_is_change_notice`, `_is_revised_spa`, `_is_signal_section`, `_is_sentence_boundary`) to sentence-level context extraction, MA/SPA identifier capture, and Neo4j AMENDS edge creation with deduplicated `change_description` values.
- **Key architectural decisions & rules**: Signal section prioritization (CONTENT OF CHANGE, POLICY UPDATE, MAINTENANCE OF MANUAL, MA-series mentions), refined sentence-boundary handling that preserves references like `MA-2180.IV.I`, batch graph interactions via `pipeline.utils.batching.chunked` and `pipeline.graph.*`, logging through `rich.console.Console`, deduplication of change descriptions, and explicit `status="amendment"` flagging after merging edges (`queries.MERGE_AMENDS_BATCH`, `queries.SET_DOCUMENT_STATUS_BATCH`).
- **Dependencies & validation linkages**: Pipeline relies on batching utilities and graph query helpers while pointing to `agent_architecture/neo4j_tool_output_validation` for verifying Neo4j writes.