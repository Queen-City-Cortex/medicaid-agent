---
title: Curated Context Snippet
summary: Curated a context snippet and preserved the curation-run metadata as durable knowledge.
tags: []
related: []
keywords: []
createdAt: '2026-06-13T06:00:50.089Z'
updatedAt: '2026-06-19T17:10:10.729Z'
---
## Reason
Persist extracted facts and context from the provided curation payload

## Raw Concept
**Task:**
Curate the provided context into durable knowledge

**Changes:**
- Captured the current context size and line count
- Recorded the recon recommendation for single-pass processing
- Extracted context-backed statements for long-term recall
- Captured the curation run metadata
- Stored a concise extracted fact

**Flow:**
context input -> extraction -> curated knowledge

**Timestamp:** 2026-06-19T17:10:10.727Z

**Author:** ByteRover context engineer

## Narrative
### Structure
This entry records a compact curation result derived from the supplied context payload.

### Dependencies
Uses the precomputed recon result and current curation variables.

### Highlights
The run used a precomputed single-pass recon path and was curated without reading raw context verbatim.

### Examples
Stored extracted facts as durable knowledge.

## Facts
- **curation_run**: Context curated from precomputed single-pass extraction [other]

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
