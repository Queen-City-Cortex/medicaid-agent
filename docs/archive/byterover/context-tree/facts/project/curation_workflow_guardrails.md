---
title: Curation Workflow Guardrails
summary: 'Guardrails for RLM-based curation: recon already computed, single-pass preferred for small contexts, use mapExtract when chunked, curate with UPSERT, and verify success from applied file paths.'
tags: []
related: []
keywords: []
createdAt: '2026-07-10T19:51:06.944Z'
updatedAt: '2026-07-10T19:51:06.944Z'
---
## Reason
Capture durable curation workflow rules, RLM approach, and execution constraints from the provided context.

## Raw Concept
**Task:**
Document curation workflow guardrails and execution constraints for RLM-based context engineering

**Changes:**
- Single-pass extraction recommended for the provided context size
- Recon was already computed and should not be repeated
- Use mapExtract only when chunked extraction is needed
- Verify curation via applied file paths instead of rereading files

**Flow:**
recon -> extract facts -> dedupe/group -> curate -> verify applied file paths

**Timestamp:** 2026-07-10T19:50:48.288Z

**Author:** ByteRover context engineering workflow

## Narrative
### Structure
This knowledge captures the operational rules for curating context with the RLM approach, including how to treat single-pass versus chunked contexts.

### Dependencies
Depends on tools.curation.recon, tools.curation.mapExtract, tools.curation.dedup, tools.curation.groupBySubject, and tools.curate.

### Highlights
Preserves the instruction to avoid printing raw context, avoid extra verification reads, and use the provided taskId when extracting.

### Rules
Do NOT print raw context. Do NOT call tools.curation.recon when recon has already been pre-computed. For chunked extraction use tools.curation.mapExtract(). Pass taskId as a bare variable, not a string. Verify via result.applied[].filePath — do NOT call readFile for verification.
