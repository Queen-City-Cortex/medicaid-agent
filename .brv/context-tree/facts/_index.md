---
children_hash: 4a6dc2f35c199e132023128016a43e0426ac60c09c85bd13e4a5b8d787cfbf71
compression_ratio: 0.8879003558718861
condensation_order: 2
covers: [project/_index.md]
covers_token_total: 562
summary_level: d2
token_count: 499
type: summary
---
# Project Curation Overview

## Durable knowledge model
The main child entry, **curated_context_snippet.md**, defines the project’s durable curation approach: convert context snippets into structured, reusable facts, preserve exact timestamps, and keep project knowledge available for later retrieval. It also captures specific reusable functions and deduplication behavior, including `scoreCoverageSections(...)`, `collectCoverageSectionGroups(...)`, `buildCoverageAnchors(...)`, `assembleCoverageSections(...)`, `selectCoveragePrimarySections(...)`, and deduplication via `uniqueBy(section.id)`.

## Core curation workflow
The knowledge set standardizes a strict workflow: **recon → extract salient facts/context → curate with UPSERT → verify applied files and failures**. It uses a two-part context model with:
- `rawConcept`
- `narrative`

Each curated context must include:
- a clear `task`
- at least one operational detail in `changes`, `files`, or `flow`
- at least one narrative field

## Preservation requirements
The curation rules emphasize fidelity over compression:
- preserve temporal information exactly
- retain exact rule text
- keep regex patterns intact
- avoid vague or underspecified contexts

This makes the curation output suitable as durable operational memory rather than chat-only notes.

## Verification and update discipline
A recurring operational rule is to verify curation success by checking `result.summary.failed` and inspecting `result.applied` file paths. **UPSERT** is the preferred update mode because it removes the need for pre-checks and simplifies create/update handling while keeping the context tree consistent.

## Key drill-down concepts
The main reusable anchors across the knowledge set are:
- **ByteRover context engineer**
- `rawConcept`
- `narrative`
- `changes`
- `files`
- `flow`
- `curation_input`

## Drill-down entry
- **curated_context_snippet.md** — source for the project-facts entry, operational notes, and consolidated curation rules