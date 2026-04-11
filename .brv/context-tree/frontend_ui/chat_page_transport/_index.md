---
children_hash: 42eec3ab187cc0d10eb3d3e9429721b16462464a64cb03e38703b03b1220addd
compression_ratio: 0.519134775374376
condensation_order: 1
covers: [authenticated_chat_transport_reinitialization.md]
covers_token_total: 601
summary_level: d1
token_count: 312
type: summary
---
## Authenticated Chat Transport Reinitialization

- **Purpose**: Guarantee `useChat` reinitializes transport when authentication state shifts by expanding the identity used to memoize its transport.
- **Key Architectural Adjustment**: `useChat` identifier now stitches together `threadId` and `resourceId`, and the `DefaultChatTransport` memoization includes `resourceId` plus `threadId` and `getAccessToken`, ensuring a fresh transport instance whenever auth-derived `resourceId` changes (see `authenticated_chat_transport_reinitialization.md`).
- **Flow & Dependencies**: `ChatPage` renders the NC Medicaid Navigator UI, computes `resourceId` (anonymous fallback until `useAuth`/`useAccessToken` resolve), memoizes `DefaultChatTransport`, and passes it to `useChat`. When auth finishes and `resourceId` updates, the transport/memo recalculates, triggering a new chat mount.
- **Highlights & Facts**:
  - `useChat` only recreates its `Chat` instance when the `id` prop changes.
  - `resourceId` defaults to anonymous until auth loading completes on the client.
  - `DefaultChatTransport` memoization depends on `threadId`, `resourceId`, and `getAccessToken`, so including `resourceId` prevents stale anonymous transports during auth transitions.