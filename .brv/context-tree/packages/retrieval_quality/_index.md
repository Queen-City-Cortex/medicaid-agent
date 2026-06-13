---
children_hash: 176207a55ef525e235f1bc0bcfb044a9f4cf145fb28261f41a23fd9502814669
compression_ratio: 0.2908458864426419
condensation_order: 1
covers: [retrieval_quality_depends_on_decontamination_plus_staged_ranking.md]
covers_token_total: 1726
summary_level: d1
token_count: 502
type: summary
---
## Retrieval Quality / Staged Ranking

This entry describes the retrieval-quality design for `packages/policy-corpus`, centered on **decontamination + topical coverage + staged ranking**. The canonical flow is:

**query intent -> candidate scoring -> vector overscan -> topical filtering -> group-specific ranking -> RRF merge**

### Core architecture
- The backend pattern in `retrieval/backends/section-vector.ts` iterates `profile.typeGroups`, overscans each group with `vectorScanK(profile.perGroupK)`, then filters by `document_type`.
- The collector in `retrieval/collector.ts` performs staged ranking and final merge ordering.
- Final ordering uses **reciprocal rank fusion (RRF)** after deduplicating hits by `sectionId`, preserving hybrid policy search ranking behavior.

### Key dependency
- A central constraint is Neo4j behavior: `queryNodes(k)` returns a **global top-k**, so it cannot satisfy per-group coverage by itself.
- Because of that, the system relies on **per-group overscanning first**, then filtering and reranking.

### Decontamination rules
The entry records domain-specific cleanup rules to prevent retrieval contamination:
- **HCWD**: replace limit-history terms with topical HCWD income-rule terms, and remove the `01-14` change-notice bonus from HCWD history retrieval.
- **HCBS**: preserve `WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS` as legitimate domain knowledge, but remove hardcoded section-number heuristics like `5.4.3` from prior-auth quantity detection.

### Important entities and drill-down points
- `packages/policy-corpus/src/retrieval/backends/section-vector.ts`
- `packages/policy-corpus/src/retrieval/collector.ts`
- Pattern references:
  - `^vectorScanK\(profile\.perGroupK\)$`
  - `^queryNodes\(k\)$`

### Related knowledge
- Related entries point to coverage selection and graph fixtures, plus golden dataset decontamination constants, indicating that retrieval quality depends on both **candidate selection** and **training/fixture contamination control**.