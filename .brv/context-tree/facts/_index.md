---
children_hash: a8598d2ae00703c58bc1e8f1be2ed3bd7cf5750a29de0d836757fcaf69970dd6
compression_ratio: 0.6534653465346535
condensation_order: 2
covers: [conventions/_index.md, project/_index.md]
covers_token_total: 1212
summary_level: d2
token_count: 792
type: summary
---
# Structural Summary: Curation Guardrails and Curated Snippet Workflow

## Scope
These entries define the durable curation rules and the project’s canonical knowledge-snippet workflow. Together they establish how context is extracted, structured, verified, and preserved for long-term recall.

## Shared Structural Pattern
Both entries emphasize a **RLM-style curation flow** centered on preserving knowledge in structured form rather than chat-only notes:
- **recon -> extraction -> curate apply**
- Prefer **UPSERT** for persistence
- Verify results using curator outputs, especially **`result.summary.failed`** and **`result.applied[].filePath`**

## conventions/_index.md — Curation Workflow Guardrails
This entry captures the operating rules for ByteRover curation:

- Use the RLM workflow with **context, history, metadata, and task ID variables**
- If recon already recommends **single-pass**, do **not** chunk
- For chunked extraction, use **`tools.curation.mapExtract()`** and pass **`taskId` as a bare variable**
- Any `code_exec` call using `mapExtract` must set **`timeout: 300000`**
- Do not print raw context during curation
- Do not rerun recon when precomputed recon is already available
- Prefer **file-path verification** over rereading file content

### Content quality requirements
A curatable context must include:
- a clear **task**
- at least one of **changes / files / flow**
- at least one **narrative** field
- **2–4 sentences minimum**

### Preservation rules
- Preserve **exact rule text**
- Preserve **regex patterns** verbatim
- Preserve all enumerated items
- Keep outputs detailed enough to stand alone

### Drill-down
- See **facts/project/curated_context_snippet.md** for related curated context examples and snippet handling.

## project/_index.md — Curated Context Snippet Workflow
This entry documents the project’s durable-knowledge snippet pattern and its structural expectations:

### Core model
- **rawConcept**: task, changes, files, flow, timestamp, author, patterns
- **narrative**: structure, dependencies, highlights, rules, examples

### Required curation properties
- Every context needs a clear **task**
- It must include at least one operational detail: **changes**, **files**, or **flow**
- It must include at least one narrative field
- Facts must be extracted and preserved
- Temporal information must be retained exactly, including timestamps

### Preservation and quality rules
- Preserve exact rule text, regex patterns, and timestamps
- Avoid vague contexts and nested subtopics
- Prefer **UPSERT** updates
- Verify using `result.summary.failed` and `result.applied`

### Key facts and relationships
- Durable notes are separated from raw source snippets
- The workflow follows **recon -> extraction -> curate apply**
- It is described as an actively curated project module
- It relies on ByteRover context-engineering conventions

### Secondary note
A smaller auxiliary fragment appears on **Eval OpenAI key isolation**, using a simpler flow:
- **context -> extract lines -> curate facts**

### Drill-down
- See **curated_context_snippet.md** for the full workflow shape, facts list, and verification guidance.