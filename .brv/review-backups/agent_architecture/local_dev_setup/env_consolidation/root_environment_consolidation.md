---
title: Root Environment Consolidation
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-04T04:49:31.671Z'
updatedAt: '2026-04-04T04:49:31.671Z'
---
## Raw Concept
**Task:**
Document the consolidation of environment variables into a single root .env file and the symlink update for project packages.

**Changes:**
- Converted the circular symlink chain into a concrete root .env file.
- Repointed packages/agent/.env and packages/web/.env.local to the root file as absolute symlinks.
- Ensured the root file now hosts every LLM key, WorkOS credential, and the WorkOS test user credentials.

**Files:**
- .env
- packages/agent/.env
- packages/web/.env.local

**Flow:**
Audit existing symlinks -> delete broken references -> create a real root .env containing all shared secrets -> recreate per-package env files as absolute symlinks pointing back to the root -> verify LLM/WorkOS/test creds are consistently accessible.

**Timestamp:** 2026-04-04

## Narrative
### Structure
The root-level .env now sits beside package directories and stores API keys for OpenAI, Anthropic, Voyage, WorkOS client settings, WorkOS redirect URIs, and the WorkOS test user email/password.

### Dependencies
Packages/agent and packages/web rely on this consolidated root file because their local .env variants are symlinked to it; any change to the keys must be made at root before restarting packages.

### Highlights
Centralizing all secrets into a single file eliminates stale/duplicated keys, prevents circular symlink creation, and keeps WorkOS and LLM credentials synchronized across agent and web services.

## Facts
- **root_env_single_source**: Root .env is now the single source of truth that stores all LLM API keys, WorkOS credentials, and the E2E test user. [environment]
- **env_symlink_target**: packages/agent/.env and packages/web/.env.local are absolute symlinks pointing to the root .env file to keep both services aligned. [environment]
- **symlink_resolution**: The prior circular symlink (root .env → packages/agent/.env → root) was resolved by first removing all symlinks before creating a real root .env file. [environment]
