---
title: Weekly Eval and Launchd Ops Guardrails
summary: Eval gating prevents production regressions, and launchd installation manages daily and weekly ops agents with environment substitution and local logging.
tags: []
related: [agent_architecture/context/ws7_customer_readiness_weekly_refresh.md, agent_architecture/context/ws2_customer_readiness_reliability_fixes.md, agent_architecture/context/ws5_customer_readiness.md, agent_architecture/context/railway_tcp_proxy_automation.md, agent_architecture/context/backup_mastra_shell_script_learnings.md, agent_architecture/context/railway_pr6_corpus_operations.md]
keywords: []
createdAt: '2026-07-10T19:05:11.486Z'
updatedAt: '2026-07-10T19:05:11.486Z'
---
## Reason
Document the retrieval eval baseline, deployment gating logic, and launchd installation requirements for scheduled ops jobs.

## Raw Concept
**Task:**
Document eval-gate and install-launchd ops guardrails

**Changes:**
- Added retrieval eval gating with baseline advancement
- Added launchd agent installation and optional uninstall flow
- Added operational guidance for Healthchecks and first-run verification

**Files:**
- scripts/ops/eval-gate.sh
- scripts/ops/install-launchd.sh

**Flow:**
validate references -> run retrieval eval -> locate newest result -> compare against baseline -> advance baseline on pass -> bootstrap launchd agents -> supervise first run

**Timestamp:** 2026-07-10T19:03:07.746Z

**Author:** ByteRover context engineer

## Narrative
### Structure
The eval gate is a two-step quality filter: first validate the graph references, then run retrieval eval and compare the newest run with the last-known-good baseline. The launchd installer is a lightweight bootstrapper that copies templated plists into the user LaunchAgents directory, restarts existing agents, and prints next-step instructions.

### Dependencies
Depends on the pipeline Python CLI, local eval result files, macOS launchd, and Healthchecks for external pings. The installer also expects the repo checkout path and home directory to be substituted into plist templates.

### Highlights
The eval gate is intentionally narrow: it gates on retrieval quality only because answer-level judge scores are considered noisy. The launchd instructions call out the required /opt/homebrew/bin PATH addition because launchd does not inherit fish shell configuration.

### Rules
Usage: scripts/ops/eval-gate.sh    (exit 0 = safe to deploy). First run (no baseline) records one and passes. The install script supports --uninstall. Next steps: 1. Create three checks at https://healthchecks.io (daily-check: period 1d grace 12h; weekly-refresh: period 7d grace 24h; backup-mastra: period 1d grace 12h) and put their ping URLs in ~/.config/nc-medicaid/ops.env as HC_URL_DAILY / HC_URL_WEEKLY / HC_URL_MASTRA_BACKUP (+ HC_URL_BACKUP for the corpus backup). 2. Kick a supervised first run: launchctl kickstart -k gui/$(id -u)/com.ncmedicaid.weekly-refresh and watch ~/Library/Logs/nc-medicaid/.

### Examples
The eval gate records the new retrieval run ID in ~/.cache/nc-medicaid/last-good-eval after a passing compare. The install script emits "installed <label>" or "uninstalled <label>" per agent.

## Facts
- **eval_gate_precheck**: The eval gate validates dataset references against the graph before running retrieval eval. [project]
- **retrieval_eval_storage**: Retrieval eval results are stored in data/eval-results/*_retrieval.json. [project]
- **newest_retrieval_eval_selection**: The newest retrieval eval file is identified by sorting files by modification time. [project]
- **retrieval_baseline_file**: The baseline file for passing retrieval evals is ~/.cache/nc-medicaid/last-good-eval. [project]
- **launchd_labels**: install-launchd.sh installs or reinstalls com.ncmedicaid.daily-check, com.ncmedicaid.weekly-refresh, and com.ncmedicaid.backup-mastra. [project]
- **launchd_agent_dir**: The launchd agent directory is ~/Library/LaunchAgents. [environment]
- **launchd_domain**: The launchd domain is gui/$(id -u). [environment]
- **launchd_log_dir**: The install script creates ~/Library/Logs/nc-medicaid. [environment]
- **healthchecks_schedule**: The install script suggests Healthchecks periods and grace windows for daily-check, weekly-refresh, backup-mastra, and HC_URL_BACKUP. [project]
- **weekly_refresh_first_run**: The supervised first run uses launchctl kickstart -k gui/$(id -u)/com.ncmedicaid.weekly-refresh. [project]
- **launchd_plist_bootstrap**: launchd agents are bootstrapped after plist substitution using __REPO_ROOT__ and __HOME__. [project]
