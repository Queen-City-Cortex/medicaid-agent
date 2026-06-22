---
children_hash: e7e309332f202a2cc64fe423d6b7492f7d3e637af38e88907ae03a7bb0bb34d1
compression_ratio: 0.36846689895470386
condensation_order: 1
covers: [curation_workflow_guardrails.md]
covers_token_total: 1148
summary_level: d1
token_count: 423
type: summary
---
## Curation Workflow Guardrails

This entry defines the durable operating rules for curation in the ByteRover RLM workflow. The core pattern is **recon → choose single-pass or chunked extraction → curate → verify via applied file paths**, with **UPSERT** as the preferred persistence operation.

### What the guardrails enforce
- Use the **RLM approach** with context, history, metadata, and task ID variables.
- If recon already exists and recommends **single-pass**, **skip chunking**.
- For chunked work, use **`tools.curation.mapExtract()`** with `taskId` passed as a **bare variable**.
- Any `code_exec` call containing `mapExtract` must set **`timeout: 300000`** on the tool call itself.
- Do **not** print raw context during curation.
- Do **not** call `tools.curation.recon()` again when recon has already been precomputed.
- Verify curation results using **`result.applied[].filePath`** instead of `readFile`.

### Content quality and preservation requirements
- Each curatable context must include:
  - a clear **task**
  - at least one of **changes / files / flow**
  - at least one **narrative** field
  - **2–4 sentences minimum**
- Preserve **exact rule text**, **regex patterns**, and all enumerated items verbatim.
- Keep curation outputs detailed enough to stand alone without rereading source material.

### Operational preference
- **UPSERT** is the default curation mode because it automatically handles add vs. update.
- Verification is file-path based, not content rereading, to keep the workflow efficient and deterministic.

### Drill-down
- See **facts/project/curated_context_snippet.md** for related curated context examples and project-specific snippet handling.