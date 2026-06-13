---
children_hash: 5a0ee1c9727f764c929e387c83ff6fa66b3335ba40282db36d79882b9629e778
compression_ratio: 0.6050516647531573
condensation_order: 1
covers: [context.md, message_persistence_parsing.md]
covers_token_total: 871
summary_level: d1
token_count: 527
type: summary
---
# Message Persistence Parsing

Structural overview of how chat-thread messages are reconstructed into `UIMessage` payloads in the frontend. The core path is `packages/web/src/lib/parse-message.ts`, where structured Mastra payloads are preferred and legacy text remains supported as a fallback.

## Main behavior

- `message_persistence_parsing.md` documents the parsing update for persisted thread messages.
- `context.md` frames the topic as message conversion for the chat page, with emphasis on preserving structured content, tool state, and formatting.

## Key parsing flow

- `convertThreadMessageToUIMessage` detects `MastraMessageContentV2` payloads using the `format 2 + parts array` signal.
- When structured content is present, it calls `convertV4PartsToV5`.
- `convertV4PartsToV5` translates V4 tool-invocation parts into dynamic-tool / step-start / text parts.
- If structured parsing is not possible, `extractText` reconstructs legacy payloads.

## Important architectural decisions

- Structured Mastra thread messages are preserved on reload rather than flattened immediately.
- Tool invocation states are normalized for `ResearchTrace` compatibility:
  - `result` → `output-available`
  - all other states → `input-available`
- `extractText` joins mixed text/content segments with `\n\n` to preserve paragraph spacing in legacy messages.

## Dependencies and relationships

- Relies on `generateUUID` for missing IDs.
- Depends on `convertV4PartsToV5` for tool-invocation translation.
- Uses `extractText` as the legacy fallback path.
- Related downstream topics:
  - `frontend_ui/chat_page_transport`
  - `frontend_ui/message_feedback`
  - cache/thread restoration topics in `frontend_ui/message_persistence_cache` and `frontend_ui/chat_page_thread_cache`

## Key facts to drill into

- `mastra_message_format_detection`
- `dynamic_tool_state_mapping`
- `extract_text_separator`

## Summary outcome

This topic ensures persisted Mastra thread messages survive reloads with structured parts, tool metadata, and preserved formatting, while maintaining compatibility with older message payloads.