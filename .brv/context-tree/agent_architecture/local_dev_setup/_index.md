---
children_hash: da1777778025720cd833e2148d5905c984d8747a32bee8c2823b112782bbd1ff
compression_ratio: 0.39063906390639064
condensation_order: 1
covers: [ci_workflow_concurrency_and_test_gates.md, env_consolidation/_index.md, local_development_setup.md]
covers_token_total: 2222
summary_level: d1
token_count: 868
type: summary
---
# d1 Structural Summary: `local_dev_setup`

This cluster groups repository-level operational guidance for running, validating, and maintaining the local NC Medicaid Navigator development environment. The topics connect around a shared concern: keeping the repo runnable and docs/configuration aligned as the web, agent, pipeline, and Neo4j stack evolve.

## `local_development_setup.md`
- Serves as the main local-dev reference for starting the NC Medicaid Navigator stacks.
- Covers repo-level requirements for:
  - local startup of Neo4j, web, and agent services
  - docker compose usage
  - workspace scripts
  - environment placement expectations
  - Neo4j service config
  - dev workflow rules
- Acts as the authoritative overview for how contributors bring up and work in the repository.

## `ci_workflow_concurrency_and_test_gates.md`
- Describes the CI workflow that validates code before deployment.
- Core structure:
  - one main `test` job
  - one parallel `docker-build` job for production image validation
- Test sequence includes:
  - checkout/setup
  - lint, build, typecheck
  - JS tests
  - pipeline pytest
  - agent integration tests against live Neo4j
- Key architectural decisions:
  - branch-safe concurrency
  - cancel superseded runs on PRs/branches
  - never cancel main runs because Railway gates deployment on the commit-specific CI result and skipped commits can strand deploys behind later no-op commits
- Important exclusions and constraints:
  - pipeline tests are excluded from the JS test step to avoid duplication
  - e2e is omitted from CI because WorkOS hosted-login credentials cannot be exercised hermetically
- The separate `docker-build` gate validates production bundles for both agent and web images.

## `env_consolidation/_index.md`
- Summarizes the environment consolidation work under `local_dev_setup`.
- Main decision:
  - the root `.env` file is the single source of truth for LLM API keys, WorkOS auth config, and E2E credentials
- Repository layout impact:
  - `packages/agent/.env` and `packages/web/.env.local` are absolute symlinks to the root file
  - a previous circular symlink chain was removed by deleting symlinks first and then creating a real root `.env`
- Drill into this area for the rationale and filesystem layout behind centralized configuration.

## `repository_doc_audit_findings.md`
- Captures the documentation pass convention and repository docs audit results.
- Main distinction preserved across docs:
  - living reference docs must stay synced with current code
  - historical/dated records and forward-plan artifacts should not be rewritten
- Audit findings:
  - root `README.md` and `RUNBOOK.md` were verified accurate
  - one stale doc was found: `packages/web/README.md`
  - the stale theme persistence description was corrected from an incorrect WorkOS-user-metadata model to the actual cookie-first model, with WorkOS metadata used only for cross-device sync/backfill
- Also confirms crawler CLI commands remained valid after the `cli/` split.

## Structural relationships
- `local_development_setup.md` is the umbrella operational guide.
- `ci_workflow_concurrency_and_test_gates.md` extends that operating model into CI and deployment safety.
- `env_consolidation/_index.md` documents how environment configuration is centralized to support the local workflow.
- `repository_doc_audit_findings.md` preserves the doc-maintenance rules that keep the setup instructions trustworthy over time.