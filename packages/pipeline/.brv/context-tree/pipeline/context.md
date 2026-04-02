# Domain: pipeline

## Purpose
Capture knowledge about the NC Medicaid document pipeline codebase and its operational CLI surface.

## Scope
Included in this domain:
- CLI entrypoint definition and command roster in src/pipeline/cli.py
- Stats reporting, ingestion, embedding, reference, and evaluation commands
- How coverage is computed and reported for sections, chunks, and embeddings

Excluded from this domain:
- Independent data models or Neo4j schema definitions (belongs elsewhere)
- Non-CLI helper modules unless referenced by commands

## Ownership
NC Medicaid Pipeline engineering team

## Usage
Use this domain for operational runbooks and command behavior for the pipeline CLI and related tooling.
