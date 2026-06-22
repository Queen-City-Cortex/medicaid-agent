# CLAUDE.md

The role of this file is to describe common mistakes and points of confusion agents might encounter as they work in this project.

If you ever encounter something in the project that surprises you, please alert the developer working with you and update this file to help prevent future agents from having the same issue.

## Greenfield Project

This project is super greenfield. It has no users yet, no real data, etc. Be ruthless about eliminating tech debt. Make whatever changes you want and don’t worry about it, we’ll figure it out when we ship.

## Dead-code detection in the pipeline package

`npm run lint -w @nc-medicaid/pipeline` runs **both** `ruff check src/` **and** `vulture src vulture_whitelist.py`. Vulture exits non-zero on *any* finding, so introducing dead Python code (or a vulture false positive) fails lint.

`packages/pipeline/vulture_whitelist.py` is a **curated** list of confirmed false positives — things vulture can't see are used: Click CLI commands (`@cli.command`), `HTMLParser` method overrides, driver/library attributes (e.g. `row_factory`), symbols referenced only by tests, and `SourceFamilyManifest` schema fields populated from `corpus-manifest.json`. If lint flags one of these for new code, add it to the whitelist.

Do **not** regenerate the whitelist with a bare `vulture src --make-whitelist` and commit it wholesale — that silently buries genuine dead code (it once would have hidden ~12 dead query constants). Use `--make-whitelist` to produce *candidates*, then triage: real dead code gets deleted, only true false positives go in the whitelist. The whitelist is excluded from ruff (`extend-exclude` in `pyproject.toml`) since its bare names would trip F821.
