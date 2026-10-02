# Maintain project knowledge in Git

Status: Accepted by the developer in the conversation authorizing this migration.

## Problem

The local ByteRover query repeatedly returned `Bad Request`, including after authentication and provider reconnection. The repository skill required BRV before work, making context gathering depend on a failing service. Existing memory was already stored as local Markdown and included duplicate generated summaries and curation metadata.

## Decision

Maintain active knowledge under `docs/` with a concise `AGENTS.md` entry point. Gather context through the documentation index, local text search, and source inspection. Update documentation alongside implementation changes in Git.

Preserve the complete former `.brv` tree and the removed skill in an inert historical archive. Keep generated files unchanged there; promote only source-checked facts into the active guides. Ignore newly generated `.brv` runtime state and require no hosted memory provider or automatic rewriting process.

## Alternatives

Repairing BRV would retain the provider and daemon dependency. Replacing it immediately with another hosted memory product would introduce credentials, migration work, and another external dependency. A custom semantic-search system would add maintenance before ordinary text search has demonstrated a limitation.

## Consequences

Any coding agent or developer can read and edit project knowledge offline. Git diffs show documentation changes alongside code. Contributors must maintain the index and correct stale statements; plain text search does not provide semantic retrieval. Add local semantic search only if concrete retrieval failures justify it.

The archive preserves observations, not proof that they remain correct. Current source and verification take precedence. See the [knowledge workflow](../development/knowledge-workflow.md) and [archive inventory](../archive/byterover/README.md).
