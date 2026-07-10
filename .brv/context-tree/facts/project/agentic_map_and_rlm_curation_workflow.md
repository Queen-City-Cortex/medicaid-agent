---
title: Agentic Map and RLM Curation Workflow
summary: RLM curation workflow requires recon first, single-pass when suggested, mapExtract for chunked contexts, dedup/grouping of extracted facts, UPSERT-based curation, and verification via applied file paths.
tags: []
related: []
keywords: []
createdAt: '2026-07-10T02:17:09.970Z'
updatedAt: '2026-07-10T02:17:09.970Z'
---
## Reason
Capture the curation workflow requirements and execution constraints from the provided RLM instructions.

## Raw Concept
**Task:**
Document the required RLM curation workflow for this task.

**Changes:**
- Use the precomputed recon result instead of recomputing it.
- Proceed directly to extraction in single-pass mode.
- Use mapExtract only for chunked contexts, with the required timeout on the outer code_exec call.
- Verify curated files using applied file paths.

**Flow:**
recon already computed -> choose single-pass or chunked extraction -> dedup/group facts if needed -> UPSERT curate -> verify applied file paths

**Timestamp:** 2026-07-10T02:16:53.267Z

## Narrative
### Structure
This instruction block defines the curation execution path, including recon, extraction, deduplication, curation, and verification constraints.

### Dependencies
Depends on the precomputed recon result and the context/history/metadata/task variables supplied by the caller.

### Highlights
Single-pass was suggested for the provided 1123-character context. The instructions emphasize not printing raw context and not calling recon again.

### Rules
IMPORTANT: Do NOT print raw context. Do NOT call tools.curation.recon — it has been pre-computed. Proceed directly to extraction. For chunked extraction use tools.curation.mapExtract(). Pass taskId as a bare variable, not a string. Verify via result.applied[].filePath — do NOT call readFile for verification.

## Facts
- **curation_mode**: Recon had already been computed for this curation task with suggestedMode single-pass and suggestedChunkCount 1. [project]
- **mapextract_timeout**: When mapExtract is used, the code_exec call containing mapExtract must use timeout 300000 on the tool call itself. [convention]
- **verification_method**: Verification of curation should be done via result.applied[].filePath and not by calling readFile. [convention]
- **curation_operation_preference**: The curation workflow prefers UPSERT and uses tools.curation.dedup() and tools.curation.groupBySubject() to organize extractions. [convention]
