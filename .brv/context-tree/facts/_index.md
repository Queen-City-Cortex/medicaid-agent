---
children_hash: f163c65b46ad8ebc8a521d92d00d8f7b28c6d7c986a9cc939a696bc66de42762
compression_ratio: 0.6465364120781527
condensation_order: 2
covers: [conventions/_index.md, project/_index.md]
covers_token_total: 1126
summary_level: d2
token_count: 728
type: summary
---
# facts domain overview

The `facts` domain contains durable operational knowledge for context-tree curation and one project-specific technical contract. It splits into two main lines: curation workflow conventions in `facts/conventions`, and policy-corpus scoring behavior in `facts/project`.

## `facts/conventions`
Covers the guardrails for durable knowledge curation into the context tree, centered on the **recon → extraction → curate → verify** workflow. Drill down into:

- **`context.md`** — high-level conventions for curation discipline, context-tree structure, facts extraction, and verification
- **`curation_workflow_guardrails.md`** — exact execution constraints and verification rules

Key preserved rules and patterns:
- **UPSERT-first curation** is the default.
- **Single-pass mode** is allowed when recon recommends it.
- Do **not print raw context** during curation.
- Use **`tools.curation.mapExtract()`** for chunked extraction.
- Pass **`taskId` as a bare variable**, not a quoted string.
- Verification should rely on **`result.applied[].filePath`**.
- Do **not** re-run `tools.curation.recon()` if recon has already been computed.

## `facts/project`
Combines operational curation guidance with a technical note on **policy corpus coverage scoring**. Drill down into:

- **`context.md`** — project facts curation anchor: RLM approach, UPSERT-first curation, context-tree hierarchy, facts domain, verification discipline
- **`policy_corpus_coverage_scoring.md`** — concrete scoring contract for `scoreCoverageSections`

Important technical structure preserved in `policy_corpus_coverage_scoring.md`:
- Flow: **section list → scoreCoverageSections → ranking by `primaryScore` / `supportScore`**
- Uses shared text helpers and term lists with **no mocks**
- Test coverage is organized around:
  - structural invariants
  - exact-score anchors
  - behavioral/property tests

Key scoring facts:
- Core helpers/inputs: `normalizeSearchText`, `combineText`, `scoreTermMatches`, `isCoverageLimitationText`, `CoverageQueryFlags`
- `combineText(section.title, section.content)` is part of the scoring pipeline
- Preserved numeric anchors:
  - empty section → `0/0`
  - numbered sections → `+0.5` to both scores
  - attachment titles → `-3` to both scores
  - limitation text → `+3` supportScore only
  - MA-2180 with `hcwdIncomePremiumQuery` → `+1.5` primaryScore only
  - `PHRASE_MATCH_WEIGHT = 1.8`
  - low-signal terms downweighted by `0.35`
- Flag-gated behavior includes **telehealth**, **certification**, and **HCWD** paths, with telehealth avoid-term penalties only active under `telehealthQuery`

### Drill-down guide
- Use **`facts/conventions/context.md`** for curation workflow structure and rules.
- Use **`facts/conventions/curation_workflow_guardrails.md`** for exact guardrails.
- Use **`facts/project/policy_corpus_coverage_scoring.md`** for the scoring contract and test anchors.