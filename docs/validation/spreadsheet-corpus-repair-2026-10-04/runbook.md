# Offline spreadsheet corpus repair (archived)

> **Archived with the evidence; not an active procedure.** Copied unchanged from commit `ecefc0b` of closed PR #206. The scripts it names (`repair-spreadsheet-corpus.py`, `inspect-repaired-corpus.py`) and cache v7 are not on `main`. For the current procedure see [fee-schedule compaction](../../operations/fee-schedule-compaction.md).

Repair preserves the input corpus and writes a complete private copy. It neither imports replacements into production nor generates embeddings. Cache v7 removes trailing empty normalized XLS/XLSX cells before row joining; internal column positions and existing value conversion stay unchanged. Hash-verified non-spreadsheet outputs can migrate without OCR, while spreadsheets must regenerate.

Run from a clean checkout with the frozen pipeline environment provisioned. Keep manifests, drafts, corpus artifacts and credentials outside Git. Use new private paths, mode 0700 directories and 0600 files:

```bash
python scripts/ops/repair-spreadsheet-corpus.py --input-root "$ORIGINAL_CORPUS" --manifest "$PRIVATE_RUN/sealed-repair.json" --seal
python scripts/ops/repair-spreadsheet-corpus.py --input-root "$ORIGINAL_CORPUS" --manifest "$PRIVATE_RUN/sealed-repair.json" --output-root "$PRIVATE_RUN/repair"
```

The first command checks the checkpointed registry, original hashes and canonical eligible parses, inventories exclusions, and seals all input files/timestamps and parser source files. The second refuses existing output or source/output overlap, preserves original timestamps, independently binds workbook cell coordinates and exact legacy/compact rendering, and checkpoints each repaired artifact. It checks every unselected file and the complete original snapshot afterward. On macOS copying uses APFS clones; it never uses hard links. Other platforms use independent copies. Repair blocks network connections and suppresses repository dotenv loading.

Resume a stopped repair with the same paths, manifest and code by adding `--resume`. Changed source files, code, completed artifact hashes or another manifest fail closed. A failed attempt remains evidence; never overwrite its receipts. Early copy failures require a new output directory.

`inspect-repaired-corpus.py` runs only inside the pinned Linux pipeline image on an internal Docker network. Its only permitted graph is `bolt://spreadsheet-repair-neo4j:7687`, database `neo4j`, with a generated disposable password and no provider credentials. Mount the repaired corpus at `/data` and at the original sidecar corpus path read-only; mount the frozen inspection checkout at `/frozen`, the pinned tokenizer module at `/tokenizer-code.py`, the tokenizer assets read-only, and sealed inputs at `/inputs.json`. Use a fresh writable `/output` for every build/measurement.

The sealed inputs contain every repaired corpus file hash, inspection module hashes, tokenizer module and harness hashes, original corpus root, semantic source snapshot and archived federal cache hashes. `--mode build` requires an empty graph, loads all families plus archived federal content, builds references/concepts without LLM assistance, and verifies exact canonical state-document/section content, independently recomputed sectionless clinical revision notices and benchmark mappings. It records stale scope approvals; it does not override production approval logic. The graph marker is `CorpusRepairPreparation` with `promotable=false` and no generated vectors.

`--mode measure --planner token` uses the frozen #199 planner; `--planner byte` uses the frozen #204 implementation. Both count complete contextual inputs with the same reviewed local Voyage tokenizer. Keep separate module attestations and output directories, and require two identical full measurements per planner. Inputs must reconstruct section bodies exactly and satisfy token/byte bounds. Recorded pricing is for planning; refresh it and authorize/enforce a campaign cap before provider calls.

Preserve the repaired corpus, graph/dump, immutable selection manifest, raw receipts and failed attempts in durable encrypted storage before removing owned resources. Existing source freshness, scope qualification, missing-payload and evaluation-access blockers remain visible. No repair or offline measurement constitutes release acceptance.
