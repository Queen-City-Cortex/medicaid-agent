# Topic: neo4j_write_read_consistency

## Overview
Covers the Neo4j connection/session boundary and the corpus writer that owns all graph mutation behavior in the pipeline.

## Key Concepts
- module-singleton driver lifecycle
- context-managed sessions
- managed write transactions
- idempotent MERGE-based cleanup
- document status batching
- reference, amendment, supersession, and concept-link writes
