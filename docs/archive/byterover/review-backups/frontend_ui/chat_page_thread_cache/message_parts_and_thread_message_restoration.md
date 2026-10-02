---
title: Message Parts and Thread Message Restoration
tags: []
related: [frontend_ui/chat_page_thread_cache/context.md, frontend_ui/chat_page_transport/authenticated_chat_transport_reinitialization.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-06T02:09:31.867Z'
updatedAt: '2026-07-06T02:09:31.867Z'
---
## Raw Concept
**Task:**
Clean up web message part handling and thread message restoration logic.

**Changes:**
- Removed dead buildSourceIndex from message-parts.ts
- Exported shared verification marker constants from message-parts.ts
- Replaced duplicated verification marker strings in parse-message.ts
- Preserved verification parts during thread message conversion and coalescing

**Files:**
- packages/web/src/lib/message-parts.ts
- packages/web/src/lib/parse-message.ts

**Flow:**
message parts -> verification state extraction -> source resolution -> thread message restoration -> merged assistant turn rendering

**Timestamp:** 2026-07-05

**Author:** web cleanup changes

## Narrative
### Structure
message-parts.ts owns reusable helpers for tool/text detection, verification state extraction, source extraction, citation normalization, and clipboard rendering. parse-message.ts restores persisted thread messages by converting V4 tool-invocation parts to V5 dynamic-tool parts and coalescing assistant turns.

### Dependencies
parse-message.ts depends on the exported OK_PART_TYPE and REWRITE_PART_TYPE constants so verification state survives reloads and merged assistant turns.

### Highlights
The citation resolver now prefers exact label matches, then deepest same-policy ancestor matches, then URL fallback. Thread restoration keeps tools, answer text, and verification parts together while dropping internal data-om-* and step-start noise.

## Facts
- **build_source_index_removal**: buildSourceIndex was deleted from message-parts.ts because it was test-only and superseded by buildCitationResolver, which builds its own byUrl map. [project]
- **rewrite_part_type**: REWRITE_PART_TYPE is exported as 'data-verification-rewrite'. [project]
- **ok_part_type**: OK_PART_TYPE is exported as 'data-verification-ok'. [project]
- **verification_part_constants_usage**: parse-message.ts now uses the exported verification part constants in convertV4PartsToV5 and mergeAssistantTurn instead of hardcoded string copies. [project]
- **web_test_status**: All 251 web tests pass after the cleanup. [project]
