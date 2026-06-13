---
children_hash: b83d43bbc74c72f9bf9cf82d763fec1e90992b308a1f0dfdef6bcb308d7e0682
compression_ratio: 0.6805896805896806
condensation_order: 0
covers: [root_environment_consolidation.md]
covers_token_total: 407
summary_level: d0
token_count: 277
type: summary
---
# Local Dev Setup: Environment Consolidation

- **Child entry:** `root_environment_consolidation.md`
- **Parent topic:** `agent_architecture/local_dev_setup`

## Structural overview

This entry documents the consolidation of environment variables into the repository root `.env` file as the single source of truth for:
- LLM API keys
- WorkOS authentication configuration
- E2E test credentials

## Key architectural decision

- The repo now centralizes all environment variables at the root `.env`.
- `packages/agent/.env` and `packages/web/.env.local` are **absolute symlinks** to the root file.
- The previous circular symlink chain was eliminated by removing all symlinks first, then creating a real root `.env`.

## Relationship to other entries

- This is a focused follow-up within **`local_dev_setup`**.
- It complements the broader local development setup work by describing the environment-variable source-of-truth strategy rather than the full setup process.

## Drill-down reference

- See **`root_environment_consolidation.md`** for the operational consolidation details and symlink resolution.