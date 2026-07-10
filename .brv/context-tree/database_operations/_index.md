---
children_hash: 0268d76b534b0d7bcbe81d40154acbaae625fed811a355401c20cac5c5492a4d
compression_ratio: 0.2581766675251094
condensation_order: 2
covers: [context.md, neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md, neo4j_auth/_index.md, neo4j_hybrid_search/_index.md, neo4j_write_read_consistency/_index.md, schema-aware-validation-is-the-common-safety-net-across-graph-writes-retrieval-a.md, schema-aware-validation-is-the-common-safety-net-from-graph-writes-to-evaluation.md, schema-aware-validation-is-the-guardrail-from-graph-writes-to-qa.md, schema-aware-validation-is-the-shared-guardrail-for-graph-data-and-evaluation.md, schema-aware-validation-is-the-shared-guardrail-from-graph-writes-to-evaluation.md, schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md, schema-aware-validation-is-the-shared-safety-net-from-graph-writes-to-evaluation.md]
covers_token_total: 7766
summary_level: d2
token_count: 2005
type: summary
---
# database_operations

## Domain overview
This domain captures operational knowledge about database deployments and authentication incidents, with a strong focus on Neo4j. The recurring theme across the child entries is **schema-aware validation and environment-sensitive handling**: database outputs are normalized and filtered before validation, Railway-specific auth behavior can break credentials, and production refreshes must preserve data rather than rebuild destructively.

## Core structural themes

### 1) Neo4j safety depends on schema-aware validation
The synthesis entries show a consistent guardrail across writes, reads, retrieval, and QA:
- normalize values before Zod/schema validation
- filter null or malformed rows after `OPTIONAL MATCH`
- validate graph outputs before search, scoring, or verification
- treat structural correctness as a prerequisite, not cleanup

This theme is summarized most directly in:
- `neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md`
- `schema-aware-validation-is-the-common-safety-net-across-graph-writes-retrieval-a.md`
- `schema-aware-validation-is-the-common-safety-net-from-graph-writes-to-evaluation.md`
- `schema-aware-validation-is-the-guardrail-from-graph-writes-to-qa.md`
- `schema-aware-validation-is-the-shared-guardrail-for-graph-data-and-evaluation.md`
- `schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md`

Drill down there for the specific validation patterns: numeric normalization, null-row filtering, guarded Cypher execution, and evidence-scored evaluation.

### 2) Neo4j auth on Railway is environment-sensitive
The `neo4j_auth` cluster documents Railway-specific behavior that affects Neo4j authentication:
- Railway URL-decodes environment variables, so `+` can become a space and corrupt passwords
- `NEO4J_AUTH` only sets the password on first volume initialization
- fixing auth often requires rotating to an alphanumeric-only password
- password changes are applied through the bolt TCP proxy using `ALTER CURRENT USER SET PASSWORD`

Relevant child entries:
- `neo4j_auth/_index.md`
- `railway_neo4j_auth_handling.md`
- `production_neo4j_federal_data_refresh.md`

Shared relationship: the **Railway TCP proxy** is central to both auth remediation and production refresh workflows.

### 3) Production refresh must be targeted, not destructive
The production refresh entry emphasizes that the safe path is incremental and scoped:
- do **not** use `deploy-data.sh load --reset` for production refresh
- enable Railway TCP proxy
- set `NEO4J_URI` and `NEO4J_PASSWORD`
- ingest SSA/CFR
- extract references
- embed incrementally
- disable the proxy afterward

Key facts preserved in `neo4j_auth/_index.md`:
- production refresh is aimed at the federal slice only
- unchanged sections retain embeddings
- clinical corpus remains untouched
- production scale noted: **48,720 sections** and **1,877 docs**

### 4) Hybrid search is built from multiple ranked signals
The `neo4j_hybrid_search` cluster covers the retrieval stack around Neo4j and policy-corpus search. The pattern is:
- vector embeddings for sections and chunks
- concept matching
- optional fulltext search
- reciprocal rank fusion
- deduplication before fusion
- reranking and coverage/latest-change signals in finalization

Key child entries:
- `neo4j_hybrid_search/_index.md`
- `neo4j_hybrid_search_indexing.md`
- `hybrid_retrieval_collection_and_finalization.md`
- `deploy_data_script_and_refresh_workflow.md`
- `deploy_data_script_and_refresh_workflow.overview.md`
- `voyage_4_embedding_migration_on_railway_production.md`
- `source_selection_metadata_for_fee_schedules.md`
- `waiver_range_decision_for_subpart_g_and_h.md`

Important architecture facts:
- `RRF_K = 60`
- `section_fulltext` covers `Section.title` and `Section.content_text`
- concept/fulltext branches only run when `query_text` exists
- chunk searches mirror section searches per document-type group
- fulltext can recover exact phrases and insert fulltext-only sections when needed

### 5) Deployment and embedding updates support the retrieval pipeline
Two different operational patterns appear:
- **destructive remote refresh** in `deploy_data_script_and_refresh_workflow.md`
- **non-destructive in-place migration** in `voyage_4_embedding_migration_on_railway_production.md`

The migration entry adds these operational facts:
- embeddings migrated to `voyage-4`
- temporary Neo4j TCP proxy was created and deleted through GraphQL mutations
- graph was re-embedded in place
- agent deployment was triggered by pushing commit `b739229` to `main`
- `/healthz` and live retrieval were verified afterward
- rollback remains possible by re-nullifying embeddings and re-embedding with `voyage-law-2`

### 6) Source selection and waiver classification affect retrieval correctness
Two policy-corpus decision layers are documented:
- `source_selection_metadata_for_fee_schedules.md`
- `waiver_range_decision_for_subpart_g_and_h.md`

Their shared role is to shape what retrieval considers authoritative:
- fee schedule entries are grouped by normalized variant group and variant date
- entries are bucketed as primary, history, archive, companion, or reference
- retrieval-ready items are only non-reference entries in primary/history buckets
- the source-selection module is intentionally config-independent
- Subpart G / Subpart H split is intentional, not a bug
- Subpart G covers **1915(c)**, Subpart H covers **1915(d)**
- q-045 should anchor broadly across both, but only Subpart G plus `440.180` should be promoted to primary
- Subpart H remains supporting evidence to avoid displacing required `1915(c)` citation

## Write-path architecture
The `neo4j_write_read_consistency` cluster documents the write boundary for the corpus graph pipeline:
- `connection.py` owns session acquisition and driver lifecycle
- `corpus_writer.py` owns graph mutations via `CorpusGraphWriter`
- `get_session()` is the single access choke point
- public writes use `session.execute_write(...)`
- cleanup is doc-scoped and idempotent
- unchanged sections keep embeddings/chunks; only changed sections are invalidated

Key child entries:
- `neo4j_write_read_consistency/_index.md`
- `neo4j_session_and_corpus_writer_boundary.md`
- `corpus_graph_writer_incremental_cleanup.md`
- `corpusgraphwriter_write_boundary.md`
- `incremental_crawl_ingest_run_19.md`

Operational consequences captured there:
- managed transactions provide retry/rollback behavior
- section writes are batched with `GRAPH_BATCH_SIZE`
- separate merge paths exist for references, amendments, supersessions, and concept links
- crawl run #19 ingested **34 targeted docs** into Railway prod using voyage-4
- production corpus grew from **6693 to 6725 docs**
- **1533 sections** were added with no missing embeddings
- retrieval verified successfully for MA-3234 Expanded Foster Care at **0.86 cosine**
- incremental candidates should be selected carefully to avoid fee_schedule byte churn

## Cross-domain relationship map
- `database_operations/context.md` defines the domain boundary and ownership under Platform Infrastructure Team.
- `neo4j_auth/_index.md` connects auth behavior to production refresh procedures.
- `neo4j_hybrid_search/_index.md` links indexing, retrieval fusion, deployment, and policy-corpus decisioning.
- `neo4j_write_read_consistency/_index.md` explains the mutation boundary that keeps graph writes safe and repeatable.
- The repeated schema-validation syntheses show that **the same correctness discipline applies across graph writes, retrieval, and evaluation**.

## Drill-down guide
- **Domain scope and intent** → `context.md`
- **Railway auth and production refresh** → `neo4j_auth/_index.md`
- **Hybrid search, indexing, and retrieval fusion** → `neo4j_hybrid_search/_index.md`
- **Write boundary and incremental cleanup** → `neo4j_write_read_consistency/_index.md`
- **Schema-aware validation patterns** → the synthesis entries ending in `schema-aware-validation-*`