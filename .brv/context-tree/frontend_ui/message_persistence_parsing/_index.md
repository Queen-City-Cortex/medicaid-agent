---
children_hash: 31630cc33e102e35fbb54a4716de11ca504b3b7e08304394c79d655f9462c64f
compression_ratio: 0.578239608801956
condensation_order: 1
covers: [context.md, message_persistence_parsing.md]
covers_token_total: 818
summary_level: d1
token_count: 473
type: summary
---
# Message Persistence Parsing (frontend_ui/message_persistence_parsing)

- **Context (context.md)**: Describes the transformation pipeline converting Mastra memory thread messages into `UIMessage` payloads for the chat page. Highlights detection of `MastraMessageContentV2`, use of `convertV4PartsToV5` for dynamic tool translation, legacy `extractText` fallbacks, and compatibility with `ResearchTrace` metadata. Related topics: `frontend_ui/chat_page_transport`, `frontend_ui/message_feedback`.

- **Key Implementation Updates (message_persistence_parsing.md)**:
  - **Task**: Track MastraMessageContentV2 detection, tool invocation conversion, and legacy formatting preservation.
  - **Flow**: `thread message → detect MastraMessageContentV2 (format 2, parts array) → convertV4 parts to dynamic tool parts → emit UIMessage if structured parts exist → fallback to `extractText` joining segments with `\n\n`.
  - **Components**:
    - `convertThreadMessageToUIMessage` now inspects stored payloads for format 2 cues and delegates to `convertV4PartsToV5`.
    - `convertV4PartsToV5` emits `dynamic-tool`, `step-start`, and `text` segments while mapping any `result` state to `output-available` and all others to `input-available`, fulfilling `ResearchTrace` expectations.
    - `extractText` now concatenates mixed text/content arrays with double newlines, preserving multi-paragraph and formatted answers when structured data is absent.
  - **Files**: `packages/web/src/lib/parse-message.ts`
  - **Facts**:
    - MastraMessageContentV2 payloads (format 2) are now detected and converted before rendering.
    - Tool invocations map states to `output-available` or `input-available` as needed.
    - Legacy message reconstruction now preserves spacing via `\n\n` separators.

Refer to `context.md` and `message_persistence_parsing.md` for detailed explanations and implementation specifics.