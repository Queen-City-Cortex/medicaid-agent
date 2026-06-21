---
title: Curated Operational Knowledge
summary: Session-level curation workflow using precomputed recon and single-pass UPSERT verification
tags: []
related: [agent_architecture/packages_pipeline/retrieval_fixes.md, frontend_ui/message_persistence_parsing/message_persistence_parsing.md, agent_architecture/context.md, agent_architecture/context/context.md, agent_architecture/context/curated_context_extraction_notes.md]
keywords: []
createdAt: '2026-06-12T05:52:52.426Z'
updatedAt: '2026-06-13T03:40:01.385Z'
---
## Reason
Capture the RLM curation workflow and session metadata as durable operational knowledge

## Raw Concept
**Task:**
Document the curated context from this session.

**Changes:**
- Context includes durable operational knowledge about retrieval heuristics, message parsing behavior, and curation workflow preferences.
- Extracted curated facts, rules, and implementation details from the source context
- # indexes and `test:`-prefixed fixtures and mocks the embedding API, so
- # failed on a workspace-source import that tsc and vitest resolved fine,

**Files:**
- .github/workflows/ci.yml
- e2e/tests/auth.setup.ts
- packages/pipeline/pyproject.toml

**Flow:**
recon -> extraction -> dedup/group -> UPSERT curate -> verify applied file paths

**Timestamp:** 2026-06-13

**Author:** ByteRover context engineer

## Narrative
### Structure
This entry captures the session-level curation workflow and the compact metadata available for the task. The source material was small enough to use single-pass processing instead of chunking.

### Dependencies
Depends on the precomputed recon result, the provided context variable, and the curation history metadata for proper bookkeeping.

### Highlights
The context was curated without printing raw source text. Verification is based on applied file paths rather than rereading files.

## Facts
- **curation_mode**: This curated context was processed in single-pass mode. [project]
- **context_size**: The source context is 5100 characters across 124 lines with zero messages. [project]
- **curation_task**: The task was to curate using the RLM approach. [project]
