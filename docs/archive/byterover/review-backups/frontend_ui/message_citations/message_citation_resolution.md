---
title: Message Citation Resolution
summary: Inline message citations resolve by exact label, same-policy dotted ancestor, then normalized URL; sources are deduplicated and sorted for the Sources panel and clipboard text.
tags: []
related: [frontend_ui/chat_page_thread_cache/authenticated_thread_operations.md]
keywords: []
createdAt: '2026-06-23T00:01:25.644Z'
updatedAt: '2026-06-23T00:01:25.644Z'
---
## Reason
Document citation footnote resolution and sources-panel alignment for chat messages

## Raw Concept
**Task:**
Fix and document citation-source alignment for chat answers rendered in MessageList and message-parts.ts.

**Changes:**
- Added buildCitationResolver(sources) in message-parts.ts
- Updated MessageList markdown anchor rendering to resolve citations by label and href
- Updated clipboard text generation to use the same citation resolver
- Expanded tests to cover shared-URL policies, dotted-ancestor matching, URL normalization, and sorting/disambiguation

**Files:**
- packages/web/src/lib/message-parts.ts
- packages/web/src/components/MessageList.tsx
- packages/web/tests/lib/message-parts.test.ts

**Flow:**
assistant answer text -> markdown link renderer -> resolveCitation(label, href) -> source row number -> Sources panel / clipboard footnotes

**Timestamp:** 2026-06-23T00:00:58.201Z

**Author:** unknown

**Patterns:**
- `^Policy\s+(\S+)\s*§\s*([\d.]+)$` (flags: i) - Parses policy section labels for numeric section citations
- `^Policy\s+(\S+)\s*[—-]\s*(.+)$` (flags: i) - Represents policy labels for non-numeric section handles such as attachments
- `^https?://` - Matches absolute citation URLs used in markdown links and source rows

## Narrative
### Structure
The durable logic lives in packages/web/src/lib/message-parts.ts, while MessageList.tsx wires the resolver into react-markdown and the clipboard helper reuses the same lookup path. Tests cover source extraction, ordering, label disambiguation, and the citation resolver behavior across shared-policy PDFs.

### Dependencies
Depends on normalizeCitationUrl, disambiguateLabels, isDottedAncestor, and the Sources panel row numbering conventions. The fix assumes all sections of a policy PDF may share one download URL and therefore cannot be resolved by URL alone.

### Highlights
The user-facing effect is that inline citations now map to the correct sources-panel rows instead of collapsing to the first section. The new resolver prioritizes exact labels, then the deepest retrieved ancestor in the same policy, then normalized URLs for doc-level links.

### Rules
Resolve citations in this order: 1. Exact source-label match 2. Deepest same-policy dotted-ancestor 3. Normalized-URL fallback. Use numeric section labels as Policy <number> § <section> and non-numeric handles as Policy <number> — <section>.

### Examples
A cited Policy 1F § 5.2.1 can resolve to a retrieved Policy 1F § 5.2 row. Two doc-level Policy 8C entries can be disambiguated as Policy 8C (8c-main) and Policy 8C (8c-cpt-codes).

## Facts
- **citation_footnote_bug**: Inline citation footnotes in MessageList previously collapsed every section of one policy PDF onto a single wrong source number because buildSourceIndex keyed footnote numbering only on normalized URL. [project]
- **source_row_key**: Sources-panel rows are keyed on normalizeCitationUrl(url), policy, and sectionNumber in addSectionSource. [project]
- **citation_resolver_helper**: A buildCitationResolver(sources) helper was added in message-parts.ts. [project]
- **message_list_citation_rendering**: MessageList passes resolveCitation(label, href) into the react-markdown anchor renderer. [project]
- **clipboard_citation_resolution**: buildAnswerClipboardText uses the same citation resolver as MessageList. [project]
- **citation_resolution_tiers**: Citation resolution uses three tiers: exact source-label match, deepest same-policy dotted-ancestor, and normalized-URL fallback. [project]
- **source_label_disambiguation**: Source labels are unique per row via disambiguateLabels. [project]
- **agent_citation_label_text**: The agent emits the source label as the markdown link text. [project]
- **dotted_ancestor_resolution**: The dotted-ancestor rule resolves cited 5.2.1 to retrieved 5.2 within the same policy. [project]
- **verification_result**: Live verification on a Policy 3G-1 answer citing 7 sections changed from all [1] footnotes to 5 distinct correct footnotes. [project]
- **section_label_format**: Section labels use Policy <number> § <numeric section> for numeric sections and Policy <number> — <non-numeric section> for attachment-like handles. [project]
- **doc_level_disambiguation**: Doc-level entries may be disambiguated by URL path when duplicate labels collide. [project]
- **source_sort_order**: Document-level entries sort after section entries in the Sources panel. [project]
- **source_indexing**: buildSourceIndex indexes sources 1-based in array order and matches through normalized URLs. [project]
