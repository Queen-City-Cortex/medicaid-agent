---
title: CI Workflow Concurrency and Test Gates
summary: CI workflow uses branch-safe concurrency, runs JS/Python/Neo4j tests, and includes a separate Docker build gate for production image validation.
tags: []
related: [agent_architecture/local_dev_setup/local_development_setup.md, auth_integration/workos_authkit_nextjs/context.md, database_operations/neo4j_auth/context.md, agent_architecture/local_dev_setup/documentation_pass_convention.md, agent_architecture/local_dev_setup/env_consolidation/repository_doc_audit_findings.md]
keywords: []
createdAt: '2026-06-13T03:57:10.520Z'
updatedAt: '2026-06-13T03:57:10.520Z'
---
## Reason
Document CI workflow behavior, concurrency policy, and deployment gating constraints from the workflow file

## Raw Concept
**Task:**
Document the CI workflow’s concurrency policy, test gates, and production build checks.

**Changes:**
- Added branch-safe concurrency that avoids cancelling main runs
- Documented the full CI sequence including Neo4j-backed tests
- Captured the separate production Docker build gate
- Recorded why e2e is excluded from CI

**Files:**
- .github/workflows/ci.yml

**Flow:**
push/pr -> concurrency policy -> checkout/setup -> lint/build/typecheck -> JS tests -> pipeline pytest -> agent integration tests -> docker build validation

**Timestamp:** 2026-06-13T03:56:39.950Z

## Narrative
### Structure
The workflow has one main `test` job and one parallel `docker-build` job. The `test` job provisions Node, Python, and Neo4j services, then runs linting, build, typecheck, JS tests, pipeline pytest, and agent integration tests.

### Dependencies
Depends on Railway deployment behavior, the ability to skip workflow/docs-only commits, a live Neo4j service for integration tests, and WorkOS-hosted credentials that are not available for hermetic e2e CI.

### Highlights
Main branch concurrency is intentionally protected to avoid stranded deploys. The workflow validates both application code and production Docker bundles before deployment.

### Rules
Cancel superseded runs on PRs/branches, but never on main: Railway gates each deployment on that commit's CI and path-skips workflow/docs-only commits, so cancelling a main run could strand an app-code commit's deploy behind a later skipped commit (the af1fad7 -> ecc6f43 shape from 2026-06-13).

### Examples
Example cancellation policy: `${{ github.ref != 'refs/heads/main' }}`. Example web build args: `NEXT_PUBLIC_MASTRA_URL=http://localhost:4111` and `NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/callback`.

## Facts
- **ci_triggers**: CI triggers on push and pull_request events targeting main. [project]
- **ci_concurrency_group**: Concurrency group is set to `${{ github.workflow }}-${{ github.ref }}`. [project]
- **ci_cancel_policy**: Cancel-in-progress is enabled only when the ref is not `refs/heads/main`. [project]
- **main_branch_cancellation_risk**: Main branch runs are intentionally not cancelled because Railway gates deployment on the specific commit’s CI and path-skipped workflow/docs-only commits can strand an app-code deployment behind a later skipped commit. [project]
- **pr_branch_cancellation**: PR and branch cancellation is treated as beneficial because there is no Railway gating there. [project]
- **cancel_in_progress_expression_support**: The workflow explicitly notes that `cancel-in-progress` accepts an expression, not just a bare boolean. [project]
- **ci_runner**: The test job runs on `blacksmith-4vcpu-ubuntu-2404`. [project]
- **neo4j_service_image**: CI provisions a Neo4j service using the `neo4j:2026.05-community` image with authentication `neo4j/medicaid-dev`. [project]
- **neo4j_test_env**: CI sets `NEO4J_URI=bolt://localhost:7687`, `NEO4J_USER=neo4j`, and `NEO4J_PASSWORD=medicaid-dev` for the test job. [project]
- **ci_tooling_versions**: The CI workflow installs Node.js 22 with npm cache enabled and Python 3.11 with pip cache enabled. [project]
- **pipeline_venv_setup**: The pipeline setup step runs `npm run setup -w @nc-medicaid/pipeline` to provision the Python virtual environment. [project]
- **ci_test_sequence**: CI runs linting, build, typecheck:tests, JS tests excluding the pipeline package, Python pytest for the pipeline package, and agent integration tests against real Neo4j. [project]
- **pipeline_test_exclusion**: The pipeline tests are excluded from the JS test step to avoid running them twice. [project]
- **explicit_pipeline_pytest_gate**: The workflow uses an explicit pytest step in `packages/pipeline` so pipeline failures are visible as a distinct CI gate. [project]
- **agent_integration_test_isolation**: The agent integration tests create their own vector indexes and `test:`-prefixed fixtures and mock the embedding API, so no pipeline data load is required. [project]
- **docker_build_job**: The workflow includes a separate `docker-build` job named `Production Docker builds` that runs in parallel with `test`. [project]
- **agent_docker_build**: The agent image build uses `docker build -f packages/agent/Dockerfile -t agent-ci .`. [project]
- **web_docker_build**: The web image build uses `docker build -f packages/web/Dockerfile` with placeholder `NEXT_PUBLIC_MASTRA_URL=http://localhost:4111` and `NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/callback` build args. [project]
- **missing_e2e_job_reason**: A no-e2e-job comment explains that `e2e/tests/auth.setup.ts` requires live WorkOS hosted-login credentials and cannot run hermetically in CI. [project]
