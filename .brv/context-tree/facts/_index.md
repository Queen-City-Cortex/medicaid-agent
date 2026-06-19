---
children_hash: a9c710d6d8cb33d043f8287afb6e89f40ece2a9be9acc746ae63fa3c5d2cab5d
compression_ratio: 0.8642611683848798
condensation_order: 2
covers: [project/_index.md]
covers_token_total: 582
summary_level: d2
token_count: 503
type: summary
---
# facts/project — Structural Summary

This domain stores durable project facts and curation rules meant to preserve reusable operational knowledge from snippets and source material. The key child entry is **curated_context_snippet.md**, which contains the structured record and extracted facts in full.

## Purpose and scope
- Preserve operational notes as durable knowledge instead of chat-only context.
- Standardize curation around the two-part model: **`rawConcept`** and **`narrative`**.
- Retain exact timestamps, rules, regex patterns, and other high-value details for later traceability and recall.

## Curation workflow
- The documented workflow is: **recon -> extract salient facts/context -> curate using UPSERT -> verify applied files and failures**.
- Verification centers on `result.summary.failed` and `result.applied` file paths.
- **UPSERT** is the default curation mechanism.

## Structural requirements
- Curated context should include:
  - a clear **task**
  - at least one operational detail in **`changes`**, **`files`**, or **`flow`**
  - at least one narrative field such as **structure**, **dependencies**, or **highlights**
- The domain preserves:
  - exact rule text
  - regex/validation patterns
  - timestamps and temporal markers
  - detailed facts suitable for later recall

## Key entities and patterns
- **ByteRover context engineer**
- **`rawConcept`**
- **`narrative`**
- **`changes`**
- **`files`**
- **`flow`**
- Facts extraction and temporal preservation are treated as required curation behaviors.

## Notable captured facts
- Coverage assembly and selection functions are recorded as project facts:
  - `scoreCoverageSections(...)`
  - `collectCoverageSectionGroups(...)`
  - `buildCoverageAnchors(...)`
  - `assembleCoverageSections(...)`
  - `selectCoveragePrimarySections(...)`
- Deduplication uses `uniqueBy(section.id)`.

## Drill-down
- See **curated_context_snippet.md** for the full structured record, raw concept details, narrative context, and extracted facts.