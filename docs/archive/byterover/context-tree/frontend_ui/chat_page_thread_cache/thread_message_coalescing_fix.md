---
title: Thread Message Coalescing Fix
summary: Refines coalesceThreadMessages in parse-message.ts to drop step-start from merged assistant turns, remove a stale JSDoc, preserve verification metadata, and keep multi-turn assistant merges isolated.
tags: []
related: [frontend_ui/chat_page_thread_cache/context.md, frontend_ui/chat_streaming_error_handling/context.md, frontend_ui/chat_page_thread_cache/message_parts_and_thread_message_restoration.md]
keywords: []
createdAt: '2026-06-23T01:54:34.827Z'
updatedAt: '2026-06-23T01:54:34.827Z'
---
## Reason
Document the refinement to coalesceThreadMessages and the associated regression tests.

## Raw Concept
**Task:**
Refine thread message restoration so assistant turns coalesce correctly after reload.

**Changes:**
- Removed stale orphaned JSDoc above ThreadMessageMetadata
- Stopped mergeAssistantTurn from including step-start parts in the merged assistant turn
- Added regression tests for multi-turn isolation and step-start dropping

**Files:**
- packages/web/src/lib/parse-message.ts
- packages/web/tests/lib/parse-message.test.ts

**Flow:**
persisted raw thread messages -> coalesce assistant turn -> order tool parts before answer text -> preserve verification metadata -> render UI message

**Timestamp:** 2026-06-23T01:54:17.125Z

**Author:** ByteRover context engineer

## Narrative
### Structure
The implementation lives in parse-message.ts and converts persisted thread messages into UIMessage objects, while the tests cover text conversion, V2 tool parts, assistant-turn coalescing, and step-start handling.

### Dependencies
Depends on ai UIMessage parts, generateUUID fallback IDs, and message-parts helpers used by the chat timeline renderer and verification badge restoration.

### Highlights
Assistant turns remain coalesced into one UI message, tools stay ahead of answer text, verification state survives reload, om-only turns are dropped, and step-start no longer appears in merged tool runs.

### Rules
Step boundaries are meaningless once a turn's split messages are merged. MessageList ignores step-start anyway since it is neither a tool nor a text part.

### Examples
The tests include a two-turn fixture that keeps each turn's tool call and answer isolated, plus a step-start-dropped assertion.

## Facts
- **fix_id**: The fix refines F-RESTORE-001 in packages/web/src/lib/parse-message.ts. [project]
- **stale_jsdoc_removed**: The change removes a stale orphaned JSDoc that described convertThreadMessageToUIMessage but was attached to nothing after the refactor. [project]
- **step_start_handling**: mergeAssistantTurn no longer buckets step-start parts into the coalesced assistant turn; only tool-invocation parts go into the tools bucket. [project]
- **step_start_ui_role**: MessageList ignores step-start because it is neither a tool nor a text part. [project]
- **step_start_visibility**: step-start is filtered from visibleParts and does not affect lastToolIndex or finalAnswer. [project]
- **step_start_effect**: Dropping step-start prevents a stray step-start from leading the merged tool run. [project]
- **multi_turn_isolation**: A multi-turn regression test proves two user-then-assistant turns coalesce independently with no cross-turn bleed. [project]
- **step_start_regression_test**: A regression test asserts that step-start parts are dropped from the coalesced turn. [project]
