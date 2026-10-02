---
consolidated_at: '2026-06-20T18:42:06.751Z'
consolidated_from: [{date: '2026-06-20T18:42:06.751Z', path: agent_architecture/local_dev_setup/documentation_pass_convention.md, reason: 'Both files describe the same documentation-audit event and overlap heavily: living docs vs historical docs policy, root README/RUNBOOK verification, and the web README theme-persistence correction. The audit findings file is richer and should be the output file.'}]
related: [agent_architecture/packages_pipeline/crawler_cli_and_package_docs.md, agent_architecture/local_dev_setup/documentation_pass_convention.md, agent_architecture/local_dev_setup/ci_workflow_concurrency_and_test_gates.md, agent_architecture/local_dev_setup/local_development_setup.md]
---
# Repository Doc Audit Findings

## Reason
Capture audit findings about repository documentation accuracy and stale web README text

## Raw Concept
**Task:**
Document the repository documentation pass convention, repo docs audit findings, and scope of living reference docs.

**Changes:**
- Established living reference docs to keep synced with code
- Excluded historical logs, roadmap items, specs, and other forward-plan artifacts from rewrites
- Verified key docs for accuracy
- Verified root README accuracy
- Verified RUNBOOK accuracy
- Corrected web README theme documentation
- Confirmed crawler CLI commands remain valid after the cli/ split

**Files:**
- README.md
- RUNBOOK.md
- AGENTS.md
- CLAUDE.md
- packages/crawler/README.md
- packages/web/README.md
- packages/pipeline/docs/agent-requirements.md

**Flow:**
audit docs -> compare against code -> identify stale docs -> update living references -> record CLI validity

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
Only one stale doc was identified: packages/web/README.md needed a correction about theme persistence being cookie-first with WorkOS metadata as sync/backfill. Root README and RUNBOOK were confirmed accurate. The crawler CLI remains valid after the src/cli split.

### Rules
Do NOT rewrite dated/historical records — they are logs not implementation.

### Examples
Living docs include root README.md, RUNBOOK.md, AGENTS.md, CLAUDE.md, and per-package README.md/AGENTS.md files. Common commands remain npx tsx src/index.ts crawl, check, and stats; npm scripts provide shortcuts.

## Facts
- **documentation_pass_convention**: This repo uses a documentation pass convention for PR #12. [project]
- **living_reference_docs**: Living reference docs should stay synced with code. [project]
- **historical_records_policy**: Do not rewrite dated or historical records because they are logs, not implementation. [project]
- **root_readme_accuracy**: Root README is accurate, including the default AGENT_MODEL and the agent tool count. [project]
- **runbook_accuracy**: RUNBOOK is accurate. [project]
- **web_readme_theme_doc_issue**: packages/web/README.md previously documented theme persistence incorrectly as stored in WorkOS user metadata. [project]
- **theme_persistence_model**: Theme persistence is cookie-first with WorkOS user metadata used only for cross-device sync and backfill. [project]
- **crawler_cli_entrypoint**: The crawler CLI still uses npx tsx src/index.ts <cmd> after the cli/ split. [project]