---
title: LibSQL Storage Fix for Railway
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-02T21:20:41.880Z'
updatedAt: '2026-04-02T21:20:41.880Z'
---
## Raw Concept
**Task:**
Describe the Railway deployment fix replacing DuckDB/MastraCompositeStore with LibSQL storage for the NC Medicaid agent.

**Changes:**
- Removed @mastra/duckdb dependency and DuckDB-based MastraCompositeStore to avoid ld-linux-x86-64.so.2 requirement.
- Instantiated LibSQLStore (mastra-storage) for both persistence and observational memory instead of DuckDB.
- Mapped all Mastra observability/exporter storage to LibSQL so Railway deploys no longer crash on Alpine/musl.

**Files:**
- packages/agent/src/index.ts
- packages/agent/package.json

**Flow:**
Railway Alpine/musl -> DuckDB glibc dependency causes ld-linux-x86-64.so.2 crash -> remove DuckDB, dependency stripped from package.json -> instantiate LibSQLStore for storage/observability -> deploy succeeds

**Timestamp:** 2026-04-02

## Narrative
### Structure
The Mastra agent index now imports LibSQLStore and constructs a single storage instance used by Memory and Observability, replacing the removed MastraCompositeStore that previously relied on DuckDB.

### Dependencies
LibSQLStore is sourced from @mastra/libsql while @mastra/duckdb and the composite store implementation were removed to avoid glibc-linked native bindings that Railway Alpine containers cannot load.

### Highlights
This fix ensures Railway deploys succeed by relying entirely on LibSQL, eliminating the need for glibc-linked DuckDB binaries and keeping observability pipelines functional.

### Examples
Memory is configured with LibSQLStore storage, observational memory uses openai/gpt-5.4-mini, and observability continues exporting spans via DefaultExporter backed by LibSQL.

## Facts
- **deployment_environment**: Railway containers run Alpine Linux with musl libc and do not provide ld-linux-x86-64.so.2 necessary for DuckDB native bindings. [environment]
- **storage_backend**: The NC Medicaid agent now uses LibSQLStore for all memory and observability storage instead of MastraCompositeStore/DuckDB. [project]
