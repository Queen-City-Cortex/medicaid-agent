---
title: Production Neo4j Federal Data Refresh
summary: Production Neo4j refresh must avoid load --reset; use targeted federal-slice updates through the Railway TCP proxy and incremental embedding.
tags: []
related: []
keywords: []
createdAt: '2026-06-13T03:20:47.892Z'
updatedAt: '2026-06-13T03:20:47.892Z'
---
## Reason
Document the safe production refresh procedure and destructive load warning

## Raw Concept
**Task:**
Document the verified production Neo4j federal data refresh process and its safety constraints

**Changes:**
- Replaced destructive full rebuild guidance with targeted non-destructive federal-slice update guidance
- Captured Railway TCP proxy setup and teardown requirements
- Captured incremental embedding behavior and cleanup semantics

**Files:**
- scripts/deploy-data.sh
- packages/pipeline/src/pipeline/graph/corpus_writer.py

**Flow:**
enable Railway TCP proxy -> set NEO4J_URI and NEO4J_PASSWORD -> ingest SSA and CFR -> extract references -> embed incrementally -> disable proxy

**Timestamp:** 2026-06-13T03:20:13.123Z

## Narrative
### Structure
The deployment script is destructive by design, but the production workflow now requires a non-destructive targeted refresh over the Railway TCP proxy. The corpus writer cleans stale document sections and clears embeddings only for changed sections, preserving unchanged data.

### Dependencies
Requires Railway CLI access, Neo4j TCP proxy enabled in Railway dashboard, and production credentials sourced from NEO4J_AUTH.

### Highlights
Verified production stats showed 48720 sections and 1877 docs. The refresh preserves supersession edges, EPSDT hits, and keeps the clinical corpus untouched.

### Rules
1. Do not use deploy-data.sh's destructive load --reset in production.
2. Enable the Railway Neo4j TCP Proxy manually before connecting.
3. Disable the TCP Proxy immediately after migration.
4. Use targeted federal-slice refresh steps instead of a full rebuild.
5. Embedding must remain incremental; unchanged sections keep embeddings.

### Examples
Example production update sequence: set NEO4J_URI=bolt://<proxy>, export NEO4J_PASSWORD from Railway, run ingest-ssa --refresh, ingest-cfr, extract-refs, embed, then disable the proxy.

## Facts
- **prod_refresh_mode**: Do not use deploy-data.sh load --reset for production refreshes because it is destructive. [project]
- **production_graph_size**: Production had 48720 sections and 1877 docs, which exceeded local parsed docs. [project]
- **neo4j_tcp_proxy_port**: The production refresh should go through the Railway Neo4j TCP proxy on port 7687. [environment]
- **neo4j_connection_setup**: Set NEO4J_URI to bolt://<proxy> and derive NEO4J_PASSWORD from Railway NEO4J_AUTH. [project]
- **refresh_steps**: Run ingest-ssa --refresh, ingest-cfr, extract-refs, and embed for the targeted update. [project]
- **incremental_embedding**: Embedding is incremental because only changed sections lose embeddings and chunks. [project]
- **clinical_corpus_scope**: Clinical corpus is untouched during the targeted federal-slice update. [project]
- **tcp_proxy_shutdown**: Always disable the TCP proxy after the migration completes. [environment]
