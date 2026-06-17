---
children_hash: 97b7bb37fde53acd796c53d24729d51e6ad5f1fdf3a14033390e3e9ed6e05c23
compression_ratio: 0.4638205499276411
condensation_order: 2
covers: [context.md, neo4j-write-read-consistency-is-protected-by-schema-aware-validation-at-every-la.md, neo4j_auth/_index.md, neo4j_hybrid_search/_index.md, neo4j_write_read_consistency/_index.md, schema-aware-validation-is-the-shared-guardrail-for-graph-data-and-evaluation.md, schema-aware-validation-is-the-shared-guardrail-from-graph-writes-to-evaluation.md, schema-aware-validation-is-the-shared-safety-net-for-graph-and-evaluation-layers.md, schema-aware-validation-is-the-shared-safety-net-from-graph-writes-to-evaluation.md]
covers_token_total: 5528
summary_level: d2
token_count: 2564
type: summary
---
# database_operations — Structural Summary

## Domain purpose
This domain captures operational knowledge about database deployments and authentication incidents affecting the platform. It focuses on database connection/authentication issues, environment-specific deployment quirks, and password rotation/configuration guidance, owned by the Platform Infrastructure Team.

## Main clusters

### 1) Neo4j authentication and production refresh
See `neo4j_auth/_index.md`

- Covers Railway-specific Neo4j authentication behavior and the safe production refresh path for federal data.
- Core theme: Railway environment handling can break Neo4j auth unless credentials are chosen/applied carefully, and production refreshes must be targeted rather than destructive.

#### Key points
- `railway_neo4j_auth_handling.md`
  - Railway URL-decodes environment variables, so `+` can become a space and corrupt Neo4j passwords.
  - Mitigation was to rotate to an alphanumeric-only password and apply it with `ALTER CURRENT USER SET PASSWORD` through the bolt TCP proxy.
  - `NEO4J_AUTH` only sets the password on first volume initialization; it does not update existing databases.

- `production_neo4j_federal_data_refresh.md`
  - Do **not** use `deploy-data.sh load --reset`; that path is destructive.
  - Safe flow: enable Railway TCP proxy → set `NEO4J_URI` and `NEO4J_PASSWORD` → ingest SSA/CFR → extract references → embed incrementally → disable proxy.
  - Refresh is targeted to the federal slice; unchanged sections retain embeddings and the clinical corpus is left untouched.
  - Verified production scale: 48,720 sections and 1,877 docs.

#### Shared relationship
- The Railway TCP proxy is central to both auth remediation and production refresh.
- Credential handling is environment-sensitive; password choice and initialization semantics matter.
- Incremental update is preferred over full rebuild to preserve existing data and embeddings.

---

### 2) Neo4j hybrid search
See `neo4j_hybrid_search/_index.md`

- Documents the retrieval layer used by the pipeline: vector/chunk embeddings, fulltext indexing, and hybrid relevance fusion across multiple signals.
- Core responsibilities center on `ensure_vector_index`, `ensure_schema`, and `vector_search`.

#### Key points
- Retrieval merges:
  - section embeddings
  - chunk embeddings
  - concept graph matches
  - fulltext keyword hits
- Fusion uses Reciprocal Rank Fusion with `RRF_K = 60`.
- Search is performed per document-type group, then deduplicated by `section_id` before fusion.
- `section_fulltext` indexes `Section.title` and `Section.content_text`.

#### Constraints and rules
- Deduplicate each source list by keeping the highest score per `section_id` before fusing.
- Concept matches only run when `query_text` is present.
- Concept matches use `CONCEPT_MATCH_SCORE = 0.70` and cap results at `min(top_k, 5)`.
- Fulltext and chunk queries honor per-group limits similar to section embeddings.

#### Related files
- `neo4j_hybrid_search_indexing.md` — indexing and fusion implementation details.
- `deploy_data_script_and_refresh_workflow.md` — destructive remote refresh pipeline.
- `voyage_4_embedding_migration_on_railway_production.md` — non-destructive production re-embedding and verification.

---

### 3) Deploy data script and refresh workflow
See `neo4j_hybrid_search/deploy_data_script_and_refresh_workflow.*`

- Documents `scripts/deploy-data.sh`, a destructive reload pipeline for remote Neo4j refreshes.
- This workflow is for remote graph refresh, not incremental updates.

#### Workflow outline
- Validate `NEO4J_HOST`
- Read `NEO4J_AUTH` from Railway variables
- Confirm destructive wipe
- Create schema
- Run `load --reset`
- Ingest CFR
- Ingest SSA
- Extract references
- Detect amendments
- Embed
- Seed concepts
- Link concepts
- Emit final stats

#### Operational constraints
- Missing `NEO4J_HOST` exits with usage instructions.
- Railway CLI login is required.
- Railway TCP proxy must be enabled before connection succeeds.
- Non-interactive shells refuse to wipe without confirmation.
- `--yes` bypasses the prompt.
- `load --reset` is the irreversible point: it drops all nodes and relationships.
- Disable the TCP proxy after migration completes.

---

### 4) Voyage-4 embedding migration on Railway production
See `neo4j_hybrid_search/voyage_4_embedding_migration_on_railway_production.md`

- Records a production Railway deployment that migrated remote Neo4j graph embeddings to `voyage-4` and verified the result end-to-end.
- This is a non-destructive re-embedding operation, distinct from the wipe-and-rebuild refresh workflow.

#### Deployment sequence
- Authenticate Railway CLI with an account API token
- Create a temporary Neo4j TCP proxy via GraphQL mutations
- Null existing embeddings and re-embed in place
- Push commit `b739229` to `main`
- Trigger agent deployment automatically
- Verify `/healthz` and live vector retrieval
- Delete the temporary proxy

#### Key facts
- Production defaults to `voyage-4` because `VOYAGE_MODEL` is not overridden.
- `AGENT_MODEL=gpt-5.4` is pinned in the Railway agent environment.
- Deployment succeeded with no errors or missing embeddings.
- The web service was skipped because the change did not affect the web app.
- Retrieval validation returned expected `clinical_policy` sections with `0.83+` cosine similarity.
- Rollback is possible by nulling embeddings again and re-embedding with `voyage-law-2`.

#### Environment identifiers
- Railway project id: `2a11b10b`
- Production environment id: `1c44225d`
- Neo4j service id: `1de48388`
- Agent service id: `5f1decc0`
- Web service id: `903a72cc`

---

### 5) Corpus graph writer and incremental ingest
See `neo4j_write_read_consistency/_index.md`

- Focuses on the write-side boundary and cleanup behavior for the corpus graph, plus one operational ingest run validating the incremental pipeline in production.
- Main theme: **surgical, idempotent graph mutation** — preserve unchanged sections, delete only stale structure, and clear embeddings only for sections whose content changed.

#### Core boundary: `CorpusGraphWriter`
See:
- `corpus_graph_writer_incremental_cleanup.md`
- `corpus_graph_writer_incremental_cleanup.overview.md`
- `corpus_graph_writer_incremental_cleanup.abstract.md`

Key behavior:
- `CorpusGraphWriter` is the single write-side boundary for Neo4j corpus graph mutations.
- It centralizes document bundle upserts, section writes and cleanup, relationship merges, and status updates.
- Canonical flow:
  - merge document → write sections → delete stale sections → clear changed embeddings → merge relationships
- Relationship handling is split by edge type:
  - references
  - amendments
  - supersessions
  - concept links

Important implementation facts:
- `upsert_document_bundle` merges the document and writes sections.
- `merge_reference_edges` handles `REFERENCES` and `REFERENCES_DOCUMENT`.
- `merge_amendments` also marks affected documents with amendment status.
- `merge_supersessions` writes supersession edges with effective date and reason.
- `merge_concept_links` supports `COVERS`, `DEFINES`, and `RESTRICTS`.

#### Transaction boundary evolution
See:
- `corpusgraphwriter_transaction_boundary.md`
- `corpusgraphwriter_write_boundary.md`

This is a progression of the same write boundary:
- Public writes moved from explicit transactions to managed Neo4j writes.
- `with session.begin_transaction() as tx: ... tx.commit()` version made cleanup/rewrite atomic and accepted `Transaction` in helpers.
- Later `session.execute_write(work_fn)` version adds managed transaction semantics, transient retry handling, and test support in `FakeSession.execute_write`.
- The selective cleanup rule remains unchanged: only changed sections lose embeddings/chunks; unchanged sections are preserved.

#### Operational validation: Run 19
See:
- `incremental_crawl_ingest_run_19.md`

- Documents a real incremental ingest run into Railway production (`voyage-4`).
- Key results:
  - 34 targeted docs ingested
  - corpus grew from 6693 to 6725 docs
  - 1533 sections added
  - no missing embeddings
  - retrieval verified for `MA-3234 Expanded Foster Care` at `0.86 cosine`
- Operational lesson: avoid naive full reprocessing of fee schedule PDFs because byte churn can trigger unnecessary work.
- Recommended targeting uses `first_seen_at>=run_start` or `(last_changed_at>=run_start and source_type!=fee_schedule)` with `status='downloaded'`.
- Local Docker/Neo4j was unavailable during the run, so prod updated independently and local resync remained pending.

## Cross-cutting pattern across the domain
A recurring pattern across these entries is **schema-aware, environment-sensitive, incremental graph maintenance**:
1. validate and normalize outputs before use,
2. preserve unchanged graph state,
3. clean stale state only where needed,
4. use managed or atomic write boundaries,
5. verify behavior in production-like runs.

## Drill-down map
- Railway auth encoding and password rotation: `neo4j_auth/railway_neo4j_auth_handling.md`
- Safe production refresh procedure: `neo4j_auth/production_neo4j_federal_data_refresh.md`
- Hybrid retrieval indexing and fusion: `neo4j_hybrid_search/neo4j_hybrid_search_indexing.md`
- Destructive refresh workflow: `neo4j_hybrid_search/deploy_data_script_and_refresh_workflow.md`
- Production `voyage-4` migration record: `neo4j_hybrid_search/voyage_4_embedding_migration_on_railway_production.md`
- Corpus graph writer and cleanup boundary: `neo4j_write_read_consistency/corpus_graph_writer_incremental_cleanup.md`
- Transaction/write boundary evolution: `neo4j_write_read_consistency/corpusgraphwriter_transaction_boundary.md`, `neo4j_write_read_consistency/corpusgraphwriter_write_boundary.md`
- Incremental ingest validation: `neo4j_write_read_consistency/incremental_crawl_ingest_run_19.md`

## Related synthesized consistency theme
A broader shared conclusion in the surrounding knowledge is that schema-aware validation is the guardrail across graph writes, retrieval, evaluation, and QA. In this domain, that shows up as null-row filtering, numeric normalization, deduplication before fusion, and guarded write paths that prevent malformed graph state from propagating downstream.