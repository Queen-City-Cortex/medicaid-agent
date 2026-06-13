---
children_hash: 5440f0ccc92c9e9d2a3fda3077938878aa4b13224be55b6454e42aafb3f4a7e3
compression_ratio: 0.8027465667915106
condensation_order: 1
covers: [thread_sidebar_fetch_resilience.md]
covers_token_total: 801
summary_level: d1
token_count: 643
type: summary
---
## Frontend UI: thread sidebar fetch resilience

This set of notes centers on how the thread sidebar stays responsive while WorkOS auth and Mastra memory access are still initializing. The main implementation is in **Thread Sidebar Fetch Resilience**, with close overlap to **Authenticated Chat Transport Reinitialization** for token-driven client refresh behavior.

### Thread sidebar fetch lifecycle
- **Thread Sidebar Fetch Resilience** documents `packages/web/src/components/ThreadSidebar.tsx` and `packages/web/src/lib/use-mastra-client.ts`.
- The sidebar is a client-side React component that renders:
  - a `+ New` control,
  - a scrollable thread list,
  - loading/error states,
  - rename/delete flows,
  - a footer with the signed-in user and sign-out.
- Thread loading follows a guarded sequence:
  - `useMastraReady` and `useMastraClient` establish token/client readiness,
  - `fetchThreads` runs with an `AbortController`,
  - `listMemoryThreads` retrieves threads,
  - results are sorted by `updatedAt`,
  - state is updated and loading is cleared,
  - dependent effects rerun on client, `currentThreadId`, or `refreshKey` changes.

### Resilience and auth coupling
- The key design is to avoid racing thread fetches against WorkOS token availability.
- If `listMemoryThreads` returns **401** while `useMastraReady` is still false, the error is swallowed and the sidebar quietly retries once auth is ready.
- A new `mastraClient` is recreated via `useMastraClient` whenever the access token changes, keeping the fetch layer aligned with auth state.
- `AbortController` is used to cancel stale requests whenever dependencies change, preventing overlapping fetches from writing outdated state.

### Interaction patterns and dependencies
- Depends on WorkOS authkit hooks (`useAuth`, `useAccessToken`) via `useMastraClient` / `useMastraReady`.
- Depends on Mastra memory APIs such as `listMemoryThreads` and `getMemoryThread`.
- Uses UI primitives like `ScrollArea`, `Button`, `Separator`, `DropdownMenu`, and `AlertDialog`.
- Rename and delete actions refresh the thread list after updating the underlying memory thread.

### Rules and facts to retain
- **Rule 1:** Treat a 401 as non-fatal while `useMastraReady` is false.
- **Rule 2:** Abort any previous `listMemoryThreads` request when a new fetch is scheduled due to dependency changes.
- The fixed agent ID for memory thread calls is `nc-medicaid-navigator`.
- The broader related pattern is token-driven transport/client reinitialization, referenced in **Authenticated Chat Transport Reinitialization**.