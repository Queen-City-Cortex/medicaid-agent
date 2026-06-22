---
title: Curation Workflow Guardrails
summary: Curation workflow guardrails covering RLM approach, single-pass recon guidance, mapExtract usage, context quality requirements, preservation rules, and verification expectations.
tags: []
related: [facts/project/curated_context_snippet.md]
keywords: []
createdAt: '2026-06-20T21:08:14.201Z'
updatedAt: '2026-06-21T19:06:45.216Z'
consolidated_at: '2026-06-21T19:22:03.923Z'
consolidated_from: [{date: '2026-06-21T19:22:03.923Z', path: facts/conventions/curation_workflow_guardrails.abstract.md, reason: 'These three files describe the same curation workflow guardrails topic at different fidelity levels. The main markdown file already contains the full durable content, while the abstract and overview are condensed summaries of the same material, so they are redundant and should be consolidated.'}, {date: '2026-06-21T19:22:03.923Z', path: facts/conventions/curation_workflow_guardrails.overview.md, reason: 'These three files describe the same curation workflow guardrails topic at different fidelity levels. The main markdown file already contains the full durable content, while the abstract and overview are condensed summaries of the same material, so they are redundant and should be consolidated.'}]
---
## Reason
Capture durable curation workflow rules and constraints from the provided context

## Raw Concept
**Task:**
Curate curation workflow guardrails and RLM approach expectations

**Changes:**
- Use recon before extraction when assessing curatable context
- Prefer single-pass curation when recon recommends it
- Do not print raw context during curation
- Verify applied writes using result.applied[].filePath
- Recorded verification and extraction conventions
- Documented single-pass guidance for precomputed recon results
- Captured chunked extraction requirements for mapExtract
- Recorded verification and content preservation constraints

**Files:**
- .brv/context-tree/facts/conventions/curation_workflow_guardrails.md

**Flow:**
recon -> choose single-pass or chunked extraction -> curate -> verify via applied file paths

**Timestamp:** 2026-06-21T19:06:31.605Z

**Author:** ByteRover context engineer

## Narrative
### Structure
These guardrails define how curation should be executed, including the required sandbox variable usage, extraction path selection, and post-curation verification steps.

### Dependencies
Depends on precomputed recon data, tools.curation.mapExtract for chunked contexts, and tools.curate for UPSERT-based persistence.

### Highlights
The context explicitly says not to print raw context, not to call tools.curation.recon again, and to proceed directly to extraction. It also emphasizes preserving exact rules, patterns, and all enumerated items.

### Rules
Do NOT print raw context. Do NOT call tools.curation.recon — it has been pre-computed. Proceed directly to extraction. For chunked extraction use tools.curation.mapExtract(). Pass taskId as a bare variable, not a string. IMPORTANT: Any code_exec call containing mapExtract MUST use timeout: 300000 on the code_exec tool call itself (not inside mapExtract options). Verify via result.applied[].filePath — do NOT call readFile for verification.

### Examples
Use recon metadata to decide single-pass handling when suggestedMode is single-pass. In verification, inspect applied file paths instead of re-reading files.

## Facts
- **curation_rlm_approach**: Curation tasks use the RLM approach with context, history, metadata, and task ID variables. [convention]
- **single_pass_mode**: When recon is already computed and suggestedMode is single-pass, chunking should be skipped. [convention]
- **map_extract_task_id**: For chunked extraction, tools.curation.mapExtract() should be used with the taskId passed as a bare variable. [convention]
- **map_extract_timeout**: Code_exec calls containing mapExtract must use timeout: 300000 on the tool call itself. [convention]
- **verification_method**: Verification for curation should use result.applied[].filePath and not readFile. [convention]
- **context_quality_requirements**: Context quality requires a clear task, at least one of changes/files/flow, at least one narrative field, and minimum 2-4 sentences per context. [convention]
- **content_preservation_rules**: When curation content includes rules or patterns, exact rule text and regex patterns must be preserved verbatim. [convention]
- **upsert_preference**: UPSERT is the preferred curation operation because it auto-detects add versus update. [convention]


## Cross References
- facts/project/curated_context_snippet.md