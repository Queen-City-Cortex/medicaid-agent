---
title: Pipeline CLI Package Split
summary: Pipeline CLI was split from one large click file into a cli package with shared setup, command modules, preserved back-compat exports, and extensive test coverage.
tags: []
related: [packages/pipeline/tests/test_cli_mixed_corpus.py.md, packages/pipeline/src/pipeline/cli/build.py.md, packages/pipeline/src/pipeline/cli/eval.py.md, packages/policy_corpus/retrieval/hybrid_retrieval_collector_pipeline.md, packages/policy_corpus/retrieval/reranker_gate_logic_and_a_b_evaluation.md]
keywords: []
createdAt: '2026-06-18T02:32:42.364Z'
updatedAt: '2026-06-18T02:32:42.365Z'
---
## Reason
Document the refactor that split the monolithic pipeline CLI into a package of command modules.

## Raw Concept
**Task:**
Document the refactor that split the pipeline CLI into a package structure.

**Changes:**
- Split the monolithic 910-line cli.py into a cli/ package.
- Added a shared module for the click group and console.
- Added module-specific command files for build, references, federal, graph, eval, and audit.
- Preserved direct imports and module execution behavior for compatibility.
- Updated tests to account for module-level monkeypatch targets after the split.

**Files:**
- packages/pipeline/src/pipeline/cli/_shared.py
- packages/pipeline/src/pipeline/cli/__init__.py
- packages/pipeline/src/pipeline/cli/__main__.py
- packages/pipeline/src/pipeline/cli/build.py
- packages/pipeline/src/pipeline/cli/references.py
- packages/pipeline/src/pipeline/cli/federal.py
- packages/pipeline/src/pipeline/cli/graph.py
- packages/pipeline/src/pipeline/cli/eval.py
- packages/pipeline/tests/test_cli_mixed_corpus.py

**Flow:**
cli.py -> cli package -> shared setup + command modules -> compatibility exports -> tests and validation

**Timestamp:** 2026-06-18T02:32:12.346Z

## Narrative
### Structure
The CLI is now organized as a package with a shared bootstrap module, a package entry point, a module for each command family, and a __main__ module for direct execution.

### Dependencies
The refactor depends on avoiding partially initialized package imports and on moving monkeypatched helper targets to their defining modules.

### Highlights
Mixed-corpus build orchestration, eval command defaults, and fee-schedule backlog behavior are preserved; the command suite still registers 25 commands.

### Examples
Tests now monkeypatch helpers on pipeline.cli.build, pipeline.cli.eval, and pipeline.cli.audit rather than only on pipeline.cli.

## Facts
- **cli_refactor**: packages/pipeline/src/pipeline/cli.py was split into a cli/ package. [project]
- **cli_shared_module**: pipeline.cli._shared.py owns the shared click group and rich console. [project]
- **cli_command_modules**: The package entry point imports build, references, federal, graph, eval, and audit for registration side effects. [project]
- **cli_module_execution**: python -m pipeline.cli is preserved via __main__.py. [project]
- **cli_back_compat_exports**: The refactor preserves back-compat helper access through pipeline.cli exports. [project]
- **cli_tests**: The split introduces tests covering build-mixed-corpus, eval-mixed-corpus, eval defaults, eval-answer-stability, eval-runs, and fee-schedule-backlog command behavior. [project]
- **cli_validation_status**: The validation status reported build clean, ruff clean, 301 passed, 2 skipped, and all 25 commands register. [project]
