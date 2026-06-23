---
title: Fresh-token Runner for Chat and Deep Research
tags: []
related: [auth_integration/context.md, frontend_ui/chat_page_thread_cache/context.md, frontend_ui/chat_streaming_error_handling/context.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-06-22T23:47:53.724Z'
updatedAt: '2026-06-22T23:47:53.724Z'
---
## Raw Concept
**Task:**
Migrate the web chat thread lifecycle and deep research workflow to a fresh-token runner so token expiry does not break thread operations or suspended workflow resumes.

**Changes:**
- useChatThread now receives a MastraRunner and performs memory/thread operations through run(client => ...)
- useDeepResearch now stores runId separately and re-attaches with createRun({ runId }) on resume
- chat/page.tsx switched to useMastraClientRunner and passes run into both hooks
- Unit tests assert that createRun is re-invoked with the captured runId when resuming the deep research workflow

**Files:**
- packages/web/src/lib/use-chat-thread.ts
- packages/web/src/lib/use-deep-research.ts
- packages/web/src/app/chat/page.tsx
- packages/web/tests/lib/use-deep-research.test.tsx

**Flow:**
chat or workflow action -> fresh-token runner -> client.createMemoryThread / listMessages / getWorkflow(id).createRun() -> startAsync or resumeAsync -> survive token expiry

**Timestamp:** 2026-06-22

**Patterns:**
- `^run(client => .*createRun({ runId }).resumeAsync` - Re-attaches a suspended workflow run by captured runId before resuming
- `^run(client => .*createRun().startAsync` - Starts a workflow run through a freshly fetched token client and stores runId

## Narrative
### Structure
The chat memory surface now routes thread creation and message loading through a MastraRunner, while deep research keeps a runId ref so a suspended workflow can be resumed after a token refresh. The page component owns a single runner instance and passes it into both hooks, and the test suite verifies the re-attachment behavior.

### Dependencies
Depends on a runner that can rebuild a client with a fresh access token. Deep research also depends on workflow createRun supporting an optional runId for re-attachment.

### Highlights
Prevents access-token expiry from 401ing thread operations and preserves suspended deep-research workflows across the plan-approval gate. The test suite also captures a stable-mock requirement for runner-based hook tests.

### Rules
Next LSP rule 71007 (`run not serializable in use client entry`) is a benign false positive for hooks; `next build` compiles fine.

### Examples
When a deep research plan suspends at plan-approval, approve() calls createRun({ runId }) and then resumeAsync({ step: "plan-approval", resumeData }).

## Facts
- **use_chat_thread_runner_api**: useChatThread now accepts run: MastraRunner instead of ChatThreadClient [project]
- **chat_thread_client_access_pattern**: useChatThread wraps loadThread and ensureThreadExists in run(client => ...) [project]
- **deep_research_runner_api**: useDeepResearch now accepts run: MastraRunner and stores runId in runIdRef [project]
- **deep_research_start_flow**: useDeepResearch start creates a workflow run, stores runId, then calls startAsync [project]
- **deep_research_resume_flow**: useDeepResearch resume re-attaches with createRun({ runId }) and calls resumeAsync [project]
- **deep_research_token_expiry_behavior**: The plan-approval gate can outlive the access token, so the workflow must be re-attached with a fresh-token client [project]
- **chat_page_runner_switch**: chat/page.tsx switched from useMastraClient to useMastraClientRunner and passes run to both chat and deep research hooks [project]
- **runner_mock_stability**: Test mocks for useMastraClientRunner must return a stable run object to avoid fetchThreads dependency churn and error-state clearing [project]
- **next_lsp_rule_71007**: Next LSP rule 71007 about run not serializable in a use client entry is a benign false positive for these hooks [project]
- **workflow_run_identity**: createRun accepts an optional runId parameter and WorkflowRun has a readonly runId [project]
