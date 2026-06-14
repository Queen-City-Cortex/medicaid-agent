---
children_hash: 3667ed499726b3b71929cf959a828a06ae128c37217face94efab5fb598c1520
compression_ratio: 0.43870772946859904
condensation_order: 2
covers: [intent-aware-staged-retrieval-dominates-both-policy-search-and-graph-frame-assem.md, policy_corpus/_index.md, retrieval-quality-depends-on-decontamination-plus-staged-ranking.md, retrieval-quality-depends-on-staged-overscan-filtering-and-reranking-across-sear.md, retrieval_quality/_index.md]
covers_token_total: 3312
summary_level: d2
token_count: 1453
type: summary
---
## Retrieval and policy corpus: staged ranking with intent-aware selection

This layer centers on a shared retrieval principle across **packages**, **database_operations**, and **agent_architecture**: do not trust a single global top-k pass. Instead, retrieve broadly, filter by intent or document type, dedupe by section identity, and then merge or rerank into the final evidence frame.

### Core retrieval pattern
- **`intent-aware-staged-retrieval-dominates-both-policy-search-and-graph-frame-assem.md`**
  - Retrieval is explicitly staged: **overscan -> filter -> dedupe -> rerank/fuse -> assemble**.
  - The same pattern appears in policy-corpus search, Neo4j hybrid search, and agent retrieval tooling.
  - Important identifiers: `overscan`, `rerank`, `dedupe`, `sectionId`, `document_type`, `rrf`, `hybrid-search`, `intent`.

- **`retrieval-quality-depends-on-decontamination-plus-staged-ranking.md`**
  - Retrieval quality depends on **decontamination plus staged ranking**.
  - Canonical flow: **query intent -> candidate scoring -> vector overscan -> topical filtering -> group-specific ranking -> RRF merge**.
  - `queryNodes(k)` is only a **global top-k**, so the system compensates with **per-group overscanning** and later filtering.
  - Key paths:
    - `packages/policy-corpus/src/retrieval/backends/section-vector.ts`
    - `packages/policy-corpus/src/retrieval/collector.ts`

- **`retrieval-quality-depends-on-staged-overscan-filtering-and-reranking-across-sear.md`**
  - Reiterates the same search-stack rule: broad candidate collection first, then filtering and reranking.
  - Shared signals include embeddings, concept-graph matching, reciprocal rank fusion, and per-group vector overscan.

### Policy corpus frame pipeline
- **`policy_corpus/_index.md`**
  - The policy corpus is organized around **coverage routing**, **document selection**, **coverage frame assembly**, and the broader **frame pipeline**.
  - Main theme: **query intent and care-setting specificity** determine which documents are selected, narrowed, paired, and assembled.

#### Coverage routing
- Routing flow:
  - `lookup documents -> infer documents from hits -> apply setting preference -> narrow -> return routing documents`
- `selectSettingPreferredDocuments` applies **setting-scoped document preference before inferred narrowing**.
- When a query explicitly names a care setting, matching documents can be returned exclusively.
- Key dependencies:
  - `collectPolicyDocumentsFromHits`
  - `narrowHcwdCoverageDocuments`
  - `narrowInferredCoverageDocuments`
  - `selectSettingPreferredDocuments`

#### Document selection and narrowing
- **`document_selection/_index.md`**
  - Focuses on document-level boosts, title expansion, variant scoring, HCWD scoring, and narrowing.
  - Architectural change: `selectSettingPreferredDocuments(queryLower, documents)` prioritizes documents matching the queried setting.
  - This preference runs **before** `narrowInferredCoverageDocuments`, preventing distractors from outranking the intended policy document.

#### Coverage frame assembly
- **`coverage_frame_assembly/_index.md`**
  - Final coverage answers are assembled from:
    - base hits
    - HCWD history hits
    - routed documents
    - section candidates
  - These are merged into:
    - primary evidence
    - supporting evidence
    - avoid evidence
  - Rule: sibling variant frames take precedence; otherwise `settingPreference.documents` become `preferredRoutingDocuments`.

### Frame pipeline and authority handling
- **`frame/_index.md`**
  - Covers coverage selection, graph fixtures, and federal authority handling.
  - Coverage selection is now positional rather than score-field driven: `SectionCandidate.score` was removed.
  - Selection proceeds through a **5-stage pipeline**:
    1. score coverage sections
    2. collect/group by coverage flags
    3. build initial selection
    4. build anchors
    5. assemble final sections by merging primary, supporting, and avoid sections
  - Strict Neo4j fixtures fail loudly on missing fields, unused handlers, and unexpected queries.

#### Federal authority pairing and rebalance
- Retrieval explicitly pairs **statute and regulation** when intent indicates an authority citation.
- Driven by:
  - `asksForAuthorityCitation` in `query-intent.ts`
  - `authorityCitationQuery`
- Evidence resolution stages:
  1. `buildFederalAuthoritySignals`
  2. `collectFederalAuthorityEvidence`
  3. `collectFederalImplementationEvidence`
  4. `buildFederalAuthorityCandidateSets`
- Rebalance hints adjust primary/supporting/avoid sections for waiver authority, SPA, and EPSDT.
- Statute retention is preserved so one `federal_statute` section remains visible even when regulation hints dominate.
- Ordering matters: `WAIVER_AUTHORITY_HINT` must run before `WAIVER_HINT`.
- Example intent mappings:
  - `1915(c)` HCBS waiver authority -> `42 CFR Part 441 Subpart G`
  - SPA timeliness/submission -> `42 CFR 430`
  - EPSDT -> `42 CFR 441 Subpart B`

### Cross-cutting themes
- Retrieval is **intent-aware**, not purely similarity-based.
- Setting-specific policy selection can override raw score ordering.
- Authority questions prefer **official section headings** over body mentions.
- Test and fixture infrastructure is intentionally strict to catch missing data and query mismatches.
- A known rough edge remains: the federal collector scans `federal_regulation` and `federal_statute` together, which can hide per-docType coverage gaps.

### Drill-down entries
- `intent-aware-staged-retrieval-dominates-both-policy-search-and-graph-frame-assem.md`
- `retrieval-quality-depends-on-decontamination-plus-staged-ranking.md`
- `retrieval-quality-depends-on-staged-overscan-filtering-and-reranking-across-sear.md`
- `policy_corpus/_index.md`
- `retrieval-quality/_index.md`