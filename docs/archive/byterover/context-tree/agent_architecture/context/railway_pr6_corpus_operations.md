---
title: Railway PR6 Corpus Operations
summary: 'Railway PR6 corpus operations: Railway Pro topology, resumable corpus-job parsing, release gates, and bounded PDF parsing timeouts.'
tags: []
related: [database_operations/neo4j_write_read_consistency/context.md, agent_architecture/context/context.md, agent_architecture/context/railway_tcp_proxy_automation.md, agent_architecture/context/weekly_eval_and_launchd_ops_guardrails.md, agent_architecture/context/ws7_customer_readiness_weekly_refresh.md, agent_architecture/context/provider_health_checks_and_production_smoke_verification.md, agent_architecture/context/ws2_customer_readiness_reliability_fixes.md]
keywords: []
createdAt: '2026-07-26T17:38:11.422Z'
updatedAt: '2026-07-26T17:38:11.422Z'
---
## Reason
Document Railway PR6 corpus release and parsing operations

## Raw Concept
**Task:**
Document Railway PR6 corpus operations and release behavior

**Changes:**
- Introduced Railway Pro production topology with blue/green Neo4j and corpus-job services
- Documented resumable corpus parsing and release workflow
- Captured bounded parse timeout and concurrency guard requirements
- Recorded the OpenCV runtime blocker fix in PR #109

**Files:**
- docs/operations/railway-production.md
- packages/pipeline/railway.json
- scripts/ops/railway-corpus-job.sh
- packages/pipeline/src/pipeline/parse/converter.py
- packages/pipeline/Dockerfile

**Flow:**
bootstrap -> parse documents -> persist artifacts -> skip unchanged work -> release inactive graph -> smoke test -> promote

**Timestamp:** 2026-07-26

**Author:** source context

## Narrative
### Structure
The production topology separates long-running agent services from dedicated corpus-job services and uses a blue/green Neo4j deployment. The parser stores output artifacts and metadata on persistent storage so later executions can resume from prior work.

### Dependencies
Release promotion depends on build, load, embedding, audit, evaluation, and authenticated smoke checks completing successfully. The parser depends on Docling, Python document libraries, LibreOffice for legacy DOC conversion, and a pinned container image that includes libgl1 for cv2.

### Highlights
Railway cron overlap is handled by Railway itself for a single cron service, but concurrency protection must be added if a second runner is introduced. The bootstrap scale and sequential parsing explain why the first run can exceed a day.

### Rules
Do not curate transient progress percentages, execution duration, or ETA.

### Examples
Daily discovery uses CORPUS_JOB_MODE=discover; release uses CORPUS_JOB_MODE=release; audit uses CORPUS_JOB_MODE=audit; evaluate uses CORPUS_JOB_MODE=evaluate; backup uses CORPUS_JOB_MODE=backup.

## Facts
- **context_entry_policy**: Create a new dedicated context entry for Railway PR6 corpus operations and do not rewrite or consolidate unrelated existing entries. [project]
- **production_topology**: Production runs on Railway Pro with separate neo4j-blue, neo4j-green, corpus-job, and object-storage-backed backup/release infrastructure. [project]
- **release_gate_dependency**: The customer-facing agent must remain on the legacy Neo4j service until the inactive graph completes build, load, embedding, audit, evaluation, authenticated smoke checks, and all mandatory release gates. [project]
- **bootstrap_scale**: Initial corpus bootstrap traverses 4,424 source documents and can legitimately take more than a day because PDF parsing is sequential and many documents use CPU-only RapidOCR/table extraction. [project]
- **artifact_storage**: Per-document parse sidecars and source artifacts live on the corpus-job persistent volume. [project]
- **resumability**: Completed artifacts survive execution boundaries, so later runs can skip unchanged work rather than restart from zero. [project]
- **parse_timeout**: The parser isolates each file and defaults PIPELINE_PARSE_TIMEOUT_SECONDS to 600, so pathological PDFs fail boundedly instead of stalling the family indefinitely. [project]
- **cron_overlap_behavior**: Railway cron services prevent same-service overlap by skipping the next scheduled execution when a previous execution is still active, rather than terminating the running job. [project]
- **lock_requirement**: No additional application lock is needed while corpus automation remains one Railway cron service. [project]
- **concurrency_guard**: A persistent lease or idempotency guard is needed before introducing a second corpus service or an external/manual runner that could execute concurrently. [project]
- **bootstrap_resumability**: The first production bootstrap validated resumability when a scheduled execution continued from artifacts created by the preceding manual execution. [project]
- **opencv_blocker_fix**: PR #109 / commit a28349491f2c5f3f0fcfdd20defd84c76fa73534 added libgl1 and an in-image cv2 import smoke test, resolving the OpenCV runtime blocker. [project]
- **excluded_metrics**: Transient progress percentages, execution duration, and ETA should not be curated. [convention]
