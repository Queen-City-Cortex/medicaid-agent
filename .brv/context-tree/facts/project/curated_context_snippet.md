---
title: Curated Context Snippet
summary: Project facts about the curated context snippet workflow and its output structure.
tags: []
related: []
keywords: []
createdAt: '2026-06-13T06:00:50.089Z'
updatedAt: '2026-06-21T19:03:39.616Z'
---
## Reason
Curate workflow notes from provided context

## Raw Concept
**Task:**
Document the curated context snippet workflow and its curation pattern.

**Changes:**
- Captured the current context size and line count
- Recorded the recon recommendation for single-pass processing
- Extracted context-backed statements for long-term recall
- Captured workflow shape and curation approach
- Preserved durable-note separation from raw snippets

**Flow:**
recon -> extraction -> curate apply

**Timestamp:** 2026-06-21T19:03:28.361Z

**Author:** ByteRover context engineer

## Narrative
### Structure
This knowledge captures how the module is curated and organized for durable recall.

### Dependencies
Uses the precomputed recon result and current curation variables.

### Highlights
The context emphasizes keeping durable knowledge instead of chat-only context and using RLM-style curation.

### Examples
Stored extracted facts as durable knowledge.

## Facts
- **curated_context_snippet_workflow**: The curated context snippet workflow is an actively curated project module. [project]
- **durable_notes_separation**: The workflow stores durable notes separately from raw source snippets. [project]
- **curate_workflow**: The workflow uses a recon -> extraction -> curate apply pattern. [project]

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
