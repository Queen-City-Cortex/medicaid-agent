# Working artifact from the contracts-seams reviewer

## Local data caveat (read before using any number below)

- **Local Neo4j graph** (neo4j 2026.05 community, read-only probes): no `SchemaVersion`, `CorpusRelease`, `JevAnnotation` or `CorpusMutationLock` node; `last_indexed` between 2026-07-11T16:47 and 16:58Z; 7,589 documents, 71,695 sections, 11,477 chunks, 33 concepts. 0 of 71,695 sections carry `embedding_plan_hash` or `embedding_source_epoch`; 0 of 7,589 documents carry `retrieved_at`, `source_modified_date`, `source_checked_at` or `source_changed_at`; no `beneficiary_guidance` documents. It predates the current loader and release stamping. Used only for labels, relationship types, indexes and property names.
- **Local crawler.db** (queried from a scratch copy): 4,575 rows, last checked 2026-10-01; no `source_retirements`, `source_classifications` or `source_freshness` table; has a `removal_reason` column absent from current DDL; 1,712 URLs still end in `?attachment`. It was last written by code other than current main. Used only for URL shapes and status counts.

## Seam table

| # | Seam | Source of truth | On mismatch at runtime | Version or handshake | Test that would catch drift | Runtime-validated on both ends |
|---|---|---|---|---|---|---|
| 1 | Neo4j schema (labels, properties, relationships, indexes) | Two hand-written sets of Cypher: `pipeline/graph/queries.py` + `corpus_writer.py` + `release.py` (write), `policy-corpus` backends, primitives, `document-metadata.ts`, agent `corpus-status.ts`/`readiness.ts` (read) | Silent: an unknown property reads as null, a missing relationship as no rows. Missing or wrong-width `section_embeddings` is loud (section-vector has no catch); `chunk_embeddings`, fulltext, concept and keyword failures are swallowed | Release id only (`CorpusRelease.release_id` vs `CORPUS_RELEASE_ID` at `/readyz`). `SchemaVersion` is written and never read | None end to end. Each side tests against mocked sessions; opt-in integration suites define their own index DDL | No |
| 2 | Agent CLI stdout (answer eval markers, retrieval JSON) | Marker names and JSON keys typed separately in TS (`index.ts`, `cli-verification.ts`, `verifier/run.ts`, `tools/answer-frame.ts`, `retrieval-cli-runner.ts`) and Python (`eval/levels/answer.py`, `retrieval/agent_bridge.py`) | Mostly silent: missing keys become None, a displaced evidence block becomes 0 sources, a missing answer marker returns the whole stdout. Loud only for non-zero exit, invalid retrieval JSON and missing verifier telemetry during release validation | None | Per-side hand-written fixtures (`test_answer_eval.py`, `test_retrieval_bridge.py`, `retrieval-cli-runner.test.ts`); no shared sample | TS input is Zod-validated; Python output handling is not |
| 3 | Corpus manifest and release policy | `corpus-manifest.json` and `corpus-release-policy.json` (single files). Extra copies of the type vocabulary: crawler `SourceType` union, policy-corpus type groups, agent prompt | Manifest shape errors are loud at import in both languages. Type-group drift is silent (family never retrieved). Policy is read only by Python; the contracts JSON Schema for it is unused and rejects the real file | `evaluation_fingerprint` hashes both files; manifest hash stored on the unread `SchemaVersion` | `crawler/tests/manifest.test.ts` pins the family list for the crawler; nothing pins manifest families to retrieval type groups | Manifest: yes (two hand-written validators, TS stricter). Policy: Python only |
| 4 | Source identity | Three canonicalizers: `crawler/src/identity.ts`, `pipeline/identity.py`, `pipeline/retirement.py::canonical_url`. Document ids are computed only in Python from the registry URL | Loud but late: 'Unknown source identity', 'Every actual document link ...', 'Classified index has unregistered document children' | None | One duplicated vector for the first two; none for `canonical_url` | n/a |
| 5 | HTTP contracts | `packages/contracts/src/schemas.ts` for feedback, research, status and verification outcome; nothing for error bodies in practice, tool outputs or the extra verification-part fields | Web: silent (casts), except answer display, which fails closed on exact status literals. Errors: wrong message shown (generic, or a raw code) | None | Per-side unit tests; `e2e/tests/mocked` uses hand-written bodies | Agent: feedback and research inputs and research rows. Chat input and all responses: no. Web: no |
| 6 | Embedding model and dimensions | Agent `VOYAGE_MODEL` + `EMBEDDING_DIMENSIONS`; pipeline `EMBEDDING_MODEL` + `EMBEDDING_DIMENSIONS`; index width from the pipeline value at first creation | Width: loud at query (agent check, Neo4j error), but the agent's own check failing degrades silently to lexical. Model with equal width: silent. Stale index after a width change on a reused volume: new vectors silently unindexed | None in the graph. Writer-side only: `embedding_plan_hash` includes model and dimensions; the release manifest file records both | `policy-corpus-embed.test.ts` (query width); pipeline plan tests; nothing compares the two sides | Width on both sides; model on neither |
| 7 | Crawler SQLite registry | `crawler/src/db/schema.ts`; `source_retirements` and `source_classifications` re-declared in Python; `source_audit_actions`, `source_answer_scopes` Python-only; status strings copied in 9+ Python sites with two 'active' sets | Missing column: loud (`KeyError` or SQL error). Status semantics: silent (document dropped from graph). URL form: loud but late (seam 4) | None (`PRAGMA user_version` unused) | Python tests build their own 7-column `documents` table; no test runs Python against the crawler's DDL | No |

## Mechanical checks performed

- **Reader vs writer names**: properties referenced in TS Cypher: aliases, answer_ready, answer_role, authority_tier, change_description, content_length, content_text, corpus_bucket, digest, document_type, effective, effective_date, federal_register_cite, id, jev_annotation_digest, jev_section_roles, last_indexed, last_revised, name, policy_number, reason, reference_text, release_id, retrieval_ready, retrieved_at, section_number, source_format, source_modified_date, source_url, status, title, variant_date, variant_group. All are set by the writer. Labels: CorpusRelease, Document, JevAnnotation, PolicyConcept, Section. Relationships: AMENDS, COVERS, DEFINES, HAS_CHUNK, HAS_SECTION, NEXT_SIBLING, PARENT_OF, REFERENCES, REFERENCES_DOCUMENT, RESTRICTS, SUPERSEDED_BY. All written.
- **Vocabulary literals**: every `answerRole`, `authorityTier` and `corpusBucket` literal in TS exists on the Python side. The only manifest source type never referenced in policy-corpus or agent source (outside the prompt) is `beneficiary_guidance`.
- **Canonicalizers, 31 synthetic URLs**: identity.py vs identity.ts differ on 9 raw inputs (space in path, non-ASCII path, dot segments, quotes or braces in path, backslashes, IDN host, userinfo) and on 1 after composition (userinfo).
- **Canonicalizers, 4,575 registry URLs**: identity.py equals identity.ts on all; `retirement.canonical_url` differs on 1,715.
- **Local indexes**: `section_embeddings` and `chunk_embeddings` VECTOR, 1024, cosine, ONLINE; `section_fulltext` on title + content_text; no `corpus_mutation_lock_id` constraint (older schema).

## Contracts export usage (source files importing each symbol)

| Export | agent/src | web/src | Used how |
|---|---|---|---|
| FeedbackInputSchema, ResearchStartInputSchema, ResearchDecisionInputSchema, IdentifierSchema | 1 to 3 | 0 | Runtime parse of request input |
| ResearchPlanSchema, ResearchReportSchema, ResearchRunSchema, VerificationOutcomeSchema, ResearchSubQuestionSchema | 1 to 4 | 0 | Runtime parse of stored rows and workflow output |
| VERIFICATION_PART, WITHHELD_ANSWER, UNVERIFIED_HISTORY | 1 to 3 | 1 to 2 | Shared constants |
| CorpusStatus, Readiness, DependencyHealth, VerificationOutcome, ResearchRun, ResearchReport, ResearchPlan, ResearchSubQuestion (types) | 1 to 5 | 0 to 2 | Types only |
| ApiErrorSchema, CorpusStatusSchema, ReadinessSchema, DependencyHealthSchema, ProviderHealthSchema, VerificationProgressSchema, DeepResearchProgressSchema, FeedbackSchema | 0 | 0 | Never parsed |
| ReleaseManifestSchema, ReleaseGateResultSchema, ReleaseStageResultSchema, ReleaseEventSchema | 0 | 0 | Own test only |
| release-policy.schema.json | 0 | 0 | Unreferenced; rejects the real policy file |

## Error body shapes in the agent API

| Shape | Emitted by | Web consumer that understands it |
|---|---|---|
| `{error:{code,message}}` | chat-route.ts, execution-gateway.ts, deep-research/routes.ts | use-deep-research.ts only |
| `{error:'<code>', message, retryAfterSeconds?, limit?, window?}` | rate-limit/middleware.ts (applies to POST /chat and POST /research/runs) | parse-chat-error.ts only |
| `{error:'<human text>', details?}` | feedback/routes.ts, corpus-status.ts, index.ts onError | none (status code only) |
