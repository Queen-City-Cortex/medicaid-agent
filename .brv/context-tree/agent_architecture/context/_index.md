---
children_hash: 5902289156780e79df1478f3c25811a751fb30876cb791b48cad51aa1229aa8b
compression_ratio: 0.5348997926744989
condensation_order: 1
covers: [context.md, curated_context_extraction_notes.md, curated_operational_knowledge.md, epsdt_exception_completeness_workstream_e.md]
covers_token_total: 1447
summary_level: d1
token_count: 774
type: summary
---
# context

## Structural overview
This set of entries documents the **RLM curation workflow** for turning provided context into durable knowledge, with an emphasis on **single-pass processing**, **precomputed recon**, and **verification through curate results**.

## Core topics

- **context.md**
  - Defines the topic as operational notes for curating a single-pass RLM context with precomputed recon data.
  - Key concepts:
    - single-pass processing
    - precomputed recon
    - curation verification
    - context size metadata
  - Serves as the umbrella entry for the curation workflow notes in this area.

- **curated_context_extraction_notes.md**
  - Authoritative record for the current curation session after consolidation from `curated_context.md`.
  - Preserves:
    - curation metadata
    - recon recommendation
    - detected source references
    - extracted source context
  - Important facts:
    - context size: **19883 characters**, **520 lines**, **0 messages**
    - recon recommended **single-pass mode**
    - suggested chunk count: **3**
  - Related source files referenced:
    - `packages/agent/src/feedback/repository.ts`
    - `packages/agent/src/index.ts`
  - Workflow captured:
    - context provided -> recon precomputed -> extract key facts -> upsert curated knowledge

- **curated_operational_knowledge.md**
  - Session-level operational knowledge entry focused on curation workflow preferences and related implementation details.
  - Preserves a compact record of:
    - retrieval heuristics
    - message parsing behavior
    - curation workflow preferences
  - Important facts:
    - curation mode: **single-pass**
    - context size: **5100 characters**, **124 lines**, **0 messages**
    - task: curate using the RLM approach
  - Related entries:
    - `agent_architecture/context/context.md`
    - `agent_architecture/packages_pipeline/retrieval_fixes.md`
    - `frontend_ui/message_persistence_parsing/message_persistence_parsing.md`

- **epsdt_exception_completeness_workstream_e.md**
  - Smaller curated entry documenting **EPSDT exception completeness (Workstream E)**.
  - Captures the core workflow:
    - source context -> fact extraction -> durable knowledge entry
  - Linked back to `agent_architecture/context/context.md` as related context.

## Shared patterns across entries

- All entries are **curated knowledge records** intended for durable recall.
- The workflow consistently follows:
  - **recon / context analysis**
  - **fact extraction**
  - **UPSERT-based curation**
  - **verification via applied file paths**
- The entries emphasize avoiding raw-context dumping and preserving only the stable operational facts.

## Drill-down guidance

- For the **general workflow and topic framing**, start with `context.md`.
- For the **current detailed curation session**, read `curated_context_extraction_notes.md`.
- For **session-level operational knowledge and related implementation references**, read `curated_operational_knowledge.md`.
- For the **EPSDT workstream-specific record**, read `epsdt_exception_completeness_workstream_e.md`.