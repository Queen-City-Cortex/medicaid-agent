# Embedding input plans

Generation, offline measurement, CLI statistics and release inspection use one canonical planner: `embeddings.planner.plan_inputs`. Plan version **3** keeps character offsets into exact stored bodies, includes every contextual heading, and enforces limits with the SHA-verified local Voyage tokenizer. Runtime never downloads tokenizer assets implicitly or calls a provider during inspection.

Inputs have at most 9,000 characters and 32,000 locally counted tokens, including the document input prompt and tokenizer special tokens. Context must fit half the character and token budgets. Source windows prefer paragraph and whitespace boundaries and retain bounded overlap; token-dense windows split further without truncation. Whitespace-only sections produce no inputs. Generation rejects a window adding only whitespace during the complete preflight, before mutations or provider calls. Diagnostics count such windows without changing source text.

The authoritative graph reader retains document title, every ancestor in root-to-parent order (including repeated titles) and section title. Missing or ambiguous document ownership, multiple parents, cycles, invalid section identities and orphan/shared chunks block generation and release checks. Reads fetch at most ten bodies per query with one-record driver fetches.

## Resume, writes and release

A plan hash binds version, model, dimensions, tokenizer pin, every exact input hash and source offset. A semantic source epoch binds document title, section text, titles and ancestry while ignoring retrieval timestamps. Loading semantic changes invalidates both direct and chunk vectors. Planning and provider-result writes acquire the owning section lock and reject a changed epoch or plan. Stale or incomplete plans are replaced atomically; matching valid vectors resume without another provider call. Empty-section stale plans are cleared without provider calls. Use only inactive candidates for corpus work.

Provider requests enforce per-input and aggregate token limits, disable truncation and request configured dimensions. Responses must contain exactly the input index set; reordered responses are sorted by index. The generator rejects wrong dimensions, non-finite, boolean and all-zero vectors before transactional writes.

The single `plan_graph.embedding_coverage` checker recomputes the current plan from actual bodies and headings. It checks exact node identities, plan/epoch/count, chunk text hashes and offsets, complete direct-or-chunk paths and valid vectors. Missing tails, extra paths, empty-section vectors, orphan/shared chunks, changed model or dimensions and damaged text fail coverage. Generation, release inspection and `stats` use this same checker. Full release checks read and locally tokenize bodies, so allow time for a large corpus. Old nonnull hashes alone do not establish coverage.

## Offline inspection and provenance

Follow [qualification preparation](qualification-preparation.md) for the internal network, credential-free environment, read-only corpus/inputs and pinned catalog. The inspector verifies matching retained graph-build evidence, hashes its imported modules including planner/tokenizer/source epochs, and brackets measurement with complete corpus snapshots and immutable registry digests. It makes no provider calls, creates no chunks or vectors and never upgrades qualification evidence. Provision tokenizer assets explicitly before running it.

Read-only parse provenance requires a unique active same-family payload match, actual retained/canonical source hashes, validated artifact hashes and identical parsed content apart from name/origin metadata. Duplicate dispositions also require exactly one canonical graph document. Unproven parses stay excluded; missing payloads do not establish retirement. Registry rows, sources, sidecars and graph documents remain unchanged.

The earlier [byte-planner repair receipts](../validation/embedding-repair-2026-10-03/README.md) and [version-2 fee comparison](../validation/fee-compaction-2026-10-04/README.md) remain source-attested historical diagnostics. They do not measure or qualify version 3. A future paid campaign requires fresh snapshot/plan binding, renewed scope approvals, separate spending authorization and enforced budget limits. Implementation CI is not corpus answer qualification.

## Verification

Run Ruff, Vulture, pipeline tests and isolation guards. Embedding persistence/topology tests require an **empty disposable graph**, `RUN_EMBEDDING_INTEGRATION=1`, and mocked Voyage. CI provisions a separate service for these tests; general integration tests use `RUN_NEO4J_INTEGRATION=1` on another service. Never aim tests at corpus or production graphs.

The [October 4 integration report](../validation/fee-integration-2026-10-04/README.md) records the reconciled branch ancestry, source-attested Linux tests, preservation and cleanup.
