---
children_hash: 41448782eff737a317041092434e64b6e315f4f61e260182db3f0214aff08c4f
compression_ratio: 0.9163179916317992
condensation_order: 3
covers: [pipeline/_index.md]
covers_token_total: 717
summary_level: d3
token_count: 657
type: summary
---
# Structural Summary (Level d3)

## Domain: pipeline
- **Purpose & Ownership**: Captures NC Medicaid document pipeline CLI operations and tooling guidance, governed by the NC Medicaid Pipeline engineering team (see `pipeline/context.md` for scope and usage).
- **Scope**: Covers CLI entrypoint through ingestion, embedding, reference resolution, evaluation, and stats coverage; excludes standalone data models or Neo4j schema docs (details in `pipeline/context.md`).

## Topic: cli_commands
- **Command Roster** (`pipeline/cli_commands/context.md`): Click-based commands span parsing, loading, schema enforcement, reference resolution, embedding generation/indexing, concept seeding/linking, amendment handling, ingestion helpers, evaluation utilities, and diagnostics (inspect/search/run-all). Embedding and parser commands point to related domains `pipeline/data_ingest` and `pipeline/embeddings`.
- **Eval & Utilities** (`pipeline/cli_commands/context.md`): Evaluation lifecycle commands include run/compare/list/validate plus inspect/search/run-all helpers, anchoring downstream tooling orchestration.

## Topic: nc_medicaid_pipeline_cli
- **Task & Flow** (`pipeline/cli_commands/nc_medicaid_pipeline_cli.md`): Command flow progresses from CLI invocation through parse/load/schema/coverage helpers, reference resolution, embeddings, concept linking, inspections/searches, evaluations, and culminates in the run-all orchestrator.
- **Structure & Dependencies** (`pipeline/cli_commands/nc_medicaid_pipeline_cli.md`): Commands manage data conversion, Neo4j graph loading/schema application, cross-reference resolution, embedding lifecycle, amendment detection, stats coverage reporting, CFR/SSA ingestion, inspections/searches, evaluations, and run-all sequence. Dependencies include converter modules, graph loaders, schema/query modules, reference resolver/amendments, embedding generators/indexers, concept seeders/linkers, Voyager client, and Neo4j Cypher sessions.
- **Highlights & Facts** (`pipeline/cli_commands/nc_medicaid_pipeline_cli.md`):
  - `stats` now reports sections with content, embedded sections, chunk coverage, total coverage percentage, structural empty headings, and chunk-level embedding counts.
  - `run-all` triggers each major stage (parse → load → federal ingestion → reference resolution → amendments → embeddings → concepts) and emits completion messaging.
  - Key Cypher queries: `embedding_coverage_query` counts Section nodes by embedding status, `coverage_breakdown` surfaces coverage metrics and structural empties, `chunk_embedding_query` enumerates chunk nodes already storing embeddings.