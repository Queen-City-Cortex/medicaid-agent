---
children_hash: 7df143c59fb9b356db6ee5475e6de76188f7179d0d99fff3a7913d4fdcd8184c
compression_ratio: 0.5334190231362468
condensation_order: 1
covers: [thread_sidebar_fetch_resilience.md]
covers_token_total: 778
summary_level: d1
token_count: 415
type: summary
---
# Thread Sidebar Fetch Resilience (thread_sidebar_fetch_resilience.md)

- **Purpose**: Document how `ThreadSidebar` safely fetches and manages memory threads without racing against WorkOS token readiness.
- **Flow & Control**:
  - Rendering triggers `useMastraReady`/`useMastraClient`; token changes recreate `mastraClient`.
  - `fetchThreads` runs inside `useEffect` with a fresh `AbortController`, listing threads via `listMemoryThreads`; stale requests are aborted whenever `mastraClient`, `resourceId`, `refreshKey`, or `currentThreadId` change.
  - 401 responses are silently ignored until `useMastraReady` becomes true, preventing noise when the WorkOS token is pending.
  - Successful fetch updates `threads`, resets loading/error states, and logs unexpected errors without wiping the existing list.
- **Editing & UI Hooks**:
  - Sidebar includes creation/rename/delete flows using inputs, `DropdownMenu`, and `AlertDialog`.
  - Threads render as buttons with contextual menus for rename/delete and display `formatDate` timestamps.
- **Dependencies & Files**:
  - Relies on WorkOS authkit hooks (`useAuth`, `useAccessToken`), `useMastraClient`, Mastra memory APIs (`listMemoryThreads`, `getMemoryThread`), and UI primitives (`ScrollArea`, `Button`, `Separator`, etc.).
  - Source files: `packages/web/src/components/ThreadSidebar.tsx`, `packages/web/src/lib/use-mastra-client.ts`.
- **Rules & Facts**:
  - Abort prior `listMemoryThreads` calls on new fetches and treat 401s as non-errors while authentication is pending.
  - Uses agent ID `nc-medicaid-navigator` for thread calls and relies on `AbortController` cancellation before issuing new requests.