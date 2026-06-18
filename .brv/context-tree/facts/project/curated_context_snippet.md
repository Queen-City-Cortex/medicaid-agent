---
title: Curated Context Snippet
summary: Curated a compact project fact note capturing the current context size and recon recommendation.
tags: []
related: []
keywords: []
createdAt: '2026-06-13T06:00:50.089Z'
updatedAt: '2026-06-18T02:14:13.341Z'
---
## Reason
Preserve compact curation metadata and process guidance from the current context.

## Raw Concept
**Task:**
Record curation metadata for the current RLM pass

**Changes:**
- Captured the current context size and line count
- Recorded the recon recommendation for single-pass processing

**Flow:**
recon -> direct curation -> verification

**Timestamp:** 2026-06-18T02:14:05.676Z

**Author:** ByteRover context engineer

## Narrative
### Structure
This note stores lightweight operational metadata for the current curation run.

### Dependencies
Uses the precomputed recon result and current curation variables.

### Highlights
Single-pass mode was recommended, so no chunked extraction was needed.

### Examples
Stored extracted facts as durable knowledge.

## Facts
- **context_size**: Context is 1218 characters long and spans 53 lines. [other]
- **recon_mode**: Recon suggested single-pass extraction with one chunk. [other]

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
