- The document describes a refactor that split the pipeline CLI from one large 910-line `cli.py` into a `cli/` package.
- A shared bootstrap module (`pipeline.cli._shared`) now owns the Click group and Rich console setup.
- Command handling was broken into module-specific files for `build`, `references`, `federal`, `graph`, `eval`, and `audit`, with import side effects used to register commands.
- Compatibility was preserved through back-compat exports and continued support for `python -m pipeline.cli` via `__main__.py`.
- The refactor also required updating tests to monkeypatch helpers at their defining modules instead of only at `pipeline.cli`.
- Validation notes report a clean build/ruff run, 301 passed tests, 2 skipped, and all 25 commands registering successfully.
- Notable patterns/decisions include avoiding partially initialized package imports and keeping mixed-corpus build orchestration, eval defaults, and fee-schedule backlog behavior unchanged.

Structure / sections summary:
- `Reason`: explains why the refactor was documented.
- `Raw Concept`: summarizes the task, changes, affected files, flow, and timestamp.
- `Narrative`:
  - `Structure`: describes the new package organization.
  - `Dependencies`: notes import-order and monkeypatch implications.
  - `Highlights`: calls out preserved behavior and command count.
  - `Examples`: shows updated monkeypatch targets in tests.
- `Facts`: enumerates key implementation and validation facts about the split.

Notable entities / decisions:
- Files: `_shared.py`, `__init__.py`, `__main__.py`, and command modules for each CLI area.
- Preservation of direct imports and module execution behavior for compatibility.
- Tests expanded to cover mixed-corpus and eval-related command behavior.