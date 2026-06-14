---
title: Curated Context Snippet
summary: Curated extracted project and process facts from the provided context snippet.
tags: []
related: []
keywords: []
createdAt: '2026-06-13T06:00:50.089Z'
updatedAt: '2026-06-14T20:00:22.278Z'
---
## Reason
Preserve extracted project facts from the provided context

## Raw Concept
**Task:**
Curate extracted facts and process details from the provided context snippet

**Changes:**
- Defined a two-part context model using rawConcept and narrative fields
- Specified facts extraction and temporal preservation requirements
- Documented UPSERT-based curation workflow and verification expectations
- Captured salient statements from the context
- Stored them as durable knowledge facts

**Flow:**
context input -> statement extraction -> fact curation -> durable storage

**Timestamp:** 2026-06-14T20:00:04.864Z

**Author:** ByteRover context engineer

## Narrative
### Structure
A compact knowledge entry for preserving extracted statements from the current context.

### Dependencies
Curation depends on accurate source extraction, preserved timestamps, and traceable file or document references.

### Highlights
Designed to keep useful project/process statements available for later recall.

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

## Facts
- **curation_context**: - Use this content to understand the context and create comprehensive knowledge topics [other]
- **curation_context**: - DO NOT use read_file tool for the files above - the content is already provided [other]

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
