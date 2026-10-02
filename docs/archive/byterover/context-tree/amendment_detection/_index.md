---
children_hash: 45ec7dc7051509e5d0cd78a3abb4c29e95a4233f7c4ae3d7aad7a148954d2f03
compression_ratio: 0.8555194805194806
condensation_order: 2
covers: [context.md, pipeline_detection/_index.md]
covers_token_total: 616
summary_level: d2
token_count: 527
type: summary
---
# Amendment Detection

Graph-based DHHS amendment detection for Medicaid documentation. This domain centers on identifying change notices and revised SPAs, extracting the right surrounding context, and writing `AMENDS` relationships into Neo4j. See `pipeline_detection/_index.md` and `context.md` for the authoritative pipeline scope and behavior.

## Structural overview

- **Domain purpose**: Capture document-scanning heuristics for DHHS amendment relationships, context extraction, signal-section selection, and graph edge/status updates.
- **Primary implementation**: `packages/pipeline/src/pipeline/references/amendments.py`, especially `detect_amendments()`.
- **Core flow**:
  - scan documents for amendment-relevant sources
  - detect change notices and revised SPAs
  - extract MA/SPA references and sentence-level context
  - create batched `AMENDS` edges in Neo4j
  - update originating documents to `status="amendment"`

## Key behaviors and decisions

- Uses helper predicates such as `_is_change_notice`, `_is_revised_spa`, `_is_signal_section`, and `_is_sentence_boundary`.
- Batching and graph writes rely on `pipeline.config.GRAPH_BATCH_SIZE`, `pipeline.graph.connection.get_session`, `pipeline.graph.queries`, `pipeline.utils.batching.chunked`, and `rich.console.Console`.
- Sentence boundary detection was fixed so periods inside MA-series identifiers do not split sentences incorrectly.
- `_extract_context` preserves full sentences even when references contain dotted MA numbers like `MA-2180.IV.I`.
- `change_description` entries are deduplicated per `(source, target)` before `queries.MERGE_AMENDS_BATCH`.
- Signal sections are preferred over fallback bodies when choosing context excerpts.

## Detection patterns

- Change notices are recognized by titles like `CHANGE NOTICE FOR MANUAL NO. ...`
- MA-series policy numbers match `((?:MA|DMA|DHB|DSS)-\d+)`
- SPA identifiers match `SPA\s+(\d+[\s\-]+\d+)`

## Drill-down

- `pipeline_detection/_index.md` — condensed pipeline summary and key fixes
- `amendment_detection_pipeline.md` — full pipeline rules, patterns, and update behavior