---
title: Documentation Pass Convention
summary: 'Repo documentation pass convention: keep living reference docs synced, avoid rewriting historical logs, and verify key docs like README and RUNBOOK stay accurate.'
tags: []
related: []
keywords: []
createdAt: '2026-06-20T02:08:40.994Z'
updatedAt: '2026-06-20T02:08:40.994Z'
---
## Reason
Capture the repo documentation pass convention and living reference docs

## Raw Concept
**Task:**
Document the repository documentation pass convention and scope of living reference docs.

**Changes:**
- Established living reference docs to keep synced with code
- Excluded historical logs and roadmap/spec artifacts from rewrites
- Verified key docs for accuracy

**Files:**
- README.md
- RUNBOOK.md
- AGENTS.md
- CLAUDE.md
- packages/crawler/README.md
- packages/web/README.md
- packages/pipeline/docs/agent-requirements.md

**Flow:**
audit docs -> compare against code -> identify stale docs -> update living references

**Timestamp:** 2026-06-20

**Author:** repo audit

**Patterns:**
- `^docs/(status-update-|reviews/|superpowers/(plans|specs)/|refactor-|roadmap.md)` - Historical or forward-plan docs that should not be rewritten as living implementation docs

## Narrative
### Structure
The repo distinguishes living reference documentation from dated historical records and aspirational design docs.

### Dependencies
Documentation accuracy depends on source code and current implementation details.

### Highlights
Only one stale doc was identified: packages/web/README.md needed a correction about theme persistence being cookie-first with WorkOS metadata as sync/backfill.

### Rules
Do NOT rewrite dated/historical records — they are logs not implementation.

### Examples
Living docs include root README.md, RUNBOOK.md, AGENTS.md, CLAUDE.md, and per-package README.md/AGENTS.md files.

## Facts
- **documentation_pass_convention**: This repo uses a documentation pass convention for PR #12. [project]
- **living_reference_docs**: Living reference docs should stay synced with code. [project]
- **historical_records_policy**: Do not rewrite dated or historical records because they are logs, not implementation. [project]
