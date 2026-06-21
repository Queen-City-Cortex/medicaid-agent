---
title: Repository Doc Audit Findings
summary: Audit confirmed root README and RUNBOOK accuracy; packages/web/README.md needed a theme-persistence correction from WorkOS-first to cookie-first.
tags: []
related: []
keywords: []
createdAt: '2026-06-20T02:08:40.996Z'
updatedAt: '2026-06-20T02:08:40.996Z'
---
## Reason
Capture audit findings about repository documentation accuracy and stale web README text

## Raw Concept
**Task:**
Document audit findings for repo docs and tool/CLI validity.

**Changes:**
- Verified root README accuracy
- Verified RUNBOOK accuracy
- Corrected web README theme documentation
- Confirmed crawler CLI commands remain valid after the cli/ split

**Files:**
- packages/web/README.md
- packages/crawler/README.md

**Flow:**
audit -> identify stale doc -> note accurate docs -> record CLI validity

**Timestamp:** 2026-06-20

## Narrative
### Structure
Audit results split into accurate docs, stale doc correction, and CLI validation.

### Dependencies
The crawler CLI is implemented as a commander program in src/index.ts registering modules from src/cli/.

### Highlights
The web README correction is specifically about theme persistence: cookie-first, with WorkOS metadata as a sync/backfill path.

### Examples
Common commands remain npx tsx src/index.ts crawl, check, and stats; npm scripts provide shortcuts.

## Facts
- **root_readme_accuracy**: Root README is accurate, including the default AGENT_MODEL and the agent tool count. [project]
- **runbook_accuracy**: RUNBOOK is accurate. [project]
- **web_readme_theme_doc_issue**: packages/web/README.md previously documented theme persistence incorrectly as stored in WorkOS user metadata. [project]
- **theme_persistence_model**: Theme persistence is cookie-first with WorkOS user metadata used only for cross-device sync and backfill. [project]
- **crawler_cli_entrypoint**: The crawler CLI still uses npx tsx src/index.ts <cmd> after the cli/ split. [project]
