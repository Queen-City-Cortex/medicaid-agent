---
children_hash: 2ec944c20e9fcbf0682401358aae28b1872ec8c1e71c92046beffe9a351ac1fd
compression_ratio: 0.8685714285714285
condensation_order: 2
covers: [project/_index.md]
covers_token_total: 525
summary_level: d2
token_count: 456
type: summary
---
# Structural Overview

## Project-level curation guidance
`project/_index.md` summarizes `curated_context_snippet.md` as the project’s source of truth for curation rules. It replaces redundant `abstract` and `overview` variants, so drill into that entry for the full policy set.

### Core context model
- Knowledge uses a **two-part context model**:
  - `rawConcept` for essential metadata, operational facts, and traceable structure
  - `narrative` for descriptive structure, dependencies, highlights, and rules
- Content is organized as **domain → topic → subtopic** files.

### Required shape for curated entries
Each curated item should include:
- a clear `task`
- at least one of `changes`, `files`, or `flow`
- at least one narrative field

The guidance emphasizes **durable, traceable knowledge** over chat-only notes.

### Canonical curation workflow
- Standard flow: `recon -> extract facts and context -> curate with UPSERT -> verify applied files`
- `UPSERT` is the default operation for create/update handling.
- Verification should check:
  - `result.summary.failed`
  - `result.applied` file paths

### Preservation and quality rules
- Preserve **exact rule text**, **regex patterns**, and **temporal information** verbatim.
- Include timestamps and source references when available.
- Avoid vague contexts and nested subtopics.

### Facts handling
- Facts should be extracted and stored as durable knowledge.
- Use standalone `facts/` domains for uncategorized knowledge:
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

### Drill-down note
- **Eval OpenAI key isolation**: a separate extracted note within the same entry, useful for provenance around fact-preservation examples.