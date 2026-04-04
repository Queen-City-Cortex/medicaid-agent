---
children_hash: b8f451ab5b02bc0379525d73ca43c76bd81acc2987bbb8f54e0dd4eefbe80691
compression_ratio: 0.4594594594594595
condensation_order: 0
covers: [context.md, root_environment_consolidation.md]
covers_token_total: 629
summary_level: d0
token_count: 289
type: summary
---
### env_consolidation (subtopic of local_dev_setup)
- **Focus:** Documents the shift to a single root `.env` file that centralizes all secrets for LLM integrations, WorkOS configuration, and E2E test credentials, serving as an extension of the local development setup.
- **root_environment_consolidation.md:** 
  - **Architecture:** Replaced a circular symlink chain with a concrete root `.env` adjacent to package directories, furnishing keys for OpenAI, Anthropic, Voyage, WorkOS client settings, redirect URIs, and the WorkOS test user.
  - **Flow:** Audit existing symlinks → delete stale links → populate the real root `.env` with shared secrets → recreate `packages/agent/.env` and `packages/web/.env.local` as absolute symlinks → verify LLM/WorkOS/test credentials.
  - **Dependencies/Relationships:** Both agent and web packages rely on the root file via absolute symlinks; all credential updates must occur at the root before restarting services to keep keys synchronized.
  - **Key Decisions:** Centralizing secrets removes duplication/stale keys, eliminates circular symlink creation, and ensures consistent Access for WorkOS and LLM credentials.