---
children_hash: 6f1860b3f5d427c25959a5d2ef9cd7eb7307f1520538d191e099406aefba15ab
compression_ratio: 0.45634920634920634
condensation_order: 1
covers: [curated_context_snippet.md]
covers_token_total: 1008
summary_level: d1
token_count: 460
type: summary
---
# Structural Overview

## Curated Context Snippet
`curated_context_snippet.md` is the project-level source of truth for curation guidance. It consolidates the richer markdown content and replaces the redundant `abstract` and `overview` variants, so drill into this entry for the full ruleset.

### Core model
- Uses a **two-part context model**:
  - `rawConcept` for essential metadata and operational facts
  - `narrative` for descriptive structure, dependencies, and highlights
- Knowledge is expected to be organized as **domain → topic → subtopic** context files.

### Required content shape
- Every curated item should include:
  - a clear `task`
  - at least one of `changes`, `files`, or `flow`
  - at least one narrative field
- The guidance explicitly prioritizes **durable, traceable knowledge** over chat-only notes.

### Curation workflow
- Canonical flow:
  - `recon -> extract facts and context -> curate with UPSERT -> verify applied files`
- `UPSERT` is the default operation for create/update handling.
- Verification must check:
  - `result.summary.failed`
  - `result.applied` file paths

### Preservation rules
- Preserve **exact rule text**, **regex patterns**, and **temporal information** verbatim.
- Include timestamps and source references when available.
- Avoid vague contexts and nested subtopics.

### Facts handling
- Facts should be extracted and stored as durable knowledge.
- Use **standalone facts domains** for uncategorized:
  - personal facts
  - project facts
  - convention facts

### Key referenced entities
- `ByteRover context engineer`
- `rawConcept`
- `narrative`
- `changes`
- `files`
- `flow`

### Related drill-down areas
- **Eval OpenAI key isolation**: separate extracted note captured inside the same entry; useful if you need the contextual provenance for that fact-preservation example.