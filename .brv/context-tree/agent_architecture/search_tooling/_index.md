---
children_hash: a6293368f6fb690d941027f120878b24b4df2ae8faa8edb9bf0c6489736e0b52
compression_ratio: 0.554140127388535
condensation_order: 1
covers: [context.md, hybrid_policy_search_tool.md]
covers_token_total: 942
summary_level: d1
token_count: 522
type: summary
---
### search_tooling (topic overview)
- **Purpose:** Documents how the NC Medicaid navigator search tool blends multiple retrieval signals for ranking policy sections; see `search_tooling/context.md` for general architecture and links to `agent_architecture/navigate_tools`.
- **Signals:** Voyage embeddings, per-type-group vector search, concept graph matching, reciprocal rank fusion (RRF), and Neo4j indexes work together to ensure accurate policy retrieval.
- **Graph & Index Dependencies:** Neo4j `section_embeddings`, `chunk_embeddings`, `PolicyConcept` relationships, and `section_fulltext` indexes underpin signal execution.

### Hybrid Policy Search Tool (detailed implementation in `hybrid_policy_search_tool.md`)
- **Task & Flow:** `searchSections` tool (implemented in `packages/agent/src/tools/search.ts`) receives a user query, validates input with zod, obtains embeddings via `embedQuery`, and executes per-type-group section & chunk vectors plus optional concept graph and keyword lookups before deduping and fusing hits through `rrfFuse` to return the top-K ranked sections.
- **Per-Type-Group Strategy:** Type groups come from user filters or `DEFAULT_TYPE_GROUPS` (clinical_policy, dhhs_policy, federal statute cluster); each group runs section/chunk vector searches before optionally adding concept graph/full-text results.
- **Fusion & Deduplication:** Deduplication by `sectionId` occurs prior to RRF, which uses a smoothing constant (`RRF_K=60`) and returns metadata-rich top-K slices; document-type filters set `perGroupK = topK`, otherwise defaults to `max(topK, 10)` to ensure diverse candidates.
- **Rules & Constraints:** Section and chunk results must be deduped by sectionId, concept graph matches require `content_length > 200` and non-null `section_number`, and the per-group logic enforces candidate minimums.
- **Dependencies & Config:** Requires Voyage API credentials (`VOYAGE_API_*`), `DEFAULT_TOP_K`, Neo4j indexes, and helper utilities (`recordToHit`, `dedup`, `rrfFuse`) to isolate conversion and ranking logic for readable `execute` implementation.