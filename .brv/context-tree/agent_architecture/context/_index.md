---
children_hash: 3e49c9a319930c9a5682bf4a4805c574096f2c2175efb3a4da18e663f65ba171
compression_ratio: 0.5946531791907514
condensation_order: 1
covers: [context.md, curated_context_extraction_notes.md, curated_operational_knowledge.md, epsdt_exception_completeness_workstream_e.md]
covers_token_total: 1384
summary_level: d1
token_count: 823
type: summary
---
# agent_architecture/context — Structural Summary

This d1 topic captures operational knowledge for curation workflows under `agent_architecture/context`, centered on single-pass RLM processing, precomputed recon data, and durable recall of extracted context.

## Core entries

- **context.md**  
  Provides the top-level overview for the topic: operational notes for curating a single-pass RLM context with precomputed recon data. Key ideas are:
  - single-pass processing
  - precomputed recon
  - curation verification
  - context size metadata  
  It is the anchor entry for drilling into the workflow-oriented notes below.

- **curated_context_extraction_notes.md**  
  Documents the extraction workflow used to turn compact source context into durable agent-architecture knowledge. It records:
  - curation metadata capture
  - recon recommendation preservation
  - source reference detection
  - organized extraction into durable knowledge
  - EPSDT exception completeness workstream context  
  Structural emphasis: this note says the context was small enough for **single-pass** curation, and verification should use `result.applied[].filePath` rather than rereading source files. It also preserves facts about context size and structure.

- **curated_operational_knowledge.md**  
  Captures session-level curation workflow and operational preferences. It connects the topic to broader durable knowledge about:
  - retrieval heuristics
  - message parsing behavior
  - curation workflow preferences  
  The recorded flow is: `recon -> extraction -> dedup/group -> UPSERT curate -> verify applied file paths`. This entry also notes the context was compact enough for single-pass processing and that verification is based on applied file paths.

- **epsdt_exception_completeness_workstream_e.md**  
  A focused workstream-specific entry for **EPSDT exception completeness (Workstream E)**. It preserves the original context as durable knowledge with a simple structure:
  - task documentation
  - fact preservation
  - durable recall entry  
  This file is the drill-down point for workstream-specific operational details.

## Relationships

- `context.md` links structurally to:
  - `curated_operational_knowledge.md`
  - `epsdt_exception_completeness_workstream_e.md`
- `curated_operational_knowledge.md` also references related entries in:
  - `agent_architecture/packages_pipeline/retrieval_fixes.md`
  - `frontend_ui/message_persistence_parsing/message_persistence_parsing.md`
  - `agent_architecture/context.md`
  - `agent_architecture/context/context.md`

## Shared patterns across entries

- All entries emphasize **durable knowledge capture** from compact source context.
- **Single-pass processing** is the recurring operational choice when context is small enough.
- **Verification** is consistently tied to applied output paths, not raw source rereading.
- The topic preserves both **workflow mechanics** and **context-specific facts** for later recall.

## Drill-down guide

- For the overall topic framing: **context.md**
- For extraction workflow and metadata handling: **curated_context_extraction_notes.md**
- For session-level operational workflow: **curated_operational_knowledge.md**
- For EPSDT workstream specifics: **epsdt_exception_completeness_workstream_e.md**