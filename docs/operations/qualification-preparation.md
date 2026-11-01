# Offline qualification preparation

Preparation builds a disposable audit graph and estimates a later campaign. It never qualifies, marks a release, promotes, merges, deploys, or contacts an agency. Embeddings and all model-backed checks remain `NOT_RUN`. The [dated report](../validation/qualification-preparation-2026-10-03/README.md) distinguishes completed preparation from unresolved release prerequisites.

## Inputs and isolation

Use a complete verified restored corpus, including the registry, retained payloads/parses, retirement/availability history and scope records. Keep the native encrypted restore receipt and matching ciphertext durable. Reuse a receipt only after checking its archive digest, current complete snapshot and implementation/artifact hashes.

Create a private directory (0700; files 0600), a fresh Neo4j volume and a Docker network with `--internal`. Use an allowlisted graph hostname `qualification-preparation-neo4j` or `qualification-cycle-neo4j`, database `neo4j`, and no published ports. Supply a generated disposable Neo4j password in private env files; supply no provider credentials. Pin the tested runtime image by digest.

The sealed JSON manifest mounted read-only at `/inputs.json` contains:

- `implementationRevision`, `sourceSnapshotHash` (including `sha256:`), `scopeImplementationHash`, and `catalogHash`.
- `originalDocumentsRoot`: the absolute crawler documents root recorded in the retained sidecars.
- `federalCacheHashes`: verified original SHA-256 values by cache filename.
- `federalCacheOriginalTimes`: original archive mtimes by cache filename. A copied file's materialization time is not a fresh observation.

Mount the complete corpus read-only at `/data` and at the original corpus root (`originalDocumentsRoot` minus `/crawler/documents`). The harness proves these are the same tree, rejects writable submounts, and requires an EROFS write probe. The static registry must have no uncheckpointed WAL/journal; immutable read-only connections avoid SQLite locking-sidecar writes. Do not rewrite sidecars or fall back to a development registry.

The pipeline environment contains only disposable Neo4j connection settings, `CORPUS_DATA_ROOT=/data`, `MASTRA_OBSERVABILITY_PATH=:memory:`, `AGENT_MODEL=gpt-6.1-terra`, `VERIFIER_MODEL=gpt-6.1-terra`, and `VERIFIER_ENABLED=true`, plus allowlisted image defaults. The harness additionally blocks HTTP and non-candidate sockets. Use a fresh output directory for each build; preserve every failed attempt.

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

For the read-only identity/cost inspection, use the same internal network, env file, read-only corpus/input mounts and image; mount both ops Python scripts side by side under `/opt`, the completed catalog at `/catalog.json:ro`, and a new private inspection directory at `/output`. Run `/opt/inspect-qualification-preparation.py`. It requires the matching preparation marker, uses the same whole-graph identity reader as evaluation, then the shared contextual embedding planner with pinned local Voyage tokenization. It creates no chunks and makes no provider calls. Provision both reviewed tokenizer assets before entering the network guard; mount them read-only at `/opt/nc-medicaid-tokenizers` and set `EMBEDDING_TOKENIZER_DIR` accordingly. Inputs are capped at 9,000 characters including headings, with at most 512 overlap characters and a local 32,000-token check. Counts estimate volume; they do not establish provider billing or vector quality.

Stop owned containers after completion. Retain the graph volume or make and hash an offline Neo4j dump before removing it. Preserve private receipts and their checksums, redact published evidence, and verify the original working-tree files stayed unchanged.

## Later paid qualification — not authorized by preparation

Resolve stale required source families and federal refresh failures, recheck source identities/scope approvals, and produce a new matching encrypted backup/restore proof. Use the bounded whole-graph identity reader demonstrated by the [qualification-unblocking report](../validation/qualification-unblock-2026-10-03/README.md), and retain genuine missing identities. Revalidate against the final frozen catalog; diagnostic mappings are not benchmark scores. Rebuild a normal candidate with fresh federal evidence and complete embeddings; the preparation graph is not eligible for promotion.

Refresh official prices and approve a separate campaign budget before calls. The spending guard is the provider's own limit on credentials used for nothing else: run the campaign with a dedicated evaluation OpenAI project key whose project has a hard monthly budget limit enforced, and a dedicated Anthropic key for the judge in a workspace with an enforced spend limit. Never put these limits on the production project, workspace or keys, where they would stop the live service. Both limits are monthly and can overshoot slightly, so set them with headroom for one campaign and confirm in each console that the limit is enforced, not only alerted on. Voyage and TypeSafe offer no limit this project has verified; check their consoles before a campaign. The cost scenario does not impose a hard cap, and the agent's 99 steps and retry behavior can exceed its assumptions; the $5, 64-request sample gateway (`scripts/ops/sample-budget-gateway.py`) bounds only the cost-sample diagnostic and is not a prerequisite here. Preserve existing retry/verifier limits and all failed attempts.

Freeze the golden dataset at its current version (`packages/pipeline/data/golden/dataset-version.json`, 3.4 on 2026-10-09; only its validated entries are scored, and issue #18 must name the version that is frozen), run `eval-validate-golden` against the approved catalog, and freeze that catalog, source/implementation hashes and common model configuration; retain graph-specific mapping hashes separately. Set `EVAL_IDENTITY_CATALOG` securely to the approved catalog and `MASTRA_OBSERVABILITY_PATH=:memory:`. Use a separate run-results directory for each invocation. Run from `packages/pipeline`:

For each of three repetitions, run both graph arms against the same validated question IDs: a complete retrieval run, a complete verified answer run, and all eight scope cases twice for each arm. Preserve each run in its own directory. Bootstrap's normal candidate validation (`release-validate`) runs all three candidate answer repetitions itself, with the first candidate retrieval and scope repetition; do not duplicate them. Run the remaining repetitions independently against the frozen unchanged graphs and retain the legacy baseline diagnostic limitations.

**Three-run rule.** The release gates on the candidate's answer runs read the mean of three runs, never one: the released-answer score floor, the hallucination floor, the withheld-answer cap and the all-rows baseline comparison each use the mean of the three per-run values (`answerRuns` and `maxVoidedAnswerRuns` in [`corpus-release-policy.json`](../../corpus-release-policy.json)). Fewer than three valid runs fail the mandatory `answerRuns` gate, and no override waives it. A run in which any question records an agent, judge or verifier infrastructure error is voided: it is re-run and does not count. `release-validate` keeps the voided run as `answer-evaluation-voided-<n>.json`, records an `answer_run_voided` event in the manifest, and runs that repetition again. Only the first three valid runs count, so a valid run is never replaced because it scored low. After a third voided run validation stops before any gate is evaluated; fix the outage and validate again. A voided run is still paid for: budget up to five candidate answer runs. The [promotion invariants](blue-green-corpus-releases.md#promotion-invariants) define what each floor applies to.

With the 55 questions of dataset 2 this matrix contained **330 benchmark answers, 330 retrieval questions and 48 scope scenarios**; under dataset 3 the answer and retrieval counts are six times the validated count (282 each while 47 entries are validated). Check complete question-ID sets, normal verification telemetry, common fingerprints and all three paired repeats before interpreting scores. Keep the answer floor, hallucination floor, withheld cap and three-run rule unchanged; the two retrieval floors are set once from the candidate's measured retrieval, as the [promotion invariants](blue-green-corpus-releases.md#retrieval-floors-and-the-order-of-the-gates) describe. The nine retained legacy identity misses are missing source coverage, not failed infrastructure reads or invented model regressions. They are every label of q-051 to q-055, so read each paired difference, and the release's regression gates, on the 50 questions both graphs hold; report the five as coverage gained. The revised [run matrix](../validation/qualification-cycle-2026-10-03/run-matrix.json) remains unexecuted. The earlier dated matrix below is preserved as historical preparation evidence.

The [run matrix](../validation/qualification-preparation-2026-10-03/run-matrix.json) is a specification, not execution evidence. Paid qualification and subsequent activation/browser acceptance require separate authorization. Agency inquiries remain unsent.

Audit-only runs create a fresh `audit-<run-id>` directory beneath the output mount. Their `audit-completion.json` records `buildExecuted=false` and identifies the original build run; original completion and corpus-audit receipts stay intact. A receipt from another run cannot be overwritten.

The local tokenizer processes bounded batches of 128 inputs. Set `RAYON_NUM_THREADS=4` to bound CPU parallelism while accelerating exact whole-corpus counts. Record the actual image ID, loaded source hashes, tokenizer asset hashes and implementation revision independently of the archived source manifest. A restored graph without semantic source epochs remains suitable for this read-only volume diagnostic, but must be reloaded by the current writer before embedding generation. Content or heading changes invalidate all document vectors and saved plans; timestamp-only refreshes preserve them.

The reconciled [embedding input plan](embedding-input-plans.md) uses version 3 and a shared exact coverage checker. New inspection inputs must pin hashes for the imported planner, tokenizer, graph reader, generator, client, source-epoch, measurement, provenance and identity/snapshot modules. The inspector checks complete corpus snapshots and raw immutable registry digests before and after measurement; it retains build/image/dump provenance separately from the inspection revision. Earlier volume and pricing receipts remain historical diagnostics until remeasured against the combined revision.
