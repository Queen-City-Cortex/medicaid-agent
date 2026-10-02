---
children_hash: 8558c62028c26410299b06b4c10e7d72437d8f9c7155738413921243ae6dc641
compression_ratio: 0.5635964912280702
condensation_order: 1
covers: [context.md, message_feedback_flow.md]
covers_token_total: 912
summary_level: d1
token_count: 514
type: summary
---
# message_feedback

## Structural Overview
The `message_feedback` topic documents the end-to-end message feedback pipeline spanning persistent storage, API routes, web client helpers, and chat UI behavior. The core flow is covered in `message_feedback_flow.md`, while `context.md` provides the higher-level framing of schema, route validation, client utilities, and optimistic UI integration.

## Main Components
- **Persistence layer** — `packages/agent/src/feedback/repository.ts`
  - LibSQL-backed `FeedbackRepository`
  - Lazy table initialization
  - Guarded rating values
- **API layer** — `packages/agent/src/feedback/routes.ts`
  - POST / GET / DELETE feedback routes
  - Input validation with `zod`
  - `resourceId` derived from `requestContext`
- **Web client layer** — `packages/web/src/lib/feedback-client.ts`
  - Helpers for submit, delete, and fetch
  - Uses Bearer authorization and `credentials: include`
- **UI integration** — `packages/web/src/components/MessageActions.tsx`
  - Optimistic `feedbackMap` updates
  - Rollback on errors
  - Optional comment capture for down votes
- **Page integration** — `packages/web/src/app/chat/page.tsx`
  - Connects feedback actions into chat-page state and behavior

## Key Behaviors
- Feedback is tied to the originating message and persisted chat state.
- The UI uses optimistic updates so feedback appears immediately, then rolls back if the request fails.
- Down votes can surface a “What went wrong?” comment input; comments are only stored when provided.
- The flow is message-centric: rendered message → feedback capture → association with message → state update.

## Rules and Constraints
- `registerApiRoute` paths must not begin with `"/api/"`.
- `getResourceId` must resolve `user.userId` or `user.id` from `c.get("requestContext")`, otherwise throw `User not authenticated`.
- `FeedbackEntry.comment` is `null` for up ratings and only populated for down ratings when text is supplied.

## Drill-Down Entry
- `message_feedback_flow.md` — detailed flow, rules, and UI interaction behavior.