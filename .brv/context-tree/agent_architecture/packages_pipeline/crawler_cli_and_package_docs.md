---
title: Crawler CLI and Package Docs
summary: The crawler package exposes commands through src/index.ts and keeps npm shortcuts for crawl, check, and stats; its README points to a design spec in docs/superpowers/specs.
tags: []
related: []
keywords: []
createdAt: '2026-06-20T02:08:40.998Z'
updatedAt: '2026-06-20T02:08:40.998Z'
---
## Reason
Document crawler CLI usage and package documentation expectations

## Raw Concept
**Task:**
Document crawler CLI behavior and README guidance.

**Changes:**
- Confirmed existing CLI commands remain valid after source reorganization
- Documented registry-based change detection
- Captured the design-spec pointer used by the README

**Files:**
- packages/crawler/README.md
- docs/superpowers/specs/2026-03-26-nc-medicaid-crawler-design.md

**Flow:**
entrypoint -> commander registration -> command execution -> registry update

**Timestamp:** 2026-06-20

## Narrative
### Structure
The crawler package README combines usage, sources, testing, and design references.

### Dependencies
CLI behavior depends on src/index.ts and the per-command modules in src/cli/.

### Highlights
The documented commands and npm shortcuts remain valid despite the cli/ split.

### Examples
Examples include npx tsx src/index.ts crawl --source clinical_policy and npx tsx src/index.ts export --output registry.json.

## Facts
- **crawler_purpose**: The crawler package is a polite, incremental crawler for NC Medicaid policy documents. [project]
- **crawler_registry**: The crawler maintains a local SQLite registry for change detection. [project]
- **crawler_cli_structure**: The CLI is a commander program in src/index.ts that registers commands under src/cli/. [project]
- **crawler_shortcuts**: Common commands include crawl, check, and stats, with npm-script shortcuts. [project]
- **crawler_design_spec**: The crawler README references docs/superpowers/specs/2026-03-26-nc-medicaid-crawler-design.md for the full specification. [project]
