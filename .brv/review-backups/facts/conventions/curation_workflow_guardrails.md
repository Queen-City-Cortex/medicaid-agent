---
title: Curation Workflow Guardrails
summary: Curation guardrails covering recon-first workflow, single-pass handling, no raw context printing, and verification via applied file paths
tags: []
related: []
keywords: []
createdAt: '2026-06-20T21:08:14.201Z'
updatedAt: '2026-06-20T21:08:14.201Z'
---
## Reason
Capture curation execution constraints and verification rules from the provided context

## Raw Concept
**Task:**
Document the required curation workflow and guardrails for RLM-based context processing.

**Changes:**
- Use recon before extraction when assessing curatable context
- Prefer single-pass curation when recon recommends it
- Do not print raw context during curation
- Verify applied writes using result.applied[].filePath

**Flow:**
recon -> extraction -> curate -> verify

**Timestamp:** 2026-06-20T21:08:02.111Z

## Narrative
### Structure
This note captures execution guardrails and the recommended curation flow for RLM-based context processing.

### Dependencies
Depends on the precomputed recon result, the context/history/metadata variables, and the curate result summary for verification.

### Highlights
The workflow is explicitly single-pass for this context and requires verification through applied file paths rather than file rereads.

### Rules
Do NOT print raw context. Do NOT call tools.curation.recon when recon has already been computed. For chunked extraction use tools.curation.mapExtract(). Pass taskId as a bare variable, not a string. Verify via result.applied[].filePath and do NOT call readFile for verification.
