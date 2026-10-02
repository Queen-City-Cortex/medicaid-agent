---
title: WS7 Customer Readiness Weekly Refresh
summary: Weekly refresh orchestration for crawl, pipeline, audit, eval gate, change gate, deploy, verification, and backup, including Railway TCP proxy lifecycle and launchd scheduling.
tags: []
related: [agent_architecture/context/curated_operational_knowledge.md, agent_architecture/context/ws2_customer_readiness_reliability_fixes.md, agent_architecture/local_dev_setup/ci_workflow_concurrency_and_test_gates.md, agent_architecture/context/ws5_customer_readiness.md, agent_architecture/context/weekly_eval_and_launchd_ops_guardrails.md, agent_architecture/context/railway_tcp_proxy_automation.md, agent_architecture/context/railway_pr6_corpus_operations.md]
keywords: []
createdAt: '2026-07-10T19:05:11.483Z'
updatedAt: '2026-07-10T19:05:11.483Z'
---
## Reason
Document the weekly refresh pipeline, eval/change gates, Railway proxy handling, and launchd scheduling for customer readiness.

## Raw Concept
**Task:**
Document the WS7 customer-readiness weekly refresh and ops scripts

**Changes:**
- Added weekly-refresh orchestration from crawl through backup
- Documented eval gate and change gate behavior
- Documented Railway TCP proxy create/delete automation
- Documented launchd installation and scheduling details

**Files:**
- scripts/ops/weekly-refresh.sh
- scripts/ops/railway-tcp-proxy.sh
- scripts/ops/eval-gate.sh
- scripts/ops/install-launchd.sh

**Flow:**
launchd or manual trigger -> acquire lock -> healthcheck trap/start -> crawl -> pipeline run-all -> corpus audit -> eval gate -> change gate -> optional deploy-data -> verify -> backup -> healthcheck ok

**Timestamp:** 2026-07-10T19:03:07.746Z

**Author:** ByteRover context engineer

## Narrative
### Structure
The weekly refresh script is the top-level orchestrator. It sources shared lib.sh helpers, enforces locking and healthcheck lifecycle hooks, runs the crawler and pipeline, gates deployment on retrieval eval and corpus change detection, then backs up the corpus.

### Dependencies
Depends on Docker, jq, rclone, the pipeline virtualenv Python, the crawler package, Railway GraphQL v2, and launchd. The deploy path depends on a temporary Railway TCP proxy because the Neo4j bolt endpoint must not stay public after the job exits.

### Highlights
The design intentionally separates retrieval quality gating from corpus-change gating. Eval regression blocks production deployment, and unchanged corpus state skips the destructive deploy unless forced. The proxy lifecycle is protected by a composable EXIT-hook dispatcher so cleanup composes with lock and healthcheck teardown.

### Rules
The eval gate BLOCKS the prod push on retrieval regression: prod keeps last week's graph (healthy) and the failure alerts via healthchecks. The change gate skips the destructive deploy when nothing changed: a deploy-data run wipes prod and re-embeds everything against the Voyage API — pointless spend and risk on a no-change week. FORCE_DEPLOY=1 overrides. The Neo4j TCP proxy is deleted in an EXIT trap so a mid-run failure never leaves bolt exposed publicly.

### Examples
Manual run path: weekly-refresh.sh may be run directly. First-run launchd validation uses launchctl kickstart -k gui/$(id -u)/com.ncmedicaid.weekly-refresh and logs to ~/Library/Logs/nc-medicaid/. Railway proxy creation returns host:port and strips the trailing dot from the domain.

## Facts
- **ws7_pr_stack**: WS7 customer-readiness is associated with PR #80 and stacked on PR #79. [project]
- **weekly_refresh_flow**: weekly-refresh.sh orchestrates crawl → run-all → audit → eval-gate → change-gate → deploy-data → verify → backup. [project]
- **eval_gate_behavior**: The eval gate blocks the production push on retrieval regression. [project]
- **change_gate_behavior**: The change gate skips the destructive deploy when nothing changed unless FORCE_DEPLOY=1 overrides it. [project]
- **tcp_proxy_teardown**: The Neo4j TCP proxy is deleted in an EXIT trap so a mid-run failure never leaves bolt exposed publicly. [other]
- **railway_graphql_auth**: Railway GraphQL v2 automation uses backboard.railway.com and authenticates with .user.accessToken from ~/.railway/config.json. [environment]
- **railway_token_field**: The .user.token field returns Not Authorized. [environment]
- **railway_domain_format**: The Railway API returns the proxy domain with a trailing dot, which must be stripped. [environment]
- **railway_production_environment_id**: Production environment ID is 1c44225d-3afb-4c5f-b4e1-ea2b93dbbd9d. [environment]
- **railway_neo4j_service_id**: The Neo4j service ID is 1de48388-d6f6-4687-ad6c-9bb57c15983c. [environment]
- **launchd_agents**: install-launchd.sh installs or reinstalls three launchd agents: daily-check, weekly-refresh, and backup-mastra. [project]
- **launchd_plist_substitution**: launchd plists use __REPO_ROOT__ and __HOME__ substitution. [project]
- **launchd_path_requirement**: launchd PATH must include /opt/homebrew/bin because launchd does not load fish config. [environment]
- **daily_check_verification**: daily-check was verified live under launchctl kickstart. [project]
- **deploy_manifest_cache**: The change gate hashes the parsed-dir stat manifest into ~/.cache/nc-medicaid/last-deploy.manifest. [project]
- **eval_baseline_cache**: The eval gate baseline is stored in ~/.cache/nc-medicaid/last-good-eval. [project]
- **weekly_refresh_schedule**: The weekly refresh is scheduled via launchd on Saturdays and is safe to run manually any time. [project]
