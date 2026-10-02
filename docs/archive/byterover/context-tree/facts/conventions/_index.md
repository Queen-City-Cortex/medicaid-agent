---
children_hash: b3275003d382bdd84c14af84bc62c19626cd17a0b9dbd2c8a5de0e5a28b13ff9
compression_ratio: 0.7693877551020408
condensation_order: 1
covers: [context.md, curation_workflow_guardrails.md]
covers_token_total: 490
summary_level: d1
token_count: 377
type: summary
---
# facts/conventions

Operational guardrails for durable knowledge curation into the context tree, centered on the recon/extract/curate/verify RLM workflow.

## Core structure and scope
- The domain captures **curation workflow discipline** and the rules needed to maintain context-tree quality.
- It is anchored by two child entries:
  - **`context.md`** — high-level overview of conventions and workflow concepts.
  - **`curation_workflow_guardrails.md`** — detailed execution guardrails and verification rules.

## Key workflow pattern
- The standard flow is **recon -> extraction -> curate -> verify**.
- **UPSERT-first curation** is the default approach.
- When recon recommends it, the workflow can be handled in **single-pass** mode instead of chunked processing.

## Preserved curation rules
- Do **not print raw context** during curation.
- Use **`tools.curation.mapExtract()`** for chunked extraction when needed.
- Pass **`taskId` as a bare variable**, not a quoted string.
- Verification should use **`result.applied[].filePath`**.
- Do **not** rely on rereading files for verification.
- Do **not** call **`tools.curation.recon()`** if recon has already been computed.

## Knowledge modeling emphasis
- The topic explicitly preserves:
  - fact extraction
  - content preservation
  - context-tree structure limits
  - verification discipline
- Drill down into **`curation_workflow_guardrails.md`** for the exact execution constraints and into **`context.md`** for the broader conventions summary.