# CI maintenance

Consolidates the action upgrades from PRs #88–#91 using immutable official v7 commit SHAs. Full technical CI runs for every PR base, including stacked parser work. The main push trigger and existing runtime, integration, Docker, and corpus operational gates remain intact.

Dependabot PRs skip the OAuth-dependent Claude review because they cannot read the human credential. They retain technical gates and human review. No arbitrary bot permission, fork-secret access, or `pull_request_target` event is added.

Dependabot separates compatible production/development updates from deliberate major migrations. Node Docker maintenance includes the corpus-job image, and runtime major upgrades wait for an aligned project migration. GitHub Actions updates are grouped to avoid four independent stale workflow branches.
