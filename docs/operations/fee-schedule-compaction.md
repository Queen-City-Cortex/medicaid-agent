# Offline fee-schedule XLSX compaction

This diagnostic lane trims only trailing empty cells from XLSX documents whose explicitly supplied source family is `fee_schedule`. It retains the existing `str(value).strip()` conversion, ` | ` delimiter, row and sheet order, titles, leading/interior blanks, dates, zeros and booleans. XLS and PDF rendering remains unchanged. Formula positions and merged ranges protect column positions; missing formula caches are recorded without recalculating formulas. Entirely empty cached rows remain omitted, with their original indices retained in the private ledger. A native-verified empty styled tail is recorded as a row range, avoiding a million metadata entries for blank rows.

The targeted representation is `fee-schedule-trailing-empty-v1`. Payload and sidecar must agree; old fee XLSX successes cannot be migrated by relabelling. Cache version remains 6 for other formats. Representation changes reset generation attempts while preserving total attempts, including recovery of old errors.

## Stage and prove

Use a new private directory outside the archived corpus. Run from `packages/pipeline`, with a clean environment and the frozen dependency environment already provisioned:

```bash
env -i PATH="$PATH" HOME="$HOME" .venv/bin/python \
  ../../scripts/ops/compact-fee-xlsx.py \
  --archive /absolute/path/to/archived/corpus \
  --output /absolute/path/to/new/private/fee-diagnostic
```

The inspector uses normal loader eligibility and authoritative-artifact selection, requires exact registry joins and matching registry/native/sidecar hashes, and freezes all retained fee artifacts and exclusions. It copies registry and audit evidence into separate baseline/candidate trees. Original files remain read-only inputs. SQLite connections are immutable and read-only; pending WAL/journals are rejected. Network and inherited provider credentials are forbidden.

Every XLSX sheet records original row index and original/emitted width, formula/cache positions and merged ranges. An independent read ignoring declared worksheet dimensions hashes ordered populated native coordinates and existing-normalized values. Both the original rendering and candidate must retain every populated record. Native reconstruction must match the original cached body exactly. Understated dimensions or protected merged spans extending outside original rendered rows fail explicitly; this version does not repair malformed sources or hide failures with old parses.

`accounting.json` covers every selected artifact. Failures remove the affected candidate triplet, produce `failures.json`, and prevent a completion summary or variant seal. A successful run produces native proofs, a non-promotable summary, and per-variant manifests binding all JSON/Markdown/sidecar hashes, registry, inventory, native proofs and summary. Private proofs are large and are not public qualification evidence.

## Load and measure

Build a source-attested pipeline image from the reviewed commit and provision the pinned local Voyage tokenizer explicitly during setup/build. Runtime never downloads tokenizer assets. Use a dedicated **internal Docker network**, two new empty Neo4j containers named `fee-compaction-baseline` and `fee-compaction-candidate`, no published ports, and no provider credentials. Never reuse a developer or production graph.

For each variant run `scripts/ops/inspect-fee-compaction.py --variant baseline` (or `candidate`) inside the image with:

- `CORPUS_DATA_ROOT=/data`; the sealed variant tree bind-mounted at `/data:ro`.
- The archived corpus mounted at `/archive:ro` **and its original absolute path**, read-only. These must refer to the same archive.
- `inventory.json`, `staging-summary.json`, and `native-proofs.json` mounted at their corresponding root paths, read-only.
- Verified tokenizer assets at `/tokenizers:ro`, `EMBEDDING_TOKENIZER_DIR=/tokenizers`.
- A separate writable private receipt directory at `/output`.
- `NEO4J_URI=bolt://fee-compaction-baseline:7687` or the matching candidate URI, and only disposable graph credentials. Model/configuration must match reviewed `voyage-4`, 1024 dimensions.

The guard rejects unknown environment keys, wrong variants, modified files, incomplete proofs, writable input mounts and nonempty graphs. Only the named graph's Bolt socket is allowed. Normal `load_all("fee_schedule")` loads each tree; no embedding generator or evaluations run. Compare the document/section/relationship identity receipts exactly before interpreting metrics. The same shared contextual reader, planner and pinned tokenizer measure body bytes, planned inputs and local tokens in both graphs. Delete only task-owned containers/volumes/network after preserving receipts.

Both graphs carry `FeeCompactionDiagnostic` with `promotable=false` and `qualification=NOT_ASSESSED`. They cannot serve as release qualification. Reparsing changes the corpus snapshot and invalidates the old four scope approvals; registry copies preserve those rows without rebinding them. The 99-identity mixed-corpus catalog has no fee-schedule entries, so these graphs cannot establish 99/99 qualification. Projected full-corpus costs may add unchanged non-fee totals from the prerequisite's frozen inspection, and must be labelled projections rather than measured full-corpus runs.

No activation, merge, deployment, scope renewal, agency contact, provider spend, PDF padding changes, XLS conversion fixes or embedding-plan reconciliation is authorized by this lane.

## Follow-up: exact fee lookup

Typed relational rows and an exact lookup tool are the preferred next candidate for numeric fee questions. Start with offline layout profiling, then map the common layouts to procedure code, modifier, rate/unit, effective period and applicable provider/program fields. Store the original workbook hash, sheet and row/column coordinates alongside every mapped value; quarantine ambiguous layouts rather than guessing column meanings or dates.

An agent lookup tool needs policy-family routing and verifier support for cited rows, plus a fee-specific question set. The family is no longer embedded at all: it is a frozen archive ending 2 November 2022, loaded with status `archived` and reached only by a search that names the `fee_schedule` type, lexically (DATA-3). Unmapped sheets continue to require explicit handling. This is future work, not part of this diagnostic implementation or an approved rollout.

The completed [2026-10-04 diagnostic](../validation/fee-compaction-2026-10-04/README.md) records measured deltas, native preservation, dated cost projections and cleanup evidence.
