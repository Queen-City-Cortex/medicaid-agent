---
children_hash: da99cbe5d7187460283a574867f5025bf8b1c1bee443fa3b9e9634c7fcf1962c
compression_ratio: 0.4214634146341463
condensation_order: 1
covers: [amendment_detection_pipeline.md]
covers_token_total: 1025
summary_level: d1
token_count: 432
type: summary
---
# Amendment Detection Pipeline

The amendment detection work centers on `packages/pipeline/src/pipeline/references/amendments.py` and the `detect_amendments()` flow that identifies change notices and revised SPAs, extracts supporting context, and writes AMENDS edges to Neo4j. The main architectural pieces are helper predicates such as `_is_change_notice`, `_is_revised_spa`, `_is_signal_section`, and `_is_sentence_boundary`, followed by batched graph writes and status updates.

## Core behavior
- Queries documents, identifies amendment-relevant sources, collects MA/SPA references, extracts sentence-level context, and emits `AMENDS` edges.
- Uses `pipeline.config.GRAPH_BATCH_SIZE`, `pipeline.graph.connection.get_session`, `pipeline.graph.queries`, `pipeline.utils.batching.chunked`, and `rich.console.Console`.
- After edge creation, amendment-origin docs are explicitly marked `status="amendment"`.

## Key fixes and decisions
- Sentence boundary detection was corrected so periods inside MA-series identifiers are not treated as sentence ends.
- `_extract_context` now preserves full sentences even when references contain dotted MA numbers like `MA-2180.IV.I`.
- `change_description` entries are deduplicated per `(source, target)` before `queries.MERGE_AMENDS_BATCH`.
- Signal sections are prioritized over fallback bodies when determining context excerpts.

## Important patterns
- Change notices are detected with titles like `CHANGE NOTICE FOR MANUAL NO. ...`.
- MA-series policy numbers are matched with `((?:MA|DMA|DHB|DSS)-\d+)`.
- SPA identifiers are extracted with `SPA\s+(\d+[\s\-]+\d+)`.

## Drill-down entry
- `amendment_detection_pipeline.md` — full pipeline details, rules, patterns, and update behavior.