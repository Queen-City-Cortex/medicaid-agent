---
children_hash: 4f897e069348c8382bc97d673502079c2ff528e13b5f19f00ca16316c47e1de2
compression_ratio: 0.7493150684931507
condensation_order: 1
covers: [ai_sdk_v6_sse_streaming_and_error_handling.md, context.md]
covers_token_total: 730
summary_level: d1
token_count: 547
type: summary
---
# chat_streaming_error_handling

## Structural overview
This topic captures the frontend chat streaming path for the NC Medicaid Navigator, centered on **AISdkStreamBuilder** SSE behavior, Playwright mock routing for Mastra endpoints, and **ChatPage** handling of streaming, reruns, and errors.

## Child entries to drill into
- **ai_sdk_v6_sse_streaming_and_error_handling.md**  
  Documents the AI SDK v6 SSE stream sequence and the associated error-handling behavior in the chat UI.

## Key structure and relationships
- **Streaming transport**
  - The streaming implementation migrated from **MastraStreamBuilder** to **AISdkStreamBuilder**.
  - The flow is: **request -> SSE stream opens -> chunks stream to UI -> errors handled -> stream closes**.
  - The entry emphasizes continuity of the stream and graceful failure handling.

- **Test and mock infrastructure**
  - Playwright mock routes centralize **Mastra chat/memory endpoints** to make streams deterministic in tests.
  - Relevant files include:
    - `e2e/helpers/stream-builder.ts`
    - `e2e/helpers/mock-routes.ts`
    - `e2e/tests/mocked/error-handling.spec.ts`

- **ChatPage behavior**
  - `packages/web/src/app/chat/page.tsx` handles:
    - streaming status
    - thread lifecycle helpers
    - rerun behavior
    - error rendering tied to `useChat` failures

## Dependencies and related context
- Depends on stable transport behavior to keep the UI responsive.
- Related topics referenced for drill-down:
  - `frontend_ui/chat_page_transport/authenticated_chat_transport_reinitialization.md`
  - `frontend_ui/proxy_handling/web_theme_persistence.md`
  - `frontend_ui/design_system/document_of_record_design_language.md`
  - `frontend_ui/message_persistence_parsing/quiet_citation_styling_in_messagelist.md`
  - `frontend_ui/chat_page_thread_cache/chat_page_thread_cache_restoration.md`
  - `frontend_ui/thread_sidebar/thread_sidebar_fetch_resilience.md`
  - `frontend_ui/message_feedback/message_feedback_flow.md`
  - `frontend_ui/live_testing/live_testing_without_the_workos_wall.md`
  - `frontend_ui/chat_page_review_fixes/live_ui_testing_without_workos_auth_wall.md`
  - `frontend_ui/chat_page_scroll_stability`