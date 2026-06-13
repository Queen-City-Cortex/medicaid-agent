---
children_hash: 9c45dfa3c4ae0c2a18ef15db1477ebe4b6e8982e7490c67dd9afb135da090e56
compression_ratio: 0.6237388724035609
condensation_order: 1
covers: [cli_runner.md, libsql_storage_fix_for_railway.md, nc_medicaid_navigator_agent.md, ssa_and_cfr_reference_resolution_fixes.md, startup_and_web_ui_hardening.md]
covers_token_total: 1685
summary_level: d1
token_count: 1051
type: summary
---
# NC Medicaid Agent Architecture

This cluster captures the canonical implementation and hardening notes for the NC Medicaid Navigator agent, with several consolidated child entries covering startup/runtime behavior, storage fixes, citation resolution, and CLI execution safeguards.

## Core agent runtime

### `startup_and_web_ui_hardening.md`
The main runtime hardening record for the NC Medicaid Navigator agent. It ties together:
- env validation and startup checks
- Mastra configuration for memory, tools, and server
- server routes and web UI constraints
- CLI runner behavior
- system prompt rules and anti-hallucination guidance

The associated `context.md` topic overview states that this area documents how the agent uses Mastra components and the instructions that keep policy guidance factual and consistent.

### `cli_runner.md`
Canonical CLI execution note, with the memory-guardrail content folded in. Key retained details:
- full CLI flow and step iteration behavior
- explicit CLI memory payload requirements
- tool list and observability memory details
- `cli-${Date.now()}` thread behavior
- `onIterationComplete` synthesis guardrail for `MAX_STEPS`
- `closeDriver()` cleanup

This entry should be used as the drill-down source for how the CLI runner maintains memory, completes iterations, and shuts down cleanly.

## Storage and deployment fixes

### `libsql_storage_fix_for_railway.md`
Records the Railway deployment fix that replaced DuckDB/MastraCompositeStore with LibSQL storage to avoid Alpine/musl crashes.

Key architectural decision:
- remove `@mastra/duckdb` and DuckDB-based `MastraCompositeStore`
- use `LibSQLStore` from `@mastra/libsql` for both persistence and observational memory
- route observability/exporter storage through LibSQL so Railway deploys succeed

Important context:
- Railway containers run Alpine Linux with musl libc
- DuckDB native bindings require `ld-linux-x86-64.so.2`, which is unavailable there
- canonical files: `packages/agent/src/index.ts` and `packages/agent/package.json`

## Reference resolution and citation correctness

### `ssa_and_cfr_reference_resolution_fixes.md`
The canonical fix set for SSA/CFR citation resolution. The consolidated record preserves the underlying parser/resolver behavior and the re-ingestion pipeline.

Important retained facts and relationships:
- P0 fixes cover SSA-to-USC mapping, SSA parser robustness, CFR citation parsing, and part-level-only supersession redirects
- notable mappings:
  - SSA 1944 → USC 1396w-3a
  - SSA 1900 → USC 1396
  - SSA 1901 → USC 1396-1
- there is no current-law USC 1396w-7
- parser improvements handle italicized section headings in USC HTML
- full section text is preserved by removing the 50K truncation cap
- CFR matching recognizes both `C.F.R.` and `Part X` citation forms case-insensitively
- supersession redirects are constrained to part-level only
- re-ingestion sequence: `ingest-ssa --refresh` → `extract-refs` → `embed`

Anchor files referenced for drill-down:
- `ssa_client.py`
- `ssa_parser.py`
- `resolver.py`
- `uscode.house.gov`
- `cfr-supersessions.json`

## Agent prompt and metadata guidance

### `nc_medicaid_navigator_agent.md`
Canonical agent document with an added subtopic note pointing to `document_metadata_and_agent_prompt_guidance.md` for the detailed behavior around metadata helpers, startup validation, and prompt requirements for accurate policy citations.

Preserved guidance areas:
- `source_url` support for clickable citations
- startup/model/storage/memory/server configuration
- tool taxonomy
- amendment verification
- anti-hallucination rules
- required response-format rules

## Structural relationship summary

- `startup_and_web_ui_hardening.md` is the broadest runtime and UI hardening reference.
- `cli_runner.md` is the canonical CLI execution/memory/cleanup reference.
- `libsql_storage_fix_for_railway.md` explains the storage backend change that unblocked Railway deployment.
- `ssa_and_cfr_reference_resolution_fixes.md` documents citation and legal-reference resolution correctness.
- `nc_medicaid_navigator_agent.md` anchors the agent-level prompt and metadata guidance, with a pointer to the detailed guidance subtopic.