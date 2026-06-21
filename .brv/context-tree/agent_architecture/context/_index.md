---
children_hash: 97b7da453a336884875f99e65c3638ce674d9859690d808175655d11d9d3319b
compression_ratio: 0.5317401045556386
condensation_order: 1
covers: [context.md, curated_context_extraction_notes.md, curated_operational_knowledge.md, epsdt_exception_completeness_workstream_e.md]
covers_token_total: 1339
summary_level: d1
token_count: 712
type: summary
---
# Structural Summary: context

This level groups session-level curation knowledge around the RLM single-pass workflow and related durable notes. The entries collectively preserve how precomputed recon, extraction, and UPSERT-based verification were used to turn supplied context into long-lived operational knowledge.

## Core Workflow Pattern
- **`context.md`** establishes the central pattern: **single-pass processing**, driven by **precomputed recon**, with **curation verification** and **context size metadata** as key inputs.
- The workflow emphasized avoiding unnecessary chunking when recon already recommends single-pass handling.

## Session Curation Notes
- **`curated_context_extraction_notes.md`** records the curation session for the supplied context, including:
  - detected source references,
  - curation metadata,
  - the recon recommendation,
  - and the instruction to verify applied outputs via `result.applied[].filePath`.
- It explicitly notes the context was **19883 characters / 520 lines / 0 messages** and recon recommended **single-pass mode** with **suggestedChunkCount 3**.
- Drill down here for the most explicit operational notes about the current curation pass.

## Durable Operational Knowledge
- **`curated_operational_knowledge.md`** captures session-level durable knowledge about:
  - retrieval heuristics,
  - message parsing behavior,
  - and the preferred curation workflow.
- It documents the execution pattern as: **recon -> extraction -> dedup/group -> UPSERT curate -> verify applied file paths**.
- The source context was small enough for **single-pass processing** rather than chunking.
- It also preserves that verification should rely on **applied file paths** instead of rereading files.
- Related drill-down topics include:
  - **`agent_architecture/packages_pipeline/retrieval_fixes.md`**
  - **`frontend_ui/message_persistence_parsing/message_persistence_parsing.md`**
  - **`agent_architecture/context.md`**
  - **`agent_architecture/context/context.md`**
  - **`agent_architecture/context/curated_context_extraction_notes.md`**

## Workstream-Specific Context
- **`epsdt_exception_completeness_workstream_e.md`** is a focused curated entry for **EPSDT exception completeness (Workstream E)**.
- It preserves the minimal operational structure:
  - source context,
  - fact extraction,
  - durable knowledge entry.
- This entry is a lighter-weight record than the other two and serves as a drill-down anchor for workstream-specific context.

## Shared Themes
Across these entries, the recurring structural patterns are:
- **precomputed recon** as the decision point for processing mode,
- **single-pass curation** when context is compact enough,
- **durable knowledge capture** instead of ephemeral chat memory,
- and **verification by curated output paths** rather than reinspection of raw text.