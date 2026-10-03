# Offline qualification preparation

Preparation builds a disposable audit graph and estimates a later campaign. It never qualifies, marks a release, promotes, merges, deploys, or contacts an agency. Embeddings and all model-backed checks remain `NOT_RUN`. The [dated report](../validation/qualification-preparation-2026-10-03/README.md) distinguishes completed preparation from unresolved release prerequisites.

## Inputs and isolation

Use a complete verified restored corpus, including the registry, retained payloads/parses, retirement/availability history and scope records. Keep the native encrypted restore receipt and matching ciphertext durable. Reuse a receipt only after checking its archive digest, current complete snapshot and implementation/artifact hashes.

Create a private directory (0700; files 0600), a fresh Neo4j volume and a Docker network with `--internal`. Use the exact graph hostname `qualification-preparation-neo4j`, database `neo4j`, and no published ports. Supply a generated disposable Neo4j password in private env files; supply no provider credentials. Pin the tested runtime image by digest.

The sealed JSON manifest mounted read-only at `/inputs.json` contains:

- `implementationRevision`, `sourceSnapshotHash` (including `sha256:`), `scopeImplementationHash`, and `catalogHash`.
- `originalDocumentsRoot`: the absolute crawler documents root recorded in the retained sidecars.
- `federalCacheHashes`: verified original SHA-256 values by cache filename.
- `federalCacheOriginalTimes`: original archive mtimes by cache filename. A copied file's materialization time is not a fresh observation.

Mount the complete corpus read-only at `/data` and at the original corpus root (`originalDocumentsRoot` minus `/crawler/documents`). The harness proves these are the same tree, rejects writable submounts, and requires an EROFS write probe. The static registry must have no uncheckpointed WAL/journal; immutable read-only connections avoid SQLite locking-sidecar writes. Do not rewrite sidecars or fall back to a development registry.

The pipeline environment contains only disposable Neo4j connection settings, `CORPUS_DATA_ROOT=/data`, `MASTRA_OBSERVABILITY_PATH=:memory:`, `AGENT_MODEL=gpt-5.6-terra`, `VERIFIER_MODEL=gpt-5.6-terra`, and `VERIFIER_ENABLED=true`, plus allowlisted image defaults. The harness additionally blocks HTTP and non-candidate sockets. Use a fresh output directory for each build; preserve every failed attempt.

## Build and inspect

From a clean checkout, using secure env files and an already running empty disposable graph:

```bash
docker run --name qualification-preparation-pipeline \
  --network "$PREPARATION_NETWORK" --memory 24g \
  --env-file "$PRIVATE_RUN/pipeline.env" \
  --entrypoint /app/packages/pipeline/.venv/bin/python \
  -v "$RESTORED_CORPUS:/data:ro" \
  -v "$RESTORED_CORPUS:$ORIGINAL_CORPUS_ROOT:ro" \
  -v "$PRIVATE_RUN/sealed-inputs.json:/inputs.json:ro" \
  -v "$PRIVATE_RUN/build:/output" \
  -v "$PWD/scripts/ops/prepare-qualification.py:/opt/prepare-qualification.py:ro" \
  "$PINNED_PIPELINE_IMAGE" /opt/prepare-qualification.py
```

The image must contain the reviewed checkout's pipeline/agent sources and benchmark. Attest those hashes independently; the manifest revision alone is not proof of image contents. Keep the harness unchanged while it runs and retain its digest. `load_all` covers every manifest family; `build-mixed-corpus` alone covers only three state families and cannot prepare this complete candidate.

Federal reads use pinned archived bytes without a freshness bypass or timestamp refresh. The preparation wrapper clears federal `source_checked_at` rather than claiming a new check. References write generated unresolved-reference evidence only into `/output`. No embeddings or LLM reference assistance run.

Concept linking scans the complete section text in Python before writing its collected edges. On a large corpus this can spend many minutes using one CPU while Neo4j is idle; Rich's progress display is silent without a TTY. Check process activity and the final stage receipt before interpreting quiet logs as a stalled build.

Inspect `graph-audit.json`, the family audit and all build stages. An executed harness is insufficient: require zero duplicate identities, zero missing answer-ready loads, and every required family. Inspect exclusions/orphans separately. Any adapter or archived federal input makes this graph and its audit/mapping evidence preparation-only.

For the read-only identity/cost inspection, use the same internal network, env file, read-only corpus/input mounts and image; mount both ops Python scripts side by side under `/opt`, the completed catalog at `/catalog.json:ro`, and a new private inspection directory at `/output`. Run `/opt/inspect-qualification-preparation.py`. It requires the matching preparation marker, maps only catalog source identities, and estimates the same contextual text/chunking as `embed_all` without creating chunks or contacting a tokenizer/provider. Estimates do not establish embedding validity or billing.

Stop owned containers after completion. Retain the graph volume or make and hash an offline Neo4j dump before removing it. Preserve private receipts and their checksums, redact published evidence, and verify the original working-tree files stayed unchanged.

## Later paid qualification — not authorized by preparation

Resolve stale required source families and federal refresh failures, recheck source identities/scope approvals, and produce a new matching encrypted backup/restore proof. Fix the legacy graph's incomplete identity mapping without increasing production memory as a workaround. Rebuild a normal candidate with fresh federal evidence and complete embeddings; the preparation graph is not eligible for promotion.

Refresh official prices and approve a separate campaign budget with a working spending guard before calls. The cost scenario does not impose a hard cap, and the agent's 99 steps and retry behavior can exceed its assumptions. Preserve existing retry/verifier limits and all failed attempts.

Freeze the unchanged 55-question benchmark, catalog, source/implementation hashes and common model configuration; retain graph-specific mapping hashes separately. Set `EVAL_IDENTITY_CATALOG` securely to the approved catalog and `MASTRA_OBSERVABILITY_PATH=:memory:`. Use a separate run-results directory for each invocation. Run from `packages/pipeline`:

1. Against legacy: `uv run python -m pipeline.cli release-baseline --release-id legacy-20260725-ae8595c --output "$RUN_DIR/legacy-1.json"`.
2. Against legacy again: `uv run python -m pipeline.cli eval --level answer`; retain the emitted run ID and its complete result file as repeat 2.
3. Build the confirmed inactive candidate using the [supervised bootstrap procedure](blue-green-corpus-releases.md). Its normal validation invokes `release-validate` with the legacy baseline, including one complete retrieval run, one answer run, and all eight scope cases twice. Do not invoke validation twice merely to repeat the answer benchmark.
4. Against that unchanged candidate: `uv run python -m pipeline.cli eval --level answer`; preserve repeat 2 separately.

This matrix contains 220 benchmark answers, 110 retrieval questions, and 16 scope scenarios. Normal bootstrap already performs the first candidate validation: do not add a duplicate `release-validate` invocation after it. Check complete question-ID sets, normal verification telemetry, common fingerprints, and both baseline/candidate repeats before interpreting scores. Keep release-policy thresholds unchanged. Do not reuse old mapping failures as misses or manufacture comparison evidence.

The [run matrix](../validation/qualification-preparation-2026-10-03/run-matrix.json) is a specification, not execution evidence. Paid qualification and subsequent activation/browser acceptance require separate authorization. Agency inquiries remain unsent.
