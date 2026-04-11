---
title: Message Feedback Flow
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-05T00:00:53.037Z'
updatedAt: '2026-04-05T00:00:53.037Z'
---
## Raw Concept
**Task:**
Document the message feedback feature covering LibSQL storage, Hono routes, web client utilities, and chat UI behaviors.

**Changes:**
- Added LibSQL-backed FeedbackRepository with lazy table initialization and guarded rating values
- Exposed POST/GET/DELETE feedback routes that validate input with zod and derive resourceId from requestContext
- Provided web feedback client helpers for submit/delete/fetch using Bearer authorization and credentials include
- Connected MessageActions + ChatPage to optimistic feedbackMap updates, rollback on errors, and optional comment capture for down votes

**Files:**
- packages/agent/src/feedback/repository.ts
- packages/agent/src/feedback/routes.ts
- packages/web/src/lib/feedback-client.ts
- packages/web/src/components/MessageActions.tsx
- packages/web/src/app/chat/page.tsx

**Flow:**
Load thread -> fetch messages -> fetch feedback entries for thread -> populate feedbackMap -> rate message optimistically -> call POST/DELETE APIs -> revert on failure -> attach comment when down rating without comment.

**Timestamp:** 2026-04-05

**Author:** Medicaid Agent Team

## Narrative
### Structure
FeedbackRepository wraps @libsql/client to lazily ensure the feedback table exists, exports upsert/delete/getByThread operations, and enforces UNIQUE(message_id, resource_id) plus rating checks before writing. Routes.ts wires the repository to Hono via registerApiRoute, validates payloads with zod, derives resourceId from c.get("requestContext").get("user"), and maps POST/GET/DELETE handlers to the Mastra feedback endpoints. Web-facing code supplies feedback-client helpers and MessageActions to keep the UI in sync with backend data, while ChatPage enriches DefaultChatTransport with feedbackMap state and persistence hooks.

### Dependencies
Requires @libsql/client for database access, Hono registerApiRoute for routing (paths must not start with "/api/"), zod for payload validation, crypto.randomUUID for IDs, and DefaultChatTransport with Mastra memory payloads; the web client calls use NEXT_PUBLIC_MASTRA_URL or localhost and include Authorization Bearer tokens with credentials: include for cross-origin requests.

### Highlights
Optimistic UI updates keep feedbackMap mutations visible immediately and rollback on API failure, down votes prompt a lightweight comment input, GET feedback merges entries into UI state on thread load, MessageActions exposes tooltip-wrapped thumbs buttons plus copy/rerun helpers, and the feedback system surfaces 401-level guidance via getResourceId throwing when no authenticated user is present.

### Rules
Rule 1: registerApiRoute paths must not begin with "/api/".
Rule 2: getResourceId must find user.userId or user.id from c.get("requestContext") or throw "User not authenticated".
Rule 3: FeedbackEntry.comment is null for up ratings and only populated for down ratings when the user supplies text.

### Examples
Submit feedback by calling submitFeedback({ messageId, threadId, rating: "up" or "down", comment? }, baseUrl, accessToken). Delete by calling deleteFeedback(id, baseUrl, accessToken). Retrieve thread votes via getFeedbackByThread(threadId, baseUrl, accessToken). In MessageActions, clicking the thumbs toggles rating and falling back to onClearRating when re-clicked; down votes without comments expose the "What went wrong?" input that dispatches onComment once submitted.

## Facts
- **feedback_table_schema**: FeedbackRepository lazily creates the LibSQL 'feedback' table with id primary key, message_id + resource_id unique constraint, and rating limited to 'up' or 'down'. [project]
- **feedback_api_routes**: Feedback API exposes POST/GET/DELETE on /feedback and /feedback/:id via registerApiRoute while deriving resourceId from c.get("requestContext").get("user"). [project]
- **feedback_client_fetch**: Web feedback client submits, deletes, and fetches feedback via fetch calls to baseUrl/feedback using Bearer authorization and credentials: include. [project]
- **feedback_message_actions**: MessageActions renders thumbs up/down controls, triggers optimistic rating updates through onRate/onClearRating, and presents a comment input when down ratings have no comment yet. [project]
