---
children_hash: 273d8d4e10830842ea68fa75529e8e0ae345096749c418c06baa32eae1af4c97
compression_ratio: 0.5244979919678715
condensation_order: 1
covers: [message_citation_resolution.md]
covers_token_total: 1245
summary_level: d1
token_count: 653
type: summary
---
## Message Citation Resolution

This entry documents the citation-source alignment fix for chat answers rendered in `MessageList` and `message-parts.ts`. The core change is the introduction of `buildCitationResolver(sources)` in `packages/web/src/lib/message-parts.ts`, which is shared by both markdown citation rendering and clipboard text generation.

### Key structure and flow
- **Source of truth:** `packages/web/src/lib/message-parts.ts`
- **UI integration:** `packages/web/src/components/MessageList.tsx`
- **Tests:** `packages/web/tests/lib/message-parts.test.ts`
- **Flow:** assistant answer text → markdown link renderer → `resolveCitation(label, href)` → source row number → Sources panel / clipboard footnotes

### Resolution behavior
Citations now resolve in this order:
1. **Exact source-label match**
2. **Deepest same-policy dotted-ancestor**
3. **Normalized-URL fallback**

This matters because policy PDFs often reuse a single download URL across multiple sections, so URL-only indexing caused incorrect collapsing of citations onto the first source row.

### Labeling and disambiguation
- Numeric sections use: `Policy <number> § <numeric section>`
- Non-numeric / attachment-like handles use: `Policy <number> — <non-numeric section>`
- Duplicate doc-level entries are disambiguated by label suffixes such as `(8c-main)` and `(8c-cpt-codes)`
- Source labels are made unique with `disambiguateLabels`

### Rendering and clipboard alignment
`MessageList` passes `resolveCitation(label, href)` into the `react-markdown` anchor renderer, and `buildAnswerClipboardText` uses the same resolver. This keeps inline citations, Sources panel rows, and copied text consistent.

### Dependencies and related mechanics
The fix depends on:
- `normalizeCitationUrl`
- `disambiguateLabels`
- `isDottedAncestor`
- Sources panel row-numbering conventions

Indexing remains **1-based in array order** via `buildSourceIndex`, with matching through normalized URLs, but resolution now prefers semantic label matching before URL fallback.

### Verified outcomes
- Inline citations no longer collapse all sections of a policy PDF into the same wrong source number.
- A cited `Policy 1F § 5.2.1` can resolve to a retrieved `Policy 1F § 5.2` row via dotted-ancestor matching.
- Live verification on a `Policy 3G-1` answer citing 7 sections changed from all `[1]` footnotes to 5 distinct correct footnotes.

### Drill-down references
- `message_citation_resolution.md` for the full resolver logic and test coverage
- Related UI threading context: `frontend_ui/chat_page_thread_cache/authenticated_thread_operations.md`