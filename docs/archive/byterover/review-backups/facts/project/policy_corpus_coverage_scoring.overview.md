- Documents the coverage-section scoring behavior for policy corpus ranking, centered on `scoreCoverageSections` and its unit tests.
- The scorer uses shared text helpers to normalize and combine title/content text, then computes weighted phrase matches plus bonuses/penalties.
- Test coverage locks in exact score anchors for key cases: empty section, numbered sections, attachment titles, limitation text, and focus-term hits.
- Behavior is verified against real helpers and term lists with no mocks, making the suite a direct contract for the actual formula.
- Several behaviors are gated by query flags, including telehealth, certification, and HCWD-related scoring paths.
- The scoring flow is described as: section list -> `scoreCoverageSections` -> ranking by `primaryScore` and `supportScore`, with flag-dependent adjustments.
- Notable numeric decisions include `0/0` for empty sections, `-3` attachment penalty, `+0.5` numbered bonus, `+3` limitation support bonus, `+1.5` MA-2180 primary-only bonus, and weighted term scoring such as phrase matches and low-signal downweighting.

- Structure summary: starts with purpose/reason, then a raw concept block describing task, changes, files, flow, and timestamp; followed by narrative subsections for Structure, Dependencies, Highlights, Rules, and Examples; ends with a detailed Facts list.
- The test file is organized around structural invariants, exact-score anchors, and property/behavior tests.
- Dependencies mentioned include `internal/shared.js` text helpers, term lists, and `CoverageQueryFlags` from `candidates.ts`.

- Notable entities/patterns/decisions: `packages/policy-corpus/tests/frame/coverage-sections/scoring.test.ts`, `packages/policy-corpus/src/frame/coverage-sections/selection/scoring.ts`, `normalizeSearchText`, `combineText`, `scoreTermMatches`, `PHRASE_MATCH_WEIGHT = 1.8`, `LOW_SIGNAL = 0.35`, `isCoverageLimitationText`, `hcwdIncomePremiumQuery`, `telehealthQuery`, and `certificationQuery`.