---
children_hash: af26794c96b182b60df72e0ddced333f342dc737ada0740aa8c869ab9a46d20e
compression_ratio: 0.5834146341463414
condensation_order: 1
covers: [fresh_token_runner_for_chat_and_deep_research.md]
covers_token_total: 1025
summary_level: d1
token_count: 598
type: summary
---
# Fresh-token Runner Migration for Chat and Deep Research

This set of changes shifts both chat thread operations and deep research workflow execution onto a **fresh-token runner** so access-token expiry no longer breaks ongoing user flows.

## Core architectural change
- `useChatThread` now accepts a `MastraRunner` and performs thread/memory work through `run(client => ...)` instead of holding a direct `ChatThreadClient`.
- `useDeepResearch` now also accepts `run: MastraRunner`, stores the workflow `runId` in `runIdRef`, and re-attaches suspended runs with `createRun({ runId })` before resuming.
- `packages/web/src/app/chat/page.tsx` switched from `useMastraClient` to `useMastraClientRunner` and passes the same runner into both hooks.

## Lifecycle flow
- Chat path: `chat action -> fresh-token runner -> client.createMemoryThread / listMessages -> survive token expiry`
- Deep research path: `startAsync -> capture runId -> suspension at plan-approval -> createRun({ runId }) -> resumeAsync`
- The design depends on a runner that can reconstruct a client with a fresh access token and on workflow APIs that support re-attachment by `runId`.

## Key relationships and dependencies
- Chat thread loading and creation are now wrapped in `run(client => ...)`, especially `loadThread` and `ensureThreadExists`.
- Deep research resume logic depends on `createRun` supporting an optional `runId`, and `WorkflowRun` exposing a readonly `runId`.
- The plan-approval gate may outlive the current token, so resuming must happen through a refreshed client rather than the original one.

## Validation and testing
- Unit tests in `packages/web/tests/lib/use-deep-research.test.tsx` verify that `createRun({ runId })` is called again when resuming a suspended workflow.
- Test mocks for `useMastraClientRunner` must return a **stable run object** to avoid `fetchThreads` dependency churn and accidental error-state clearing.

## Important rule / caveat
- Next LSP rule `71007` (`run not serializable in use client entry`) is a **benign false positive** for these hooks; `next build` still compiles successfully.

## Drill-down entries
- **fresh_token_runner_for_chat_and_deep_research.md**: full migration details, file list, flow, and facts
- Related context: `auth_integration/context.md`, `frontend_ui/chat_page_thread_cache/context.md`, `frontend_ui/chat_streaming_error_handling/context.md`