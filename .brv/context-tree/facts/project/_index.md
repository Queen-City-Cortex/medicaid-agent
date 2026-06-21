---
children_hash: 4f8def6d59fd8285539262a214547108f5dc6003c14a0b8a161e5124d95b2328
compression_ratio: 0.6826923076923077
condensation_order: 1
covers: [curated_context_snippet.md]
covers_token_total: 728
summary_level: d1
token_count: 497
type: summary
---
# d1 Structural Summary

## Project curation rules and durable knowledge model
The main entry, **curated_context_snippet.md**, captures the project’s durable curation approach: preserve operational knowledge from context snippets as structured facts, keep exact timestamps, and retain reusable project facts for later retrieval. It also records specific project functions and deduplication behavior, including `scoreCoverageSections(...)`, `collectCoverageSectionGroups(...)`, `buildCoverageAnchors(...)`, `assembleCoverageSections(...)`, `selectCoveragePrimarySections(...)`, and deduplication via `uniqueBy(section.id)`.

## Core curation workflow and content requirements
The consolidated knowledge defines a strict workflow: **recon → extract salient facts/context → curate with UPSERT → verify applied files and failures**. It emphasizes a two-part context model with `rawConcept` and `narrative`, and requires each context to include:
- a clear `task`
- at least one operational detail in `changes`, `files`, or `flow`
- at least one narrative field

It also requires temporal preservation, exact rule text, regex patterns, and avoidance of vague or under-specified contexts.

## Verification and update discipline
A recurring operational rule is to verify curation success by checking `result.summary.failed` and inspecting `result.applied` file paths. UPSERT is the preferred update mode, used to avoid pre-checks and simplify create/update handling while preserving consistency in the context tree.

## Key entities and reusable concepts
This knowledge set repeatedly centers on:
- **ByteRover context engineer**
- `rawConcept`
- `narrative`
- `changes`
- `files`
- `flow`
- `curation_input`

These names are important drill-down anchors for understanding the curation system and its preservation standards.

## Related drill-down entry
- **curated_context_snippet.md** — primary source for the project-facts entry, extracted operational notes, and the consolidated curation rules