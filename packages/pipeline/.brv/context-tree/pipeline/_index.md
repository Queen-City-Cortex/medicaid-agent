---
children_hash: aa11d1c95f197fdd667c71d4f0384941a8715d3dbad8bed45cfbe96696361397
compression_ratio: 0.733934611048478
condensation_order: 2
covers: [cli_commands/_index.md, context.md]
covers_token_total: 887
summary_level: d2
token_count: 651
type: summary
---
# Structural Summary: pipeline Domain (Level d2)

## Overview (context.md)
- **Purpose**: Capture NC Medicaid document pipeline CLI operations and command behaviors defined in `src/pipeline/cli.py`.
- **Scope**: Includes CLI entrypoint, stats reporting, ingestion/embedding/reference/evaluation commands, and embedding coverage computation; excludes standalone data models or Neo4j schema docs.
- **Ownership/Usage**: Managed by the NC Medicaid Pipeline engineering team for runbooks and tooling guidance.

## CLI Command Structure (cli_commands/_index.md)
- **Entry point**: `pipeline/cli_commands/context.md` catalogs the Click-based command roster for parsing, loading, schema enforcement, reference resolution, embeddings, concept seeding/linking, amendments, ingestion helpers, and evaluation utilities; embeddings and parsers link to related domains `pipeline/data_ingest` and `pipeline/embeddings`.
- **Eval & Utility commands**: Eval management (run/compare/list/validate) plus inspect/search/run-all helpers provide downstream tooling and orchestrated pipeline execution.

## NC Medicaid Pipeline CLI Details (cli_commands/nc_medicaid_pipeline_cli.md)
- **Task & Flow**: Documents per-command behaviors and revised stats reporting; flow moves from CLI through parse/load/schema/coverage helpers into reference resolution, embeddings, concept linking, inspections/searches, evals, concluding with a run-all orchestrator.
- **Structure**: Commands cover data conversion, Neo4j graph loading/schema application, cross-reference resolution, embedding generation/indexing, amendment detection, stats coverage reporting, CFR/SSA ingestion, inspection/search utilities, evaluations, and a run-all pipeline sequence.
- **Dependencies**: Calls converters, graph loaders, schema/query modules, reference resolver/amendments, embedding generators/indexers, concept seeders/linkers, Voyager client, and Neo4j Cypher sessions.
- **Highlights**: `stats` now reports sections with content, embedded sections, chunk coverage, total coverage percentage, structural empty headings, and chunk-level embedding counts; `run-all` sequences each major stage (parse → load → federal ingestion → reference resolution → amendments → embeddings → concepts) with completion messaging.
- **Facts**:
  - `embedding_coverage_query` counts Section nodes by embedding status via Cypher.
  - `coverage_breakdown` surfaces sections_with_content, embedded counts, chunk coverage, total coverage %, structural empties, and chunk nodes with embeddings.
  - `chunk_embedding_query` reports chunk nodes that already store embeddings.