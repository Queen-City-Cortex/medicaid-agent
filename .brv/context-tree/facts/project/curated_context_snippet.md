---
title: Curated Context Snippet
summary: Project-level curation notes covering context preservation, fact extraction, preservation rules, and structured knowledge modeling.
tags: []
related: []
keywords: []
createdAt: '2026-06-13T06:00:50.089Z'
updatedAt: '2026-06-13T19:57:01.033Z'
consolidated_at: '2026-06-13T20:12:19.979Z'
consolidated_from: [{date: '2026-06-13T20:12:19.979Z', path: facts/project/curated_context_snippet.abstract.md, reason: 'All three files document the same project-level curation knowledge. The main markdown file already contains the richest content, while the abstract and overview are redundant summaries of the same rules, workflow, and facts-preservation guidance.'}, {date: '2026-06-13T20:12:19.979Z', path: facts/project/curated_context_snippet.overview.md, reason: 'All three files document the same project-level curation knowledge. The main markdown file already contains the richest content, while the abstract and overview are redundant summaries of the same rules, workflow, and facts-preservation guidance.'}]
---
## Reason
Preserve project facts and curation guidance from the provided context snippet

## Raw Concept
**Task:**
Curate a context-engineering reference for preserving and organizing durable knowledge from snippets and source material.

**Changes:**
- Defined a two-part context model using rawConcept and narrative fields
- Specified facts extraction and temporal preservation requirements
- Documented UPSERT-based curation workflow and verification expectations

**Flow:**
recon -> extract facts and context -> curate with UPSERT -> verify applied files

**Timestamp:** 2026-06-13T19:56:51.482Z

**Author:** ByteRover context engineer

## Narrative
### Structure
Knowledge should be organized into domain/topic/subtopic context files with at least a task, one operational detail, and one descriptive narrative field.

### Dependencies
Curation depends on accurate source extraction, preserved timestamps, and traceable file or document references.

### Highlights
Prefer UPSERT for creates/updates, preserve exact rules and regex patterns verbatim, and use standalone facts domains for uncategorized personal, project, or convention facts.

### Rules
1. Always include a clear task in rawConcept.
2. Include at least one of changes, files, or flow in rawConcept.
3. Include at least one narrative field.
4. Preserve exact rule text, regex patterns, and temporal information.
5. Use UPSERT by default instead of ADD or UPDATE.
6. Do not create vague contexts or nested subtopics.
7. Verify curate results by checking result.summary.failed and result.applied file paths.

### Examples
Stored extracted facts as durable knowledge.

---

## Eval OpenAI key isolation

**Changes:**
- Extracted from curated context input

**Flow:**
context -> extract lines -> curate facts

**Timestamp:**
2026-06-13T06:00:42.089Z

### Overview
- Project-level curation notes for preserving durable knowledge from context snippets and source material.
- Describes a two-part context model using `rawConcept` and `narrative`, plus requirements for facts extraction and temporal preservation.
- Defines a curation workflow: recon -> extract facts/context -> curate with UPSERT -> verify applied files.
- Emphasizes structure: organize knowledge into domain/topic/subtopic files with at least a task, one operational detail, and one descriptive narrative field.
- Key rules include preserving exact rule text, regex patterns, timestamps, and using UPSERT by default instead of ADD/UPDATE.
- Verification guidance mentions checking `result.summary.failed` and `result.applied` file paths after curation.
- Notable entities/patterns: ByteRover context engineer, `rawConcept`, `narrative`, `changes`, `files`, `flow`, and standalone facts domains for uncategorized facts.

### Abstract
This document records project curation rules for preserving durable knowledge, emphasizing structured context fields, exact fact and timestamp retention, UPSERT-based updates, and verification of applied results.