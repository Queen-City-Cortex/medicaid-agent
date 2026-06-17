---
children_hash: 713e39f814a9b5e3e6ef837f67e76470f577e95c6a5baacc328c30bf6b615632
compression_ratio: 0.8802660753880266
condensation_order: 2
covers: [project/_index.md]
covers_token_total: 451
summary_level: d2
token_count: 397
type: summary
---
# facts/project — Structural Summary

This domain captures durable project knowledge centered on a single curation record: **`curated_context_snippet.md`**. The entry documents how compact context inputs are converted into structured, durable knowledge, with emphasis on preserving factual detail, timestamps, and verification status instead of leaving information only in chat.

## Core curation model
The preserved workflow is:

- **context → extract lines → curate facts**
- Use a **two-part context model**:
  - `rawConcept` for operational metadata
  - `narrative` for descriptive structure
- Require a clear `task` plus at least one of:
  - `changes`
  - `files`
  - `flow`
- Include at least one narrative field such as:
  - `structure`
  - `dependencies`
  - `highlights`

## Key rules and constraints
The record emphasizes durable-knowledge curation practices:

- Prefer **UPSERT** for updates
- Verify results via `result.summary.failed` and `result.applied`
- Preserve **exact rule text**, **regex patterns**, and **timestamps**
- Maintain **temporal fidelity** and exact fact retention
- Avoid vague topics and nested subtopics

## Structural signals and relationships
The notes describe a **single-pass curation** process from a compact RLM context input, indicating the source context was small enough for direct extraction. The document functions as project-level guidance for preserving durable knowledge from context snippets and source material.

## Drill-down
- **`curated_context_snippet.md`** — concrete curation record, raw concept, narrative, and consolidation notes