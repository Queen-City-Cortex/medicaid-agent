---
children_hash: b772e2c1e8368ee2a3dec31d783272dedc8a4f9c0d46eb9f07c1d33267b8df74
compression_ratio: 0.308119011598588
condensation_order: 1
covers: [context.md, policy_corpus_coverage_scoring.md]
covers_token_total: 1983
summary_level: d1
token_count: 611
type: summary
---
# facts/project

Operational guidance and policy-corpus scoring knowledge for the project facts domain. The domain combines durable curation workflow rules with a focused technical note on coverage-section scoring behavior.

## Key areas

- **Context curation workflow** — see `context.md`
- **Policy corpus coverage scoring** — see `policy_corpus_coverage_scoring.md`

## Structural overview

### `context.md`
- Defines the project facts topic as operational guidance for curating durable knowledge into the ByteRover context tree.
- Centers on the **RLM approach**, **UPSERT-first curation**, **context-tree hierarchy**, **facts domain**, and **verification discipline**.
- Serves as the high-level process anchor for how durable knowledge should be organized and validated.

### `policy_corpus_coverage_scoring.md`
- Documents the scoring behavior for policy-corpus coverage sections, focused on `scoreCoverageSections`.
- The scoring flow is: **section list → scoreCoverageSections → ranking by primaryScore/supportScore**, with flag-gated bonuses and penalties.
- Uses real shared text helpers and term lists with **no mocks**, making the tests a direct contract for the actual formula.
- The test suite is organized into **structural invariants**, **exact-score anchors**, and **behavioral/property tests**.

## Important technical decisions and facts

- Scoring builds text from `combineText(section.title, section.content)` and applies weighted phrase matching.
- Key helpers and inputs include:
  - `normalizeSearchText`
  - `combineText`
  - `scoreTermMatches`
  - `isCoverageLimitationText`
  - `CoverageQueryFlags` from `candidates.ts`
- Numeric anchors and rules preserved by tests:
  - empty section → `0/0`
  - numbered sections → `+0.5` to both scores
  - attachment titles → `-3` to both scores
  - limitation text → `+3` supportScore only
  - MA-2180 with `hcwdIncomePremiumQuery` → `+1.5` primaryScore only
  - phrase matches use `PHRASE_MATCH_WEIGHT = 1.8`
  - low-signal terms are downweighted with `0.35`
- Flag-gated paths include **telehealth**, **certification**, and **HCWD** behavior, with telehealth avoid-term penalties only active under `telehealthQuery`.

## Drill-down notes

- Use **`context.md`** for the curation workflow, content structure, and verification discipline.
- Use **`policy_corpus_coverage_scoring.md`** for the concrete scoring contract, test anchors, helper dependencies, and formula behavior.