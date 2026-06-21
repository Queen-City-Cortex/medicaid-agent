---
children_hash: f46864264615e4c9d48ae6856586b8e518c1c67c0b81ef972e7222907804cd44
compression_ratio: 0.5233918128654971
condensation_order: 1
covers: [ai_sdk_v6_sse_streaming_and_error_handling.md, context.md]
covers_token_total: 684
summary_level: d1
token_count: 358
type: summary
---
## Chat Streaming Error Handling

This topic covers the NC Medicaid Navigator chat UI’s SSE streaming path and the associated failure behavior, centered on `AISdkStreamBuilder` and the `ChatPage` surface. It ties together frontend streaming transport, test-time API mocking, and UI state management for threads, reruns, and errors.

### Core behavior
- Streaming now uses `AISdkStreamBuilder` instead of `MastraStreamBuilder`, with a defined SSE event sequence.
- The UI flow is: request → SSE stream opens → chunks stream to UI → errors are handled → stream closes.
- `ChatPage` is responsible for streaming status, thread lifecycle helpers, and rendering errors from `useChat` failures.

### Test and transport support
- `e2e/helpers/stream-builder.ts` defines the stream behavior used in tests.
- `e2e/helpers/mock-routes.ts` centralizes Playwright mock routes for Mastra chat and memory endpoints to produce deterministic streams.
- `e2e/tests/mocked/error-handling.spec.ts` exercises the mocked error-handling path.

### Structural dependencies
- The streaming path depends on stable transport behavior so the UI remains responsive during failures.
- The topic is closely related to authenticated chat transport and thread/cache handling in nearby chat UI topics.

### Drill-down entry
- `ai_sdk_v6_sse_streaming_and_error_handling.md` — detailed streaming and error-handling notes, file references, and implementation changes.