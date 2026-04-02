---
children_hash: e7c9a116e5273d10c9cab8bd7f6a65406466c2291e8b0f82a18dcd6281b98adb
compression_ratio: 0.5343137254901961
condensation_order: 1
covers: [amendment_detection_pipeline.md, context.md]
covers_token_total: 1020
summary_level: d1
token_count: 545
type: summary
---
# Amendment Detection Pipeline (Topic: pipeline_detection)

- **Scope & Flow** (`context.md` / `amendment_detection_pipeline.md`): Documents the NC Medicaid amendment detection pipeline implemented in `packages/pipeline/src/pipeline/references/amendments.py`. The end-to-end flow is: query documents → identify change notices/revised SPAs → collect sections and MA/SPA identifiers → extract sentence-level context with refined heuristics → build AMENDS edges in Neo4j with deduplicated descriptions and mark amendment-origin documents with `status="amendment"`.

- **Signal & Context Extraction** (`amendment_detection_pipeline.md`): Focuses on signal section predicates (`_is_change_notice`, `_is_revised_spa`, `_is_signal_section`, `_is_sentence_boundary`) and the surrounding logic in `detect_amendments()`. Regex patterns capture DHHS change notice titles, MA-series policy numbers, and multi-part SPA numbers; sentence boundary detection now treats periods followed by alphanumeric characters (e.g., `MA-2180.IV.I`) as part of references, ensuring full context is extracted instead of truncating.

- **Dependencies & Highlights** (`amendment_detection_pipeline.md`): Relies on batching utilities (`pipeline.utils.batching.chunked`), graph session/queries (`pipeline.graph.*`), and console logging (`rich.console.Console`). Highlights include improved MA reference contexts, prioritized signal sections (CONTENT OF CHANGE, POLICY UPDATE, MAINTENANCE OF MANUAL, MA-series mention), deduplicated `change_description` entries, and the explicit `status="amendment"` update after merging AMENDS edges.

- **Rules & Facts** (`amendment_detection_pipeline.md`): Enforces explicit rules for sentence boundary handling, signal section recognition, change description deduplication, and post-edge document flagging. Key facts record the updated sentence boundary logic, signal section criteria, and AMENDS edge creation/status updates via `queries.MERGE_AMENDS_BATCH` and `queries.SET_DOCUMENT_STATUS_BATCH`.

- **Related Validation Topic** (`context.md`): Points to `agent_architecture/neo4j_tool_output_validation` for ensuring the graph writes performed by this pipeline are valid.