# Topic: chat_streaming_error_handling

## Overview
Captures how the NC Medicaid Navigator chat UI streams SSE messages via AISdkStreamBuilder, how Playwright mocks Mastra API calls, and how the ChatPage surface handles streaming, reruns, and error states.

## Key Concepts
- AISdkStreamBuilder SSE event sequence
- mockMastraAPI Playwright routing for chat/memory endpoints
- ChatPage state around threads, streaming, reruns, and errors

## Related Topics
- frontend_ui/chat_page_scroll_stability - for related chat UI behavior
