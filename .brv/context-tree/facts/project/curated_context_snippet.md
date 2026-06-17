---
title: Curated Context Snippet
summary: Captured a small set of factual statements from the provided context into the facts/project domain.
tags: []
related: []
keywords: []
createdAt: '2026-06-13T06:00:50.089Z'
updatedAt: '2026-06-13T06:00:50.089Z'
consolidated_at: '2026-06-17T20:29:55.265Z'
consolidated_from: [{date: '2026-06-17T20:29:55.265Z', path: facts/project/curated_context_snippet.abstract.md, reason: 'All three files describe the same curated context snippet topic at different levels of detail: the markdown file contains the concrete curation record, while the abstract and overview summarize the same preservation and workflow rules. They are overlapping rather than complementary enough to keep separate.'}, {date: '2026-06-17T20:29:55.265Z', path: facts/project/curated_context_snippet.overview.md, reason: 'All three files describe the same curated context snippet topic at different levels of detail: the markdown file contains the concrete curation record, while the abstract and overview summarize the same preservation and workflow rules. They are overlapping rather than complementary enough to keep separate.'}]
---
## Reason
Persist extracted facts from the provided context

## Raw Concept
**Task:**
## Eval OpenAI key isolation

**Changes:**
- Extracted from curated context input

**Flow:**
context -> extract lines -> curate facts

**Timestamp:** 2026-06-13T06:00:42.089Z

## Narrative
### Structure
Single-pass curation from compact RLM context input.

### Highlights
Context had 20 lines and 940 characters.

### Examples
Stored extracted facts as durable knowledge.

## Consolidated Knowledge
This document records project curation rules for preserving durable knowledge, emphasizing structured context fields, exact fact and timestamp retention, UPSERT-based updates, and verification of applied results.

Project-level curation notes for preserving durable knowledge from context snippets and source material.
Defines a two-part context model with `rawConcept` and `narrative`, and requires facts extraction plus temporal preservation.
Describes a workflow of recon -> extract salient facts/context -> curate using UPSERT -> verify applied files and failures.
Emphasizes strict structure rules: include a clear task, at least one operational detail (`changes`, `files`, or `flow`), and at least one narrative field.
Key constraints include preserving exact rule text, regex patterns, timestamps, and avoiding vague contexts or nested subtopics.
Verification guidance references checking `result.summary.failed` and `result.applied` file paths.
Notable entities/patterns include ByteRover context engineer, `rawConcept`, `narrative`, `changes`, `files`, `flow`, and a `curation_input` facts entry.