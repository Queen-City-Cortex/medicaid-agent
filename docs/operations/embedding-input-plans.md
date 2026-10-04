# Embedding input plans

The pipeline uses one lossless contextual plan for generation, offline volume measurement, CLI coverage, and release inspection. It retains the document title, ancestors in root-to-parent order (including repeated titles), and section title on each input. Ambiguous ownership, multiple parents and cycles fail rather than choose a context.

`contextual-bytes-v1` limits an input to 9,000 UTF-8 bytes including context and overlap. A contextual section that fits has one direct vector; otherwise it has indexed chunks. Splits prefer paragraph, newline, whitespace, then a Unicode codepoint boundary. Overlap is at most 500 bytes, reduced to half the available body budget when necessary; unbroken text can have zero overlap. Exact byte spans cover the complete stored body without whitespace normalization. Context exceeding half the input budget (4,500 bytes) fails before paid calls, preventing extreme repeated-heading amplification. Whitespace-only bodies produce no inputs and are counted separately; stored bodies remain unchanged. The reader pages 50 section IDs and fetches contextual records eight at a time; it never assembles a corpus-wide text dictionary.

Provider batches are limited to 60,000 UTF-8 bytes and the configured input count. The client disables truncation, requests the configured dimension, and validates response indexes; the generator checks vector count, dimensions and finite values before writing. Byte limits are the repository policy, not exact token counts or evidence of billing. No tokenizer is invoked during preparation.

## Retries and release coverage

Each planned Section or Chunk stores `embedding_fingerprint`, a SHA-256 over policy version, model, dimensions, document input type and exact input text. Change the policy version when planning semantics change. A completed vector is reusable only under the matching plan. A changed section plan clears the direct vector and replaces its chunk set atomically, including obsolete higher indexes. Vector writes require the expected fingerprint and exact matched-row count within one transaction.

Any vector without a fingerprint causes `embed` to fail before graph writes or provider calls. Build a fresh inactive candidate through the existing release procedure; do not tag legacy vectors or mutate the active graph to pass this check. Chunk ownership must also be unambiguous before generation.

Coverage requires every expected node ID/index and fingerprint, finite vectors of the selected dimension, and exactly one direct or chunk path. Missing tail chunks remain failures even when repeated inputs have identical fingerprints. Empty-section vectors and orphan/shared chunks cannot count as complete. Generation, release inspection, and `stats` use the same checker; release thresholds are unchanged. Full checks read actual section bodies and can take time on a large corpus.

## Offline inspection

Follow [qualification preparation](qualification-preparation.md) for the internal Docker network, secure env files, read-only corpus/input mounts, frozen catalog and absence of provider credentials. Restore a verified retained preparation dump into a newly owned graph volume; never overwrite the retained dump. Inspect with an image containing the committed reviewed sources, pinned by image digest and independently checked source hashes. Every receipt also includes hashes of the actual imported planner, graph reader, measurement, generator, client and provenance modules.

The inspection manifest additionally records `graphBuildImplementationRevision`, `graphBuildHarnessSha256`, and `graphDumpSha256`, from the retained build/dump receipts. Set `implementationRevision` to the inspection source revision. The inspector compares the preparation marker's harness and source hashes, checks the complete corpus snapshot before and after, and preserves the original build revision in its output. A preparation marker does not itself contain the build revision: retain the source/image attestations and verified dump digest that establish it.

The inspector measures the shared plan without creating chunks or embeddings. Its lossless-plan counts describe coverage of stored body bytes, not coverage by vectors or answer quality. Per-family whitespace/pipe-stripped byte counts are diagnostic only. Large spreadsheet table padding remains unchanged, so corrected splitting can increase vector counts substantially. Formatting compaction and bounded retrieval of those bodies need separate validation before paid qualification.

Parse provenance receipts account for retained sidecars with no exact registry-path join. A duplicate disposition requires a unique active same-family source-hash match, matching retained and canonical source bytes, validated parse artifact hashes, identical Markdown, and identical parsed JSON apart from name/origin metadata. The inspector also requires exactly one canonical graph document. Unproven historical parses remain unresolved and excluded; missing payloads do not establish retirement. The receipt never updates registry rows, sidecars, source files, or graph documents.

Keep every failed and successful attempt in separate private output directories. Publish redacted volume, cost sensitivity, provenance and completion summaries with artifact checksums. Estimates are not spending authorization; preparation remains `NOT_ASSESSED` and not promotable.

## Verification

Run the pipeline test suite and both Ruff and Vulture. The embedding integration suite requires its own **empty disposable graph** and `RUN_EMBEDDING_INTEGRATION=1`; it mocks Voyage and rejects a nonempty graph before fixtures are created. CI provisions a separate Neo4j service for it. The general pipeline integration suite uses `RUN_NEO4J_INTEGRATION=1` on a different service. Never aim either at a corpus or production graph.

A paid campaign must bind its approved `planTextFingerprint` and enforce its separately approved spending cap. Offline receipts always report whitespace-only body and novel-body input counts; any nonzero count requires a representation review before a paid run. These diagnostics preserve every source byte. Imported module hashes must match the sealed inspection inputs.
