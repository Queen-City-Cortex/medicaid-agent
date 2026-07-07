---
children_hash: 7b3550944c322e47587a1b0347245ab7e092f9879b5c6b44e1176d4c28966362
compression_ratio: 0.20002782028098484
condensation_order: 2
covers: [context.md, neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md, neo4j_auth/_index.md, neo4j_hybrid_search/_index.md, neo4j_write_read_consistency/_index.md, schema-aware-validation-is-the-common-safety-net-across-graph-writes-retrieval-a.md, schema-aware-validation-is-the-common-safety-net-from-graph-writes-to-evaluation.md, schema-aware-validation-is-the-guardrail-from-graph-writes-to-qa.md, schema-aware-validation-is-the-shared-guardrail-for-graph-data-and-evaluation.md, schema-aware-validation-is-the-shared-guardrail-from-graph-writes-to-evaluation.md, schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md, schema-aware-validation-is-the-shared-safety-net-from-graph-writes-to-evaluation.md]
covers_token_total: 7189
summary_level: d2
token_count: 1438
type: summary
---
# database_operations: structural summary

## Domain purpose
`database_operations` captures operational knowledge about database deployments and authentication incidents affecting the platform. It focuses on database connection/authentication issues, environment-specific deployment quirks, and password rotation or configuration guidance.

## Core structure

### Neo4j auth and production refresh
See `neo4j_auth/_index.md` for Railway-specific authentication behavior and safe production refresh patterns.

- Railway URL-decodes environment variables, so `+` can corrupt Neo4j passwords.
- `NEO4J_AUTH` only applies on first volume initialization; it does not update existing databases.
- The safe auth remediation path is to rotate to an alphanumeric-only password and apply it through the bolt TCP proxy with `ALTER CURRENT USER SET PASSWORD`.
- Production refreshes must be targeted and non-destructive, using the Railway TCP proxy plus controlled ingest / re-embedding steps instead of a full reset.

Key relationship:
- Both auth remediation and production refresh depend on Railway proxy handling and environment-sensitive credential setup.

### Neo4j hybrid search and deployment workflows
See `neo4j_hybrid_search/_index.md` for graph retrieval, refresh pipelines, and embedding migration.

- Hybrid retrieval combines section embeddings, chunk embeddings, concept graph matches, and fulltext keyword hits.
- Retrieval uses Reciprocal Rank Fusion with `RRF_K = 60`.
- Required indexes include `section_embeddings`, `chunk_embeddings`, and `section_fulltext` for `Section.title` and `Section.content_text`.
- Concept matching is gated by `query_text` and document-type filters.
- Source results are deduplicated by `section_id` before fusion.

Operational pipeline topics:
- `deploy_data_script_and_refresh_workflow.md` documents the destructive remote refresh script `scripts/deploy-data.sh`.
- The refresh pipeline is a fixed 10-step sequence: schema creation, `load --reset`, CFR ingest, SSA ingest, ref extraction, amendment detection, embedding, concept seeding, concept linking, and stats.
- `--yes` bypasses destructive reset confirmation; non-interactive shells otherwise refuse to proceed.
- `voyage_4_embedding_migration_on_railway_production.md` documents a non-destructive Railway production migration to `voyage-4`, using a temporary TCP proxy, in-place null/re-embed, verification, and cleanup.
- `source_selection_metadata_for_fee_schedules.md` documents `SourceSelectionMetadata` and backlog grouping logic for fee schedules, including normalization, date extraction, variant grouping, and bucket assignment.

Shared pattern:
- Neo4j search and refresh are treated as structured, multi-signal operations with strict Railway connectivity and proxy prerequisites.
- Destructive rebuilds are separated from non-destructive production migrations.

### Neo4j write/read consistency and schema-aware validation
Several synthesis entries describe a common guardrail across graph writes, retrieval, and evaluation:

- `neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md`
- `schema-aware-validation-is-the-common-safety-net-across-graph-writes-retrieval-a.md`
- `schema-aware-validation-is-the-common-safety-net-from-graph-writes-to-evaluation.md`
- `schema-aware-validation-is-the-guardrail-from-graph-writes-to-qa.md`
- `schema-aware-validation-is-the-shared-guardrail-for-graph-data-and-evaluation.md`
- `schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md`

Recurring themes:
- Normalize numeric or uncertain graph output before validation.
- Filter null rows after `OPTIONAL MATCH`.
- Validate payloads against Zod-compatible schemas.
- Use guarded Cypher execution and relationship whitelisting.
- Treat structural correctness as a prerequisite for search, scoring, navigation, and QA verification.

### Neo4j write boundary and incremental cleanup
See `neo4j_write_read_consistency/_index.md` for the write-side boundary architecture.

- `connection.py` owns session acquisition and driver lifecycle.
- `corpus_writer.py` owns all graph mutations through `CorpusGraphWriter`.
- `get_session()` is the single Neo4j access choke point.
- Public write methods use managed transactions via `session.execute_write(...)`.
- Cleanup is incremental and doc-scoped:
  - merge document
  - write sections
  - delete stale sections
  - clear changed embeddings/chunks
  - merge relationships
- Unchanged sections retain embeddings and chunks; only changed sections are invalidated.
- Relationship handling is specialized for references, amendments, supersessions, and concept links.
- Crawl run #19 shows the operational impact: targeted ingest into Railway prod, corpus growth, no missing embeddings, and verified retrieval quality.

## Cross-cutting architectural decisions
- Use Railway TCP proxy as the central mechanism for remote Neo4j access.
- Prefer incremental update over destructive rebuild when operating on production data.
- Keep graph writes idempotent and retry-safe through managed transactions and MERGE-based cleanup.
- Treat validation, normalization, and filtering as first-class safeguards across write, read, and QA paths.
- Preserve retrieval correctness through explicit indexing, deduplication, and rank fusion.

## Drill-down map
- `neo4j_auth/_index.md` — Railway auth behavior and production refresh
- `neo4j_hybrid_search/_index.md` — hybrid retrieval, refresh workflows, embedding migration, fee-schedule metadata
- `neo4j_write_read_consistency/_index.md` — writer boundaries, incremental cleanup, managed transactions
- Synthesis entries on schema-aware validation — shared safety-net pattern across graph, retrieval, and evaluation layers