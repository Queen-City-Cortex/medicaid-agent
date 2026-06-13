---
children_hash: 07080dd5cfe4f2dc2fd8866c837ca455257fd9eafe86901ad80621671603d948
compression_ratio: 0.6283524904214559
condensation_order: 1
covers: [env_consolidation/_index.md, local_development_setup.md]
covers_token_total: 522
summary_level: d1
token_count: 328
type: summary
---
# Local Dev Setup

This d1 summary consolidates the environment and setup knowledge under `agent_architecture/local_dev_setup`, with drill-down points for:
- `env_consolidation/_index.md`
- `local_development_setup.md`

## Structural overview

The topic covers repo-level requirements for starting the NC Medicaid Navigator local services, especially the Neo4j, web, and agent stacks. It also captures the environment-variable strategy that supports those services.

## Key architectural decisions

- The repository root `.env` is the single source of truth for environment variables.
- `packages/agent/.env` and `packages/web/.env.local` are absolute symlinks to the root `.env`.
- The previous circular symlink chain was removed by deleting symlinks first, then creating a real root `.env`.

## Key setup and workflow concerns

- Local development depends on coordinated startup of:
  - Neo4j
  - web app
  - agent stack
- The setup preserves expectations around:
  - docker compose usage
  - workspace scripts
  - env placement
  - Neo4j service configuration
  - dev workflow rules

## Drill-down references

- See `env_consolidation/_index.md` for the environment source-of-truth and symlink-resolution decision.
- See `local_development_setup.md` for the broader repo startup and local dev workflow details.