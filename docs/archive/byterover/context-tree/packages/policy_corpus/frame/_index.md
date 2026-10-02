---
children_hash: 2b52964a2a13f3ce0b07f986f8d2726420e8fe8d7ab8099fef14c4244e1afbbe
compression_ratio: 0.2853087295954578
condensation_order: 0
covers: [coverage_selection_and_graph_fixtures.md, federal_authority_pairing_and_rebalance.md]
covers_token_total: 2818
summary_level: d0
token_count: 804
type: summary
---
# Policy Corpus Frame Pipeline

## Coverage Selection and Graph Fixtures
- The frame layer is split across `packages/policy-corpus/src/frame/coverage/candidates.ts`, `coverage/selection.ts`, and `federal-authority.ts`.
- `SectionCandidate.score` was removed; selection is now positional rather than score-field driven.
- Coverage selection is implemented as a 5-stage pipeline:
  1. score coverage sections
  2. collect/group by coverage flags
  3. build initial selection
  4. build anchors
  5. assemble final sections by merging primary, supporting, and avoid sections
- Shared strict Neo4j graph fixtures centralize:
  - typed record builders
  - query matchers
  - corpus/session stubs
  - handler execution checks
- Key fixture behavior:
  - strict records throw on missing fields
  - `expectAllHandlersUsed()` is required to flush dead handlers
  - scripted runs throw on unexpected extra queries unless `allowExtraQueries` is set
- A known rough edge is that the federal collector scans `federal_regulation` and `federal_statute` together, which can mask per-docType test coverage gaps.

### Drill down
- `coverage_selection_and_graph_fixtures.md` for scoring, grouping, anchors, and graph-fixture behavior.

## Federal Authority Pairing and Rebalance
- Federal authority retrieval now explicitly pairs statute and regulation when query intent indicates an authority citation.
- The workstream is driven by `asksForAuthorityCitation` in `query-intent.ts` and `authorityCitationQuery`.
- Authority handling adds:
  - title boosting for official CFR/program headings
  - statute/regulation title pairing
  - candidate pairing so CFR remains authority-first
- The federal-authority pipeline resolves evidence in four steps:
  1. `buildFederalAuthoritySignals`
  2. `collectFederalAuthorityEvidence`
  3. `collectFederalImplementationEvidence`
  4. `buildFederalAuthorityCandidateSets`
- Rebalance hints adjust primary/supporting/avoid sections for:
  - waiver authority
  - SPA
  - EPSDT
- Statute retention is preserved so one `federal_statute` section remains visible even when regulation hints dominate.
- Ordering matters in rebalance hints:
  - `WAIVER_AUTHORITY_HINT` must run before `WAIVER_HINT`
- Intent-specific routing examples:
  - 1915(c) HCBS waiver authority → `42 CFR Part 441 Subpart G`
  - SPA timeliness/submission questions → `42 CFR 430`
  - EPSDT questions → `42 CFR 441 Subpart B`
- MLR-specific hinting was considered but intentionally left out because existing MLR tests already produce the correct frame.

### Drill down
- `federal_authority_pairing_and_rebalance.md` for authority citation handling, pairing, and rebalance rules.

## Cross-cutting patterns
- The policy-corpus frame pipeline is increasingly intent-aware: query intent determines which sections are surfaced, paired, or demoted.
- Authority questions favor official section headings over body mentions.
- Test infrastructure is designed to fail loudly on missing data, unexpected queries, and unused handlers.
- The local context tree already contains established domains such as `agent_architecture`, `amendment_detection`, `auth_integration`, `database_operations`, `evaluation`, `frontend_ui`, `packages`, and `qa`.