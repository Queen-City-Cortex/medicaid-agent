---
children_hash: efd39977f10b8ff47c1cad37120627a1a8f0ccf3fb050dd95747594e131a1e00
compression_ratio: 0.5601300108342362
condensation_order: 1
covers: [curated_context_snippet.md]
covers_token_total: 923
summary_level: d1
token_count: 517
type: summary
---
# facts/project — Structural Overview

This domain captures durable project facts and curation rules used to preserve reusable operational knowledge from snippets and source material. The central entry is **curated_context_snippet.md**, which consolidates context-derived findings into structured facts for later recall.

## Core purpose
- Preserve operational notes as durable knowledge rather than chat-only context.
- Standardize curation around a two-part model: **`rawConcept`** and **`narrative`**.
- Retain exact timestamps, rules, regex patterns, and other high-value details for traceability.

## Curation workflow
- The recorded workflow is: **recon -> extract salient facts/context -> curate using UPSERT -> verify applied files and failures**.
- Verification focuses on `result.summary.failed` and `result.applied` file paths.
- The entry emphasizes UPSERT-based updates as the default curation mechanism.

## Structural requirements
- Every curated context should include:
  - a clear **task**
  - at least one operational detail in **`changes`**, **`files`**, or **`flow`**
  - at least one narrative field such as **structure**, **dependencies**, or **highlights**
- The system preserves:
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

## Facts captured in the entry
- Coverage assembly and selection functions are recorded as project facts:
  - `scoreCoverageSections(...)`
  - `collectCoverageSectionGroups(...)`
  - `buildCoverageAnchors(...)`
  - `assembleCoverageSections(...)`
  - `selectCoveragePrimarySections(...)`
- Deduplication is explicitly noted as using `uniqueBy(section.id)`.

## Drill-down
- See **curated_context_snippet.md** for the full structured record, raw concept details, narrative context, and extracted facts.