---
children_hash: d68077d5a2fd4f34781a4f3a8fce19d49dfd11da4830618453ca93eead4df235
compression_ratio: 0.45181818181818184
condensation_order: 1
covers: [ai_sdk_v6_sse_streaming_and_error_handling.md, context.md]
covers_token_total: 1100
summary_level: d1
token_count: 497
type: summary
---
### NC Medicaid Navigator Chat Streaming & Error Handling  
- **AISdkStreamBuilder stream orchestration** (`ai_sdk_v6_sse_streaming_and_error_handling.md`): Migrated from `MastraStreamBuilder` to `AISdkStreamBuilder` to emit SSE payloads (start → text block deltas → tool events → finish) with helpers (`toBody`, `toFulfill`). Tracks `events`, `messageId`, text block state, and mirrors `uiMessageChunkSchema` so Playwright can produce deterministic streams.  
- **Playwright mocks** (`ai_sdk_v6_sse_streaming_and_error_handling.md`): `mockMastraAPI` intercepts POST `/chat` and memory thread endpoints, supplying default mock streams/pagination metadata while letting GET metadata fetch real data; plays back AISdk-formatted SSE events for tests and exercises error cases (500 response triggers alert and re-enables input per `chat_error_handling_tests`).  
- **ChatPage UI/transport/error behavior** (`ai_sdk_v6_*` and `context.md`): Client component wires `useChat`/`useMastraClient` to DefaultChatTransport targeting `${MASTRA_URL}/chat` with AGENT_ID `nc-medicaid-navigator`. Ensures thread existence, enforces 10k-character limits, reuses user text for reruns, and renders the destructive alert (“Sorry, there was an error…”) based on `useChat` status (`status === "streaming"` and `isLoading` guard the textarea). Includes hooks/UI pieces (sidebar, EmptyState, MessageList, ScrollToBottom, ChatInput).  
- **Thread helpers & rerun support** (`ai_sdk_v6_*`): Auto-create memory threads, avoid duplicates on empty input, cap message text to 10k characters, and serialize reruns by filtering text parts before resending; ensures sidebar/mobile state stays in sync with thread lifecycle.  
- **Summary context** (`context.md`): Presents the topic “chat_streaming_error_handling,” emphasizing the AISdkStreamBuilder sequence, mock Mastra routing, and ChatPage state around streaming, reruns, and errors; points readers to `frontend_ui/chat_page_scroll_stability` for related behaviors.