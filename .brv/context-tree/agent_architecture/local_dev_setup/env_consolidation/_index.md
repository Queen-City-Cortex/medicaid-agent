---
children_hash: 0022aa76b7e263cd977bc65c2a5c607ff765b728f49a7fc5d25e9d65140554f2
compression_ratio: 0.4018058690744921
condensation_order: 0
covers: [repository_doc_audit_findings.md, root_environment_consolidation.md]
covers_token_total: 1329
summary_level: d0
token_count: 534
type: summary
---
# d0 Structural Summary

## local_dev_setup: documentation and environment consolidation
This level groups two operational repository-maintenance topics under `agent_architecture/local_dev_setup`: documentation correctness and environment-variable centralization.

### repository_doc_audit_findings.md
- Captures the documentation pass convention and the repo docs audit findings.
- Core distinction: **living reference docs** must stay synced with current code, while **historical/dated records** and forward-plan artifacts must not be rewritten.
- Scope of living docs includes root `README.md`, `RUNBOOK.md`, `AGENTS.md`, `CLAUDE.md`, and package-level docs such as `packages/crawler/README.md`, `packages/web/README.md`, and `packages/pipeline/docs/agent-requirements.md`.
- Audit outcome:
  - Root `README.md` verified accurate.
  - `RUNBOOK.md` verified accurate.
  - Only one stale doc found: `packages/web/README.md`.
  - The stale item concerned theme persistence; it was corrected from an incorrect WorkOS-user-metadata model to the actual **cookie-first** model with WorkOS metadata only for cross-device sync/backfill.
  - Crawler CLI commands remained valid after the `cli/` split.
- Relevant commands remain `npx tsx src/index.ts crawl`, `check`, and `stats`, with npm scripts as shortcuts.
- Drill down here for the documentation policy, audit scope, and the exact stale-doc correction.

### root_environment_consolidation.md
- Documents the repository-wide environment-variable consolidation event.
- Main architectural decision: the **root `.env` file is the single source of truth** for:
  - LLM API keys
  - WorkOS authentication config
  - E2E test credentials
- Repo layout consequence:
  - `packages/agent/.env` and `packages/web/.env.local` are **absolute symlinks** to the root file.
  - A previous circular symlink chain was eliminated by deleting symlinks first and then creating a real root `.env`.
- This is a focused follow-up on `local_dev_setup`, clarifying how configuration was centralized across packages.
- Drill down here for the environment layout, symlink resolution, and consolidation rationale.