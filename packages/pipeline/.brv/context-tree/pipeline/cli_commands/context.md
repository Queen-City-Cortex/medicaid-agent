# Topic: cli_commands

## Overview
Describes the CLI entrypoint for the NC Medicaid pipeline, each command exposed by click, and the updated stats coverage breakdown that distinguishes content-bearing sections, empty headings, direct embeddings, and chunk coverage.

## Key Concepts
- Commands for parse, load, schema, reference resolution, embedding generation, concept seeding/linking, amendment detection, and ingestion helpers
- Embedding coverage calculation using Neo4j Cypher queries for direct embeddings, chunk coverage, and structural empties
- Eval management commands (run, compare, list, validate) and helper commands such as inspect, search, and run-all

## Related Topics
- pipeline/data_ingest - upstream parsers/graph loaders
- pipeline/embeddings - embedding generator and indexer details
