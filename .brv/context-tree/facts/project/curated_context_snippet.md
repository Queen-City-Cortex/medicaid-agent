---
title: Curated Context Snippet
summary: Project curation guidance for extracting facts, preserving context quality, and using the RLM workflow.
tags: []
related: []
keywords: []
createdAt: '2026-06-13T06:00:50.089Z'
updatedAt: '2026-06-19T18:11:51.591Z'
---
## Reason
Preserve curated context extraction notes and project-wide curation guidance from the provided context.

## Raw Concept
**Task:**
Document the project-wide curation instructions and extraction guidance contained in the provided context.

**Changes:**
- Captured the current context size and line count
- Recorded the recon recommendation for single-pass processing
- Extracted context-backed statements for long-term recall
- Captured the curation run metadata
- Stored a concise extracted fact
- Recorded the recommended curation sequence for RLM mode
- Captured taskId and timeout requirements for mapExtract
- Preserved context-tree structure and UPSERT preference
- Defined the RLM curation workflow and verification expectations
- Specified context tree organization and naming constraints
- Outlined quality requirements for durable context entries
- Preserved the preference for UPSERT-based updates

**Files:**
- .brv/context-tree/

**Flow:**
recon -> single-pass assessment -> extraction if needed -> curate via UPSERT -> verify applied file paths

**Timestamp:** 2026-06-19T18:11:39.332Z

**Author:** ByteRover context engineering guidance

## Narrative
### Structure
The guidance covers curation workflow, context tree structure, tool selection, and content quality requirements for durable knowledge entries.

### Dependencies
Depends on the context tree under .brv/context-tree/ and the curated workflow helpers exposed in the sandbox.

### Highlights
Preserves the rules for not printing raw context, using UPSERT by default, extracting facts, and validating applied file paths after curation.

### Rules
Do not print raw context. Do not ask for confirmation. Do not use MERGE to update content. Verify result.summary.failed === 0.

### Examples
Examples include preserving file paths, timestamps, exact rules, regex patterns, and meaningful narrative details when curating.

## Facts
- **curation_workflow**: Curation should use the RLM approach with recon, extraction, curate, and verification. [convention]
- **context_tree_depth**: The context tree uses a domain -> topic -> subtopic hierarchy with a maximum depth of 2 levels. [convention]
- **curate_operation_preference**: UPSERT is the preferred curation operation over ADD and UPDATE. [convention]
- **context_quality_requirements**: Curated contexts must include a clear task, at least one of changes/files/flow, and at least one narrative field. [convention]

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
