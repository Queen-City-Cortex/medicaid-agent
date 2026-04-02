---
children_hash: 4ed9df933e767524bee579bf8c81089e09f9ac8edbec5fd511f96a02e2dffee4
compression_ratio: 0.6855614973262032
condensation_order: 1
covers: [context.md, nc_medicaid_pipeline_cli.md]
covers_token_total: 935
summary_level: d1
token_count: 641
type: summary
---
# Structural Summary: pipeline/cli_commands

- **Overview (context.md)**  
  - Central CLI entrypoint for the NC Medicaid pipeline with grouped commands for parsing, loading, schema enforcement, reference resolution, embedding generation, concept seeding/linking, amendment detection, and ingestion helpers.  
  - Embedding coverage metrics computed via Neo4j Cypher queries differentiate sections with content, directly embedded sections, chunk-covered sections, and structural empties, feeding the updated stats breakdown.  
  - Eval management commands (run, compare, list, validate) plus inspect/search/run-all helpers outline downstream utilities.  
  - Related domains: `pipeline/data_ingest` (parsers/graph loaders) and `pipeline/embeddings` (generator/indexer details).

- **NC Medicaid Pipeline CLI Details (nc_medicaid_pipeline_cli.md)**  
  - Task: Document CLI entrypoint, per-command behavior, and revised stats command reporting embedding coverage (source: `src/pipeline/cli.py`).  
  - Flow: CLI → parse/load/schema/coverage helpers → reference resolution + embedding/concept commands → inspect/search/eval utilities → run-all orchestrator covering entire pipeline.  
  - Structure: Click-based commands cover data conversion, Neo4j graph loading/schema, cross-reference resolution, embedding generation/concept linking, amendment detection, stats coverage, CFR/SSA ingestion, inspection/search utilities, evaluation commands, and orchestrated run-all sequence.  
  - Dependencies: Imports include converter, graph loader, schema/query modules, references resolver/amendments, embeddings generator/indexer, concept seeding/linking, plus the Voyager client and Neo4j Cypher sessions for metrics.  
  - Highlights:  
    - Stats command now reports sections with content, directly embedded sections, chunk-covered sections, total covered percentage, structural empty headings, and chunk embedding counts to clarify coverage; chunk count query verifies embeddings stored on chunk nodes.  
    - Run-all command sequences parse → load → federal ingestion → reference resolution → amendments → embeddings → concepts to signal full pipeline completion messaging.  
  - Facts (direct references):  
    - `embedding_coverage_query` counts Section nodes by embedding status via Cypher.  
    - `coverage_breakdown` reports sections_with_content, embedded counts, chunk coverage, total coverage %, structural empties, and chunk nodes with embeddings.  
    - `chunk_embedding_query` tallies chunk nodes already storing embeddings for chunk coverage reporting.