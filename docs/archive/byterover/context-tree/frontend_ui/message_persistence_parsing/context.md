# Topic: message_persistence_parsing

## Overview
Covers how Mastra memory thread messages are transformed into UIMessage payloads for the chat page, including both new MastraMessageContentV2 detection and legacy fallbacks.

## Key Concepts
- MastraMessageContentV2 format detection
- convertV4PartsToV5 dynamic-tool translation
- extractText legacy fallback with preserved formatting
- ResearchTrace compatibility for tool invocation states

## Related Topics
- frontend_ui/chat_page_transport
- frontend_ui/message_feedback
