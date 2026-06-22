---
title: Curated Context Snippet
summary: Curated snippet of operational knowledge and findings from the provided context into durable project facts.
tags: []
related: []
keywords: []
createdAt: '2026-06-13T06:00:50.089Z'
updatedAt: '2026-06-18T02:22:26.499Z'
---
## Reason
Preserve extracted operational notes from the provided context

## Raw Concept
**Task:**
Curate operational knowledge from the provided context snippet into durable project facts.

**Changes:**
- Captured the current context size and line count
- Recorded the recon recommendation for single-pass processing
- Extracted context-backed statements for long-term recall

**Flow:**
context snippet -> fact extraction -> durable knowledge entry

**Timestamp:** 2026-06-18

**Author:** ByteRover context engineer

## Narrative
### Structure
A compact project-facts entry capturing the most reusable statements from the provided snippet.

### Dependencies
Uses the precomputed recon result and current curation variables.

### Highlights
Preserves operational notes as structured facts for later retrieval.

### Examples
Stored extracted facts as durable knowledge.

## Facts
- **curated_context_snippet**: `scoreCoverageSections(...)` [project]
- **curated_context_snippet**: `collectCoverageSectionGroups(...)` [project]
- **curated_context_snippet**: Deduplication uses `uniqueBy(section.id)`. [project]
- **curated_context_snippet**: `buildCoverageAnchors(...)` [project]
- **curated_context_snippet**: `assembleCoverageSections(...)` [project]
- **curated_context_snippet**: `selectCoveragePrimarySections(...)` [project]

---

## Eval OpenAI key isolation

**Changes:**
- Extracted from curated context input

**Flow:**
context -> extract lines -> curate facts

**Timestamp:** 2026-06-13T06:00:42.089Z


## Consolidated Knowledge
This document records project curation rules for preserving durable knowledge, emphasizing structured context fields, exact fact and timestamp retention, UPSERT-based updates, and verification of applied results.

Project-level curation notes for preserving durable knowledge from context snippets and source material.
Defines a two-part context model with `rawConcept` and `narrative`, and requires facts extraction plus temporal preservation.
Describes a workflow of recon -> extract salient facts/context -> curate using UPSERT -> verify applied files and failures.
Emphasizes strict structure rules: include a clear task, at least one operational detail (`changes`, `files`, or `flow`), and at least one narrative field.
Key constraints include preserving exact rule text, regex patterns, timestamps, and avoiding vague contexts or nested subtopics.
Verification guidance references checking `result.summary.failed` and `result.applied` file paths.
Notable entities/patterns include ByteRover context engineer, `rawConcept`, `narrative`, `changes`, `files`, `flow`, and a `curation_input` facts entry.
