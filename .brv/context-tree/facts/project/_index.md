---
children_hash: a2c53e14158ba32e0ef36a6b0134c6e7998b65b6e68be6eee471611435885618
compression_ratio: 0.9228611500701263
condensation_order: 1
covers: [curated_context_snippet.md]
covers_token_total: 713
summary_level: d1
token_count: 658
type: summary
---
# Structural Summary: Curated Context Snippet Workflow

## Overview
`curated_context_snippet.md` captures the project’s durable-knowledge curation pattern for context snippets. It focuses on preserving structured recall rather than chat-only notes, with a strong emphasis on exact fact retention, timestamps, and verification.

## Core Workflow
- Main flow: **recon -> extraction -> curate apply**
- Uses precomputed recon results and current curation variables.
- The workflow is explicitly described as an **actively curated project module**.

### Drill-down
- See **curated_context_snippet.md** for the workflow shape and curation approach.

## Curation Model
The document defines a two-part context model:
- **rawConcept**: task, changes, files, flow, timestamp, author, and optional patterns
- **narrative**: structure, dependencies, highlights, rules, examples

Key requirements:
- Every context needs a clear **task**
- It must include at least one operational detail: **changes**, **files**, or **flow**
- It must include at least one narrative field
- Facts must be extracted and preserved for long-term recall
- Temporal information must be retained exactly, including timestamps

### Drill-down
- See **curated_context_snippet.md** for the exact structure rules and preservation constraints.

## Preservation and Quality Rules
Important curation constraints include:
- Preserve exact rule text, regex patterns, and timestamps
- Avoid vague contexts and nested subtopics
- Prefer **UPSERT**-based updates
- Verify applied results through `result.summary.failed` and `result.applied`

These rules are framed as project-level guardrails for durable knowledge capture.

### Drill-down
- See **curated_context_snippet.md** for verification guidance and structural constraints.

## Key Facts and Relationships
- The workflow separates **durable notes** from **raw source snippets**
- It uses **RLM-style curation**
- It relies on **ByteRover context engineer** conventions
- It records facts such as:
  - `curated_context_snippet_workflow` is actively curated
  - durable notes are stored separately from raw snippets
  - the workflow follows recon -> extraction -> curate apply

### Drill-down
- See **curated_context_snippet.md** for the facts list and curation notes.

## Secondary Note: Eval OpenAI Key Isolation
The entry also includes a smaller note on **Eval OpenAI key isolation** with a simpler flow:
- **context -> extract lines -> curate facts**

This appears as an additional extracted curation fragment rather than the main workflow.

### Drill-down
- See **curated_context_snippet.md** for the auxiliary eval note.