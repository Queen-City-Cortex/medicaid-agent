---
children_hash: ba34810ff530835ea0587a4754666b9fc2cb38dc3c92122bc8936907cb8f3968
compression_ratio: 0.6427457098283932
condensation_order: 1
covers: [authenticated_chat_transport_reinitialization.md]
covers_token_total: 641
summary_level: d1
token_count: 412
type: summary
---
## Frontend UI: Authenticated Chat Transport Reinitialization

This level groups the chat transport/auth-state coupling fixes for the NC Medicaid Navigator UI. The core pattern is that chat session identity must change when authentication resolves, so transport and hook state do not stay bound to anonymous memory resources.

### Chat instance lifecycle and auth-bound identity
- **Authenticated Chat Transport Reinitialization** documents the main fix in `packages/web/src/app/chat/page.tsx`.
- The `useChat` id was expanded from `threadId` to `threadId:resourceId`, with `resourceId` defaulting to `anonymous` until auth loads.
- `DefaultChatTransport` is memoized on `threadId`, `resourceId`, and `getAccessToken`, so auth changes force a new transport and a fresh Chat instance.
- Key relationship: `useChat` only recreates its internal instance when `id` changes, so `resourceId` must be part of the identifier to trigger reinitialization on anonymous-to-authenticated transitions.

### ChatPage responsibilities and dependencies
- `ChatPage` handles transport creation, auth scoping, thread lifecycle, sidebar toggles, empty states, message lists, and scroll helpers.
- It depends on:
  - `useAuth` / `useAccessToken` for auth state
  - `useMastraClient` for memory threads
  - `DefaultChatTransport` for message delivery
  - `ThreadSidebar` and `ScrollArea`/UIKit components for layout
- The transport update ensures the chat page uses the authenticated credentials and refreshed memory scope after auth resolves.

### Drill-down entry
- **Authenticated Chat Transport Reinitialization** — primary implementation and lifecycle fix details.