---
title: Curated Context Extraction Notes
summary: Notes on context curation workflow, extraction results, and relevant file references for the current task
tags: []
related: []
keywords: []
createdAt: '2026-06-13T05:42:43.392Z'
updatedAt: '2026-06-13T05:42:43.392Z'
consolidated_at: '2026-06-13T05:58:01.330Z'
consolidated_from: [{date: '2026-06-13T05:58:01.330Z', path: agent_architecture/context/curated_context.md, reason: 'Both files document the same single-pass curation session and largely overlap in purpose, workflow, and metadata. The extraction notes are richer, so they should become the authoritative record, with unique details from the shorter curated_context file preserved in the merge.'}]
---
## Reason
Preserve extracted facts and curation workflow notes from the provided context

## Raw Concept
**Task:**
Curate the provided RLM context into durable knowledge

**Changes:**
- Captured curation metadata
- Recorded the recon recommendation
- Preserved detected source references
- Extracted and organized source context into durable knowledge

**Files:**
- packages/agent/src/feedback/repository.ts
- packages/agent/src/index.ts

**Flow:**
context provided -> recon precomputed -> extract key facts -> upsert curated knowledge

**Timestamp:** 2026-06-13T05:42:33.408Z

**Author:** ByteRover context engineer

## Narrative
### Structure
This entry records the current curation session, its size characteristics, and the recommended single-pass processing mode. It also serves as the durable record of the earlier curated context snapshot.

### Dependencies
Relies on the supplied context, history, and metadata variables plus the pre-computed recon result.

### Highlights
The context can be curated without chunking because recon classified it as single-pass. The task emphasizes not printing raw context and verifying via curate result file paths. Single-pass curation completed for the current context snapshot (lines: 83).

### Examples
Use the pre-computed recon result, avoid calling recon again, and verify applied outputs through result.applied[].filePath.

## Facts
- **curation_workflow**: The current curation task uses the RLM approach with a pre-computed recon result. [other]
- **context_size**: The provided context is 19883 characters long with 520 lines and 0 messages. [other]
- **recon_mode**: The pre-computed recon result recommended single-pass mode with suggestedChunkCount 3. [other]