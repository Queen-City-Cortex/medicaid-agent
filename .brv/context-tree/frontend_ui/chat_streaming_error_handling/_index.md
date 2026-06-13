---
children_hash: f517a66e2be75d52653027fb8be0ce5b51d86b0872a5aed493865179b974651d
compression_ratio: 0.609973285841496
condensation_order: 1
covers: [ai_sdk_v6_sse_streaming_and_error_handling.md, context.md]
covers_token_total: 1123
summary_level: d1
token_count: 685
type: summary
---
# chat_streaming_error_handling

Structural summary of the NC Medicaid Navigator chat streaming/error-handling topic, centered on SSE stream generation, deterministic test mocks, and ChatPage UI behavior.

## Core structure

- **AISdkStreamBuilder** replaces `MastraStreamBuilder` for Playwright SSE test payloads.
- **mockMastraAPI** centralizes Mastra chat and memory endpoint routing for deterministic success/error flows.
- **ChatPage** consumes `useChat` and related hooks to manage streaming state, thread lifecycle, reruns, and error rendering.

## Key components

### `ai_sdk_v6_sse_streaming_and_error_handling.md`
- Defines the AI SDK v6 SSE event sequence used by tests and UI expectations.
- Documents `AISdkStreamBuilder` behavior: start, start-step, text deltas, tool input/output, finish-step, finish.
- Covers `mockMastraAPI` interception of:
  - `POST /chat`
  - `GET/POST /api/memory/threads`
  - `GET /api/memory/threads/:id/messages`
- Describes ChatPage flow:
  - create thread before sending
  - enforce 10k-character input limit
  - reuse user text for reruns
  - render destructive error alert on `useChat` failure
  - keep textarea/input disabled while streaming or loading

### `context.md`
- Provides the higher-level topic framing:
  - SSE message streaming via `AISdkStreamBuilder`
  - Playwright Mastra API mocking
  - ChatPage handling of streaming, reruns, and error states

## Important relationships

- **Test streaming depends on UI schema compatibility**: mocked SSE events mirror `uiMessageChunkSchema`.
- **ChatPage transport is tied to Mastra infrastructure**: `DefaultChatTransport` targets `${MASTRA_URL}/chat` with credentials included.
- **Thread and memory behavior is coordinated** between UI state and mocked memory endpoints to support realistic chat flows.
- **Error handling is verified end-to-end** in Playwright by asserting the 500 `/chat` failure surfaces the expected alert and restores input usability.

## Notable facts

- `AISdkStreamBuilder` keeps per-stream event state and text block state, exposing `toBody` and `toFulfill` helpers.
- `mockMastraAPI` supports default mock streams, pagination metadata, and override hooks.
- ChatPage uses `useAuth`, `useAccessToken`, `useMastraClient`, `useChat`, `useIsMobile`, `generateUUID`, and `convertThreadMessageToUIMessage`.
- The UI error message is: **"Sorry, there was an error processing your question. Please try again."**
- ChatPage is keyed to AGENT_ID **`nc-medicaid-navigator`**.

## Drill-down pointers

- See **`ai_sdk_v6_sse_streaming_and_error_handling.md`** for the full SSE event model, Playwright helpers, and error test expectations.
- See **`context.md`** for the concise topic definition and related chat UI linkage.