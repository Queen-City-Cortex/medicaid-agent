---
title: AI SDK v6 SSE Streaming and Error Handling
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-04T06:02:06.324Z'
updatedAt: '2026-04-04T06:02:06.324Z'
---
## Raw Concept
**Task:**
Document AI SDK v6 SSE stream builder, mock Mastra API helpers, and ChatPage error-handling expectations for the NC Medicaid Navigator UI.

**Changes:**
- AI SDK stream builder migrated from MastraStreamBuilder to AISdkStreamBuilder with new SSE event sequence.
- Playwright mock routes centralize Mastra chat/memory endpoints to provide deterministic streams for tests.
- ChatPage includes streaming status handling, thread lifecycle helpers, and error rendering tied to useChat failures.

**Files:**
- e2e/helpers/stream-builder.ts
- e2e/helpers/mock-routes.ts
- e2e/tests/mocked/error-handling.spec.ts
- packages/web/src/app/chat/page.tsx

**Flow:**
AISdkStreamBuilder opens text blocks, emits streaming delta events, closes them for tool calls/results, marks steps as finished, and flushes via toFulfill. ChatPage ensures threads exist before sending, enforces the 10k-character input limit, reuses user text for reruns, and renders the error alert + input state based on useChat status while interacting with the transport configured against DefaultChatTransport.

**Timestamp:** 2026-04-04

## Narrative
### Structure
AISdkStreamBuilder drives SSE payloads (start → text block deltas → tool events → finish) and exposes toBody/toFulfill helpers for Playwright. MockMastraAPI intercepts POST /chat and memory thread endpoints so e2e suites can inject deterministic streams or error responses, keeping GET operations falling through to fetch real metadata. ChatPage ties in multiple hooks, memoized transport, and UI pieces (sidebar, EmptyState, MessageList, error alert, ScrollToBottom, ChatInput) to show conversations and rerun flows.

### Dependencies
ChatPage depends on useAuth/useAccessToken/useMastraClient/useChat along with hooks like useIsMobile, generateUUID, and convertThreadMessageToUIMessage. Mock routes rely on Playwright route handlers, the AISdkStreamBuilder helpers, and `uiMessageChunkSchema` event definitions to mirror production SSE traffic for tests.

### Highlights
Streaming status tracks `status === "streaming"` and `isLoading` guards the textarea, while errors trigger the destructive alert text "Sorry, there was an error processing your question. Please try again." Thread helpers auto-create memory threads, avoid duplicate creation when inputs are empty, and serializes reruns by filtering to text parts before resending.

## Facts
- **ai_sdk_sse_format**: AI SDK v6 SSE format emits JSON `data:` lines per `uiMessageChunkSchema` event type over Content-Type text/event-stream. [project]
- **aisdk_stream_builder_events**: `AISdkStreamBuilder` maintains per-stream `events`, `messageId`, and text block state while emitting start, start-step, text-start, text-delta, text-end, tool-input/output, finish-step, and finish events. [project]
- **mock_mastra_api_routes**: `mockMastraAPI` intercepts Mastra API routes in Playwright (POST /chat, GET/POST /api/memory/threads, GET /api/memory/threads/:id/messages) and supplies default mock streams and pagination metadata while allowing overrides. [project]
- **chat_error_handling_tests**: The error-handling spec ensures a 500 response from POST /chat surfaces the "error processing your question" alert and re-enables the chat input after failure. [project]
- **chat_page_transport**: ChatPage is a client component that wires useChat/useMastraClient with AGENT_ID "nc-medicaid-navigator" and DefaultChatTransport targeting `${MASTRA_URL}/chat` with credentials included. [project]
- **chat_thread_helpers**: Thread helpers auto-create memory threads, cap messages to 10k characters, reuse parts for reruns, and keep the sidebar/mobile state in sync. [project]
