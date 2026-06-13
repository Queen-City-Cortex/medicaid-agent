---
children_hash: 5f5915ad756d97df7564977b116ca0c4f88099f6dd9e8cd01833ed3db2447e7e
compression_ratio: 0.5329581993569131
condensation_order: 1
covers: [context.md, message_feedback_flow.md]
covers_token_total: 1244
summary_level: d1
token_count: 663
type: summary
---
## message_feedback

Structural overview of the message feedback system spanning persistence, API routing, web client helpers, and chat UI integration. The core flow is documented in **message_feedback_flow.md**, with the high-level topic summary in **context.md**.

### Main architecture
- **Persistence layer**: `FeedbackRepository` in `packages/agent/src/feedback/repository.ts` wraps `@libsql/client`, lazily creates the `feedback` table, and enforces `UNIQUE(message_id, resource_id)` plus rating validation (`up` / `down`).
- **API layer**: `packages/agent/src/feedback/routes.ts` registers Hono routes through `registerApiRoute` for `POST`, `GET`, and `DELETE` on `/feedback` and `/feedback/:id`. It validates payloads with `zod` and derives `resourceId` from `c.get("requestContext").get("user")`.
- **Web client layer**: `packages/web/src/lib/feedback-client.ts` provides `submitFeedback`, `deleteFeedback`, and `getFeedbackByThread` using `fetch` with Bearer auth and `credentials: include`.
- **UI integration**: `packages/web/src/components/MessageActions.tsx` and `packages/web/src/app/chat/page.tsx` connect feedback state into the chat experience via `feedbackMap`, optimistic updates, and persistence hooks.

### Key behavior patterns
- **Optimistic updates with rollback**: UI state updates immediately on rate actions, then reverts if the API request fails.
- **Thread hydration**: chat load fetches message feedback for the thread and merges it into `feedbackMap`.
- **Comment gating for negative feedback**: down ratings can open a lightweight “What went wrong?” comment input; comments are only attached when supplied.
- **Authenticated resource binding**: feedback is scoped to a user-derived `resourceId`, and missing authentication is treated as an error path.

### Notable dependencies
- `@libsql/client` for database access
- `Hono` / `registerApiRoute` for routing
- `zod` for validation
- `crypto.randomUUID` for IDs
- `DefaultChatTransport` and Mastra memory payloads in the chat page
- `NEXT_PUBLIC_MASTRA_URL` or localhost for client base URL resolution

### Rules and constraints
- `registerApiRoute` paths must **not** begin with `/api/`.
- `getResourceId` must resolve `user.userId` or `user.id` from `requestContext`, otherwise throw `"User not authenticated"`.
- `FeedbackEntry.comment` is `null` for up ratings and only set for down ratings with user-entered text.

### Drill-down references
- **context.md** — compact topic overview and related-topic link to `frontend_ui/chat_page_scroll_stability`
- **message_feedback_flow.md** — full raw concept, narrative, rules, examples, and facts for the feedback pipeline