---
title: Environment Variable Consolidation
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-04T04:50:12.783Z'
updatedAt: '2026-04-04T04:50:12.783Z'
---
## Raw Concept
**Task:**
Document the consolidation of environment variables into a single root .env file and the removal of circular symlinks.

**Changes:**
- Root .env replaced the per-package symlink chain and now hosts every shared credential.
- Removed the circular symlink where root .env pointed back to packages/agent/.env before consolidation.
- Packages/agent/.env and packages/web/.env.local were recreated as absolute symlinks to the new root .env file.

**Files:**
- .env

**Flow:**
Create real root .env -> populate with LLM keys, WorkOS credentials, and E2E test user -> remove old symlink chain -> recreate package env files as absolute symlinks -> reload services to pick up consolidated secrets.

**Timestamp:** 2026-04-04

**Author:** local_dev_setup

## Narrative
### Structure
The repository now treats root .env as the single truth for LLM API keys, WorkOS authentication, and E2E test credentials while keeping the packages/agent and packages/web env files as symlinks to maintain legacy locations.

### Dependencies
Both the agent server and the web UI load their WorkOS client ID, API key, cookie password, and redirect URI from the shared root .env and require the symlinked paths to exist for tooling that still references packages/agent/.env or packages/web/.env.local.

### Highlights
Consolidation eliminates circular symlinks, prevents divergence between stacks, and ensures all credentials are updated in one place. The WorkOS test user email and the LLM API keys now live alongside each other for reproducible local development.

## Facts
- **llm_api_keys**: Root .env now contains every LLM API key (OpenAI, Anthropic, Voyage) used by the agent stack. [project]
- **workos_shared_config**: WorkOS client ID, API key, cookie password, and redirect URIs are centralized in root .env for both packages/agent and packages/web. [environment]
- **package_env_symlinks**: packages/agent/.env and packages/web/.env.local are absolute symlinks to root .env so both services read the same secrets. [environment]
- **e2e_test_user_email**: Testing@queencitycortex.com is the pre-provisioned WorkOS E2E test user referenced from this consolidated file. [environment]
