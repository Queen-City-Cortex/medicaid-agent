---
children_hash: 76517b0f03e1d01011f7cabbc585c12a883436e297ebe012e0039842fbd9f042
compression_ratio: 0.5657894736842105
condensation_order: 1
covers: [curated_context_snippet.md]
covers_token_total: 684
summary_level: d1
token_count: 387
type: summary
---
# facts/project

Durable project knowledge is centered on a small curation record captured in **`curated_context_snippet.md`**. The entry documents how compact context inputs are transformed into structured knowledge and emphasizes preserving factual detail, timestamps, and verification status rather than leaving notes in chat.

## Core curation model
The preserved workflow is:

- **context -> extract lines -> curate facts**
- Use a **two-part context model** with:
  - `rawConcept` for operational metadata
  - `narrative` for descriptive structure
- Require a clear `task` plus at least one of `changes`, `files`, or `flow`
- Include at least one narrative field such as `structure`, `dependencies`, or `highlights`

## Key rules and constraints
The record stresses durable-knowledge curation rules:

- Prefer **UPSERT** for updates
- Verify outcomes with `result.summary.failed` and `result.applied`
- Preserve **exact rule text**, **regex patterns**, and **timestamps**
- Maintain **temporal fidelity** and exact fact retention
- Avoid vague topics and nested subtopics

## Structural signals and relationships
The curation notes describe a **single-pass curation** from a compact RLM context input and record that the source context was small enough for direct extraction. The document also frames these notes as project-level guidance for preserving durable knowledge from context snippets and source material.

## Drill-down
- **`curated_context_snippet.md`** — concrete curation record, raw concept, narrative, and consolidation notes