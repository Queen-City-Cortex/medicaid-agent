---
title: Message Persistence Parsing
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-05T19:25:34.932Z'
updatedAt: '2026-04-05T19:25:34.932Z'
---
## Raw Concept
**Task:**
Document the message persistence parsing updates that detect MastraMessageContentV2 threads, convert tool-invocation parts to UIMessage format, and keep legacy text formatting consistent.

**Changes:**
- Added detection for MastraMessageContentV2 (format 2) payloads inside convertThreadMessageToUIMessage and preserved structured parts.
- Introduced convertV4PartsToV5 to translate each tool-invocation to dynamic-tool parts with explicit state mapping.
- Updated extractText so arrays of mixed text/content join with "

", keeping research trace and formatted answers intact.

**Files:**
- packages/web/src/lib/parse-message.ts

**Flow:**
receive thread message -> detect MastraMessageContentV2 format -> convert V4 tool-invocation parts -> return UIMessage when structured parts exist -> fallback to extractText with 

 separator for legacy payloads

**Timestamp:** 2026-04-05

**Author:** Frontend UI Team

## Narrative
### Structure
convertThreadMessageToUIMessage now inspects stored Mastra thread payloads for MastraMessageContentV2 signals (format 2 + parts array). When detected it calls convertV4PartsToV5 to build dynamic-tool/step-start/text parts and returns a UIMessage that preserves the research trace and tool invocation metadata before any fallback to legacy text extraction.

### Dependencies
Relies on generateUUID for missing IDs, convertV4PartsToV5 for tool-invocation translation, and extractText for legacy string arrays or objects. The convertV4PartsToV5 helper must emit output-available/input-available states and keep args/result to align with ResearchTrace expectations.

### Highlights
The conversion ensures MastraMessageContentV2 threads survive reloads with structured parts, dynamic tool metadata, and no loss of research analysis formatting. Changing extractText to join parts with "

" keeps multi-paragraph answers intact when structured data is unavailable.

## Facts
- **mastra_message_format_detection**: convertThreadMessageToUIMessage now recognizes MastraMessageContentV2 payloads (format 2) and converts their V4 tool-invocation parts via convertV4PartsToV5 before rendering. [project]
- **dynamic_tool_state_mapping**: convertV4PartsToV5 maps any tool invocation state labeled 'result' to 'output-available' and treats all other states as 'input-available', aligning with ResearchTrace expectations. [project]
- **extract_text_separator**: extractText now joins string/text pieces with '\n\n', preserving double-line spacing when reconstructing legacy messages for thread reloads. [project]
