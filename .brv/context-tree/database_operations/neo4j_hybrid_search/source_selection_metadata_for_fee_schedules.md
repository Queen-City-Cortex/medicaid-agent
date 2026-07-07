---
title: Source Selection Metadata for Fee Schedules
tags: []
related: [database_operations/neo4j_hybrid_search/context.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-06T16:21:12.533Z'
updatedAt: '2026-07-06T16:21:12.533Z'
---
## Raw Concept
**Task:**
Document the PR 58 review outcome and the fee schedule source selection logic in source_selection.py.

**Changes:**
- PR 58 was scored 5/5 safe-to-merge by Greptile.
- Both review bots raised one nit about using crawler_registry default data_dir instead of a module-local CRAWLER_DATA_DIR.
- The issue was resolved in commit 53875f0 with a documenting comment rather than a kwarg change.
- The module intentionally stays config-independent because registry rows are always data-dir-relative.

**Files:**
- packages/pipeline/src/pipeline/source_selection.py
- packages/pipeline/src/pipeline/crawler_registry.py

**Flow:**
review feedback -> clarify data-dir assumptions -> keep source_selection config-independent -> bucket fee-schedule variants -> render backlog report

**Timestamp:** 2026-07-06

**Author:** PR 58 review summary

**Patterns:**
- `^source_type == "fee_schedule"$` - Filters entries to fee schedule sources only

## Narrative
### Structure
source_selection.py defines SourceSelectionMetadata, backlog candidate/group dataclasses, normalization helpers, date extraction helpers, grouping logic, and markdown rendering for fee-schedule backlog reporting.

### Dependencies
Depends on crawler_registry.normalize_local_path for path normalization and on entry metadata such as source_type, source_url, local_path, title, source_format, and status.

### Highlights
Fee schedule entries are grouped by normalized variant group and variant date, then ranked into primary, history, archive, companion, or reference buckets. Retrieval-ready entries are only chosen non-reference items in primary or history buckets.

### Rules
Registry rows always carry data-dir-relative paths (the crawler's downloader writes them that way), so the default data_dir is never exercised here and this module stays config-independent — unlike audit.py/loader.py, which pass their own monkeypatchable CRAWLER_DATA_DIR because they handle absolute paths.

### Examples
The backlog report uses title, source URL, and local path to derive candidate groups, then renders a table with Priority, Variant Group, Downloaded Ready, Discovered Ready, and Next Candidates columns.
