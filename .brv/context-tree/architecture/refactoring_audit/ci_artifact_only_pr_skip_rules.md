---
title: CI Artifact-only PR Skip Rules
tags: []
related: [architecture/refactoring_audit/repo_wide_refactoring_audit.md, facts/conventions/curation_workflow_guardrails.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-08T02:42:25.687Z'
updatedAt: '2026-07-08T02:42:25.687Z'
---
## Raw Concept
**Task:**
Document CI optimization for artifact-only pull requests and the related review-bot suppression rules.

**Changes:**
- Added pull_request paths-ignore for .brv/** and graphify-out/** in ci.yml
- Added pull_request paths-ignore for .brv/** and graphify-out/** in claude-code-review.yml
- Created greptile.json ignorePatterns for the same paths
- Disabled Greptile via the skip-review label
- Preserved push:main without paths-ignore so Railway deployment gates remain intact

**Files:**
- .github/workflows/ci.yml
- .github/workflows/claude-code-review.yml
- greptile.json

**Flow:**
artifact-only PR -> paths-ignore skips CI and review -> label skip-review suppresses Greptile -> mergeable without waiting for bots

**Timestamp:** 2026-06-13

**Patterns:**
- `^\.brv/\*\*$` - Ignore all curated context-tree changes in artifact-only PRs
- `^graphify-out/\*\*$` - Ignore generated graph output in artifact-only PRs
- `^skip-review$` - Label used to fully suppress Greptile review

## Narrative
### Structure
ci.yml and claude-code-review.yml now apply paths-ignore only on pull_request. The root greptile.json adds ignorePatterns for .brv/** and graphify-out/** and disables the skip-review label.

### Dependencies
Main branch push CI must remain fully active because Railway gates each deployment on the commit-specific CI run. The documented 2026-06-13 stranding incident is the reason push:main keeps no paths-ignore.

### Highlights
Artifact-only PRs can skip tests and code review while mixed source+artifact PRs still run full CI because paths-ignore only skips when every changed file matches. Artifact chore PRs should be created with gh pr create --label skip-review and can be merged once mergeable.

### Rules
push:main has NO paths-ignore because Railway gates each deployment on that commit's CI run.
paths-ignore semantics: workflow skips only when EVERY changed file matches, so mixed artifact+source PRs still run full CI.
ignorePatterns alone has no documented whole-PR skip.
Artifact chore PRs should be created with gh pr create --label skip-review and merged on mergeable without waiting for bots.

### Examples
Example artifact-only PR paths: .brv/** and graphify-out/**. Example label to suppress Greptile: skip-review.

## Facts
- **artifact_only_pr_paths_ignore**: ci.yml and claude-code-review.yml add pull_request paths-ignore for .brv/** and graphify-out/** [project]
- **main_branch_ci_protection**: push:main has no paths-ignore because Railway gates each deployment on the commit-specific CI run [project]
- **greptile_ignore_patterns**: greptile.json sets ignorePatterns for .brv/**, graphify-out/**, and greptile.json [project]
- **greptile_disabled_label**: greptile.json disables the skip-review label [project]
- **paths_ignore_semantics**: paths-ignore only skips a workflow when every changed file matches the ignored paths [convention]
