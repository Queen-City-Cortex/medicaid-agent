---
children_hash: 6ea577b58eb6356ca4ad4cd3f612eb99a0fed9e92006079733c897dab8e6c52e
compression_ratio: 0.3486333161423414
condensation_order: 2
covers: [context.md, neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md, neo4j_auth/_index.md, neo4j_hybrid_search/_index.md, schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md]
covers_token_total: 1939
summary_level: d2
token_count: 676
type: summary
---
# database_operations

Operational knowledge for database deployments, authentication incidents, and Neo4j reliability patterns. The domain centers on precise fixes for environment-specific failures and on schema-aware safeguards that keep graph reads, writes, search, and evaluation consistent. See **neo4j_auth/_index.md** for Railway auth remediation, **neo4j_hybrid_search/_index.md** for hybrid retrieval architecture, and the synthesis entries for cross-layer validation patterns.

## Core themes

- **Database auth and deployment quirks**
  - Focuses on environment-driven failures and password lifecycle behavior in deployed Neo4j instances.
  - Emphasizes that rotation and remediation must account for existing volumes and platform behavior.

- **Schema-aware Neo4j safety**
  - Neo4j data is normalized and filtered before validation, search, or scoring.
  - Protects downstream consumers from malformed rows, null relationships, and inconsistent payloads.

## Key structural patterns

- **Railway environment decoding affects credentials**
  - URL-decoded env vars can mutate passwords before Neo4j receives them.
  - `NEO4J_AUTH` only initializes credentials on first volume setup; it does not update existing databases.
  - Existing instances require live password changes through the bolt proxy using `ALTER CURRENT USER SET PASSWORD`.

- **Hybrid search uses indexed, multi-signal ranking**
  - Retrieval combines vector, chunk, concept, and keyword signals.
  - Search depends on `section_embeddings`, `chunk_embeddings`, and `section_fulltext` indexes.
  - Results are deduplicated by `section_id` and fused with Reciprocal Rank Fusion, using `RRF_K = 60`.

- **Validation is the shared safety net across layers**
  - Numeric normalization occurs before Zod validation.
  - `OPTIONAL MATCH` results are filtered to remove null rows before schema checks.
  - Guarded Cypher execution and relationship whitelisting protect graph access.
  - QA and evaluation rely on validated graph outputs and relationship checks such as `REFERENCES_DOCUMENT`, `AMENDS`, `HAS_SECTION`, and `REFERENCES`.

## Drill-down map

- **neo4j_auth/_index.md** — Railway auth decoding, password rotation, and bolt-proxy remediation.
- **neo4j_hybrid_search/_index.md** — Neo4j hybrid search indexing, signal fusion, and schema dependencies.
- **neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md** — Cross-layer consistency pattern spanning database operations, architecture, and QA.
- **schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md** — Shared validation model linking Neo4j normalization, tool-output validation, and evaluation safeguards.