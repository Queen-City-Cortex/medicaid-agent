---
title: Message Feedback Flow
summary: Documented the message feedback flow and its place in chat UI behavior.
tags: []
related: [frontend_ui/message_persistence_parsing/message_persistence_parsing.md]
keywords: []
createdAt: '2026-04-05T00:00:53.037Z'
updatedAt: '2026-06-19T17:56:03.418Z'
---
## Reason
Curate message feedback flow knowledge from context.

## Raw Concept
**Task:**
Document the message feedback flow used in the frontend chat UI.

**Changes:**
- Added LibSQL-backed FeedbackRepository with lazy table initialization and guarded rating values
- Exposed POST/GET/DELETE feedback routes that validate input with zod and derive resourceId from requestContext
- Provided web feedback client helpers for submit/delete/fetch using Bearer authorization and credentials include
- Connected MessageActions + ChatPage to optimistic feedbackMap updates, rollback on errors, and optional comment capture for down votes
- Captured the message feedback interaction flow.

**Files:**
- packages/agent/src/feedback/repository.ts
- packages/agent/src/feedback/routes.ts
- packages/web/src/lib/feedback-client.ts
- packages/web/src/components/MessageActions.tsx
- packages/web/src/app/chat/page.tsx

**Flow:**
message rendered -> user feedback captured -> feedback associated with the message -> state updated

**Timestamp:** 2026-06-19

**Author:** Medicaid Agent Team

## Narrative
### Structure
Describes a message-level feedback path in the frontend UI.

### Dependencies
Depends on message identity and persisted chat state to attach feedback to the correct message.

### Highlights
Keeps feedback tied to the originating message within the chat experience.

### Rules
Rule 1: registerApiRoute paths must not begin with "/api/".
Rule 2: getResourceId must find user.userId or user.id from c.get("requestContext") or throw "User not authenticated".
Rule 3: FeedbackEntry.comment is null for up ratings and only populated for down ratings when the user supplies text.

### Examples
Submit feedback by calling submitFeedback({ messageId, threadId, rating: "up" or "down", comment? }, baseUrl, accessToken). Delete by calling deleteFeedback(id, baseUrl, accessToken). Retrieve thread votes via getFeedbackByThread(threadId, baseUrl, accessToken). In MessageActions, clicking the thumbs toggles rating and falling back to onClearRating when re-clicked; down votes without comments expose the "What went wrong?" input that dispatches onComment once submitted.

## Facts
- **message_feedback_flow**: The context includes a frontend UI topic about message feedback flow. [project]
