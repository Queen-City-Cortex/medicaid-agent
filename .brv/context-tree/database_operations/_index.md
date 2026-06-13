---
children_hash: a2909dc46c0b25dfc7e1d0abf042273d5c4dd14370bc07ecdc17e9553c8d9481
compression_ratio: 0.2733990147783251
condensation_order: 2
covers: [context.md, neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md, neo4j_auth/_index.md, neo4j_hybrid_search/_index.md, neo4j_write_read_consistency/_index.md, schema-aware-validation-is-the-shared-guardrail-for-graph-data-and-evaluation.md, schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md]
covers_token_total: 3654
summary_level: d2
token_count: 999
type: summary
---
# database_operations

## Domain focus
Captures operational knowledge for database deployments, authentication incidents, and graph-data reliability issues affecting the platform. The domain centers on precise fixes for environment-specific database behavior, password rotation/configuration, and safe handling of Neo4j write/read paths.

## Major themes

### Neo4j authentication and production refresh
See **`neo4j_auth/_index.md`** for the Railway-specific auth and federal refresh cluster.
- Railway URL-decodes environment variables, so `+` can become a space and corrupt Neo4j passwords.
- `NEO4J_AUTH` only sets the password on first volume initialization; it does not update an existing database.
- The safe remediation path is to rotate to an alphanumeric-only password and apply it with `ALTER CURRENT USER SET PASSWORD` through the bolt TCP proxy.
- Production refreshes must avoid destructive reloads; the safe path is a targeted ingest pipeline using Railway TCP proxy, `NEO4J_URI`, and `NEO4J_PASSWORD`.
- This cluster emphasizes incremental updates over rebuilds so unchanged data, supersession edges, and embeddings are preserved.

### Neo4j hybrid search and deployment workflow
See **`neo4j_hybrid_search/_index.md`** for search and reload mechanics.
- Hybrid retrieval blends vector, chunk, concept-graph, and fulltext signals.
- Ranking uses **Reciprocal Rank Fusion** with **`RRF_K = 60`**.
- Concept matching depends on `query_text` and uses a fixed score of `0.70`, limited to `min(top_k, 5)` sections.
- Search results are deduplicated by `section_id` before fusion.
- The indexing layer includes `section_fulltext` over `Section.title` and `Section.content_text`.
- The deployment workflow in `scripts/deploy-data.sh` is deliberately destructive at `load --reset`, so it requires confirmation, Railway CLI login, `NEO4J_HOST`, Railway auth variables, and a TCP proxy.

### Corpus graph write/read consistency
See **`neo4j_write_read_consistency/_index.md`** for the incremental write boundary.
- `CorpusGraphWriter` is the single write-side boundary for corpus graph mutations.
- Core sequence: merge document → write sections → delete stale sections → clear changed embeddings → merge relationships.
- Cleanup is surgical: stale sections are removed, but embeddings and chunks are cleared only for changed content.
- Unchanged sections retain embeddings and chunks across reruns.
- Relationship handling is split across reference edges, amendments, supersessions, and concept links, including `REFERENCES`, `REFERENCES_DOCUMENT`, `AMENDS`, `COVERS`, `DEFINES`, and `RESTRICTS`.

## Cross-cutting safety pattern
See the synthesis entries **`neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md`**, **`schema-aware-validation-is-the-shared-guardrail-for-graph-data-and-evaluation.md`**, and **`schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md`**.
- The shared rule across database, retrieval, and evaluation layers is schema-aware validation at every boundary.
- Numeric normalization and null-row filtering happen before Zod validation or downstream graph use.
- `OPTIONAL MATCH` outputs are filtered to prevent malformed rows from breaking search, navigation, or scoring.
- Guarded Cypher execution and whitelisted relationships protect evaluation and evidence retrieval.
- The broader pattern is that graph data must be normalized and validated before it can safely drive retrieval, scoring, or cross-reference checks.

## Drill-down map
- **`context.md`** — domain purpose, scope, and ownership
- **`neo4j_auth/_index.md`** — Railway auth behavior and safe production refresh path
- **`neo4j_hybrid_search/_index.md`** — hybrid search design, indexing, and remote deployment workflow
- **`neo4j_write_read_consistency/_index.md`** — incremental write cleanup and graph mutation boundaries
- **schema-aware-validation synthesis entries** — shared validation guardrails across graph and evaluation layers