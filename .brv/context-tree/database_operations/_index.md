---
children_hash: db678ae26e9824ef3ac083a7465d1837548fc71fc0e6d5bf3f0597110fe8efad
compression_ratio: 0.35104546326491465
condensation_order: 2
covers: [context.md, neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md, neo4j_auth/_index.md, neo4j_hybrid_search/_index.md, neo4j_write_read_consistency/_index.md, schema-aware-validation-is-the-shared-guardrail-for-graph-data-and-evaluation.md, schema-aware-validation-is-the-shared-guardrail-from-graph-writes-to-evaluation.md, schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md, schema-aware-validation-is-the-shared-safety-net-from-graph-writes-to-evaluation.md]
covers_token_total: 5213
summary_level: d2
token_count: 1830
type: summary
---
## database_operations — structural overview

This domain captures operational knowledge for Neo4j deployments, auth incidents, and graph-consistency safeguards. The central pattern across the entries is **incremental, schema-aware, environment-sensitive handling**: avoid destructive refreshes when possible, validate graph output before downstream use, and treat Railway/production behavior as a first-class constraint.

### Domain framing
- **Purpose:** document precise fixes for database environment issues and future debugging guidance.
- **Scope:** database connection/authentication issues, deployment quirks, password rotation, configuration guidance.
- **Ownership:** Platform Infrastructure Team.

## Core clusters

### `neo4j_auth/` — Railway auth and production refresh
Focuses on Railway-specific Neo4j authentication behavior and the safe production refresh path for federal data.

- **`railway_neo4j_auth_handling.md`**
  - Railway URL-decodes environment variables, so `+` can become a space and corrupt Neo4j passwords.
  - The fix is to rotate to an alphanumeric-only password and apply it with `ALTER CURRENT USER SET PASSWORD` through the bolt TCP proxy.
  - `NEO4J_AUTH` only sets the password on first volume initialization; it does not update existing databases.

- **`production_neo4j_federal_data_refresh.md`**
  - The production refresh must **not** use `deploy-data.sh load --reset`; that path is destructive.
  - Safe flow: enable Railway TCP proxy → set `NEO4J_URI` and `NEO4J_PASSWORD` → ingest SSA/CFR → extract references → embed incrementally → disable proxy.
  - The refresh is targeted to the federal slice; unchanged sections retain embeddings and the clinical corpus is left untouched.
  - Verified scale: **48,720 sections** and **1,877 docs**.

- **Shared relationship**
  - The **Railway TCP proxy** is central to both auth remediation and production refresh.
  - Credential handling is environment-sensitive; password encoding and initialization semantics matter.
  - The preferred maintenance model is **incremental update over rebuild**.

### `neo4j_hybrid_search/` — retrieval indexing, fusion, and deployment workflows
Documents the Neo4j retrieval layer used by the pipeline, plus production migration and refresh workflows.

- **`neo4j_hybrid_search_indexing.md`**
  - Hybrid retrieval merges:
    - section embeddings
    - chunk embeddings
    - concept graph matches
    - fulltext keyword hits
  - Fusion uses **Reciprocal Rank Fusion** with `RRF_K = 60`.
  - Search is performed per document-type group, then deduplicated by `section_id` before fusion.
  - `section_fulltext` indexes `Section.title` and `Section.content_text`.
  - Concept matching is gated by `query_text`, uses `CONCEPT_MATCH_SCORE = 0.70`, and caps results at `min(top_k, 5)`.

- **`deploy_data_script_and_refresh_workflow.md` / `.overview.md` / `.abstract.md`**
  - Describes `scripts/deploy-data.sh` as a **destructive reload pipeline** requiring explicit operator confirmation and Railway connectivity.
  - Workflow:
    - validate `NEO4J_HOST`
    - read `NEO4J_AUTH`
    - confirm wipe
    - create schema
    - `load --reset`
    - ingest CFR
    - ingest SSA
    - extract references
    - detect amendments
    - embed
    - seed concepts
    - link concepts
    - emit final stats
  - The irreversible step is `load --reset`, which drops all nodes and relationships.

- **`voyage_4_embedding_migration_on_railway_production.md`**
  - Records a **non-destructive** production re-embedding to `voyage-4`, distinct from the wipe-and-rebuild refresh.
  - Sequence:
    - authenticate Railway CLI
    - create temporary Neo4j TCP proxy via GraphQL mutations
    - null existing embeddings and re-embed in place
    - push commit `b739229`
    - trigger deployment
    - verify `/healthz` and live vector retrieval
    - delete the temporary proxy
  - Production defaults to `voyage-4` because `VOYAGE_MODEL` is not overridden.
  - `AGENT_MODEL=gpt-5.4` is pinned in Railway.
  - Rollback is possible by nulling embeddings again and re-embedding with `voyage-law-2`.
  - Resource identifiers are captured for Railway project, environment, Neo4j, agent, and web services.

### `neo4j_write_read_consistency/` — incremental write boundary and ingest cleanup
Describes two closely related pipeline behaviors: surgical cleanup during corpus writes and incremental ingest for crawl run #19.

- **`corpus_graph_writer_incremental_cleanup.md` / `.overview.md` / `.abstract.md`**
  - `CorpusGraphWriter` is the single write-side boundary for Neo4j corpus graph mutations.
  - It centralizes:
    - document bundle upserts
    - section writes
    - relationship merges
    - status updates
  - Write flow:
    - merge document
    - write sections
    - delete stale sections
    - clear embeddings for changed sections only
    - merge relationships
  - Cleanup is surgical, not full rebuild:
    - stale sections are removed
    - unchanged sections keep embeddings and chunks
    - only changed sections are invalidated for re-embedding
  - Relationship handling is split into distinct merge paths:
    - references / `REFERENCES_DOCUMENT`
    - amendments
    - supersessions
    - concept links such as `COVERS`, `DEFINES`, `RESTRICTS`

- **`incremental_crawl_ingest_run_19.md`**
  - Documents an ingest run into Railway prod `voyage-4`.
  - Ingested **34 targeted docs** rather than reprocessing the full crawl output.
  - Corpus growth:
    - doc count **6693 → 6725**
    - **1533 sections** added
    - no missing embeddings
  - Retrieval verification succeeded for **MA-3234 Expanded Foster Care** at **0.86 cosine**.
  - Main lesson: naive full parsing can reprocess ~**1850 fee schedule PDFs** due to byte churn, so targeted selection is required.
  - Selection filters include `status='downloaded'`, `last_changed_at>=run_start`, `first_seen_at>=run_start`, with special handling for `source_type!=fee_schedule`.
  - `load_document(parsed_json_path, source_type)` is the surgical prod load path over the TCP proxy.

## Cross-cutting structural themes

### Schema-aware validation as a shared guardrail
Multiple synthesized entries reinforce the same pattern across database, retrieval, evaluation, and QA layers:

- Normalize and filter graph output before validation.
- Handle `OPTIONAL MATCH` null rows explicitly.
- Validate Zod-compatible payloads before search, scoring, or navigation.
- Guard Cypher execution and relationship access to prevent malformed graph data from propagating.

### Incremental mutation over rebuild
Across auth, refresh, ingest, and embedding migration, the preferred operational style is:
- preserve unchanged data and embeddings,
- mutate only the affected slice,
- avoid destructive reloads unless explicitly intended.

### Railway and production environment sensitivity
Several entries emphasize that Railway behavior affects:
- environment variable decoding,
- password handling,
- TCP proxy requirements,
- deployment verification,
- and the safety of graph refresh operations.

## Drill-down map
- **Neo4j auth / prod refresh:** `neo4j_auth/`
- **Hybrid retrieval and deployment workflows:** `neo4j_hybrid_search/`
- **Write/read consistency and incremental ingest:** `neo4j_write_read_consistency/`
- **Domain-level operating context:** `context.md`