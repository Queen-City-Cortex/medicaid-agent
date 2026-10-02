---
children_hash: bb02c4ef512576b911b00687667a6ebc71a1ccefe54f1b5d2f95789bfbab3b33
compression_ratio: 0.658284023668639
condensation_order: 1
covers: [authenticated_chat_transport_reinitialization.md]
covers_token_total: 676
summary_level: d1
token_count: 445
type: summary
---
## Authenticated chat transport reinitialization

This entry documents a client-side auth transition fix for the NC Medicaid Navigator chat page. The key architectural decision is to make both the `DefaultChatTransport` memoization and the `useChat` identity sensitive to `resourceId`, so the chat instance is recreated when anonymous state resolves into authenticated state.

### Core change
- **File:** `packages/web/src/app/chat/page.tsx`
- `useChat` id was expanded from `threadId` to `threadId:resourceId`.
- `DefaultChatTransport` is now memoized on `threadId`, `resourceId`, and `getAccessToken`.
- This ensures a fresh transport and chat instance whenever auth state changes.

### Why it matters
- `resourceId` defaults to `anonymous` until auth finishes loading.
- Without `resourceId` in the `useChat` id, the hook would retain a stale Chat instance and keep using anonymous-scoped memory/resources after authentication.
- The updated flow guarantees transport integrity during anonymous-to-authenticated transitions.

### Runtime flow
- `ChatPage` renders and computes `resourceId`.
- Transport is memoized with `threadId/resourceId`.
- `useChat` is called with `id=threadId:resourceId`.
- When auth resolves and `resourceId` changes, the memoized transport and Chat instance both reinitialize.

### Related dependencies and UI context
- Depends on `useAuth` / `useAccessToken` for auth state.
- Uses `useMastraClient` for memory threads.
- `ThreadSidebar`, `ScrollArea`, and UIKit components provide layout and chat scaffolding.
- The component also manages thread lifecycle, sidebar toggles, message list rendering, and empty-state/scroll behavior.

### Drill-down entry
- **authenticated_chat_transport_reinitialization.md** — full fix details and component behavior.