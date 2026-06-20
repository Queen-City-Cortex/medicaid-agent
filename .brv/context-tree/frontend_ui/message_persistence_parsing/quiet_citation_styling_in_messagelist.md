---
title: Quiet Citation Styling in MessageList
summary: Markdown citation links in MessageList render quietly when mapped to sources, while unmapped external links keep gold styling; citation footnotes jump to the Sources panel.
tags: []
related: [frontend_ui/message_feedback/context.md, frontend_ui/thread_sidebar/context.md]
keywords: []
createdAt: '2026-06-20T01:44:37.160Z'
updatedAt: '2026-06-20T01:44:37.160Z'
---
## Reason
Document inline citation rendering and footnote behavior in chat answers

## Raw Concept
**Task:**
Document the quiet citation styling behavior in MessageList markdown rendering.

**Changes:**
- Mapped citation links now render quietly instead of using full gold styling
- Citation footnote buttons preserve navigation to the Sources panel
- Preview fixture source URLs were updated so citations resolve

**Files:**
- packages/web/src/components/MessageList.tsx

**Flow:**
markdown link -> normalizeCitationUrl -> sourceIndex lookup -> citation styling or external link styling -> footnote navigation

**Timestamp:** 2026-06-20T01:44:15.634Z

**Author:** ByteRover context engineer

## Narrative
### Structure
MessageList overrides the ReactMarkdown a renderer so mapped source links use subtle citation styling while unmapped links remain visually prominent.

### Dependencies
Depends on normalizeCitationUrl, buildSourceIndex, extractMessageSources, extractCitedUrls, splitSourcesByCited, and SourcesPanel row IDs.

### Highlights
The design avoids a wall of gold inline links in long answers while keeping the numbered citation marker as the main citation affordance.

### Rules
A link that maps to a source should render quietly. A link with no source mapping should keep gold treatment. The superscript citation button should jump to the Sources panel.

### Examples
Example citation link styling: text-foreground with decoration-muted-foreground/30. Example external link styling: font-medium text-accent underline decoration-accent/35.

## Facts
- **citation_link_mapping**: A markdown link is treated as a citation when normalizeCitationUrl maps its href to a numbered source in buildSourceIndex over extractMessageSources. [project]
- **citation_link_styling**: Mapped citation links render with text-foreground and a hairline muted underline, with hover accent styling. [project]
- **citation_footnote_button**: The small gold [n] superscript button carries the citation signal and jumps to the Sources panel. [project]
- **external_link_styling**: Unmapped external references keep gold styling with text-accent and accent underline. [project]
- **preview_fixture_urls**: The /preview gallery fixture was updated to use real section URLs so inline citations map correctly. [project]
- **release_reference**: The change shipped as PR #11 on branch redesign/quiet-citations. [project]
- **test_status**: 234 web tests remained green after the citation-footnote behavior change. [project]
