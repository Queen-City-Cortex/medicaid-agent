# Message Feedback (Thumbs Up/Down)

## Goals

1. **Improve the agent** — Identify weak answers to tune prompts, retrieval, and verification
2. **Audit trail** — Track accuracy ratings for stakeholder reporting on Medicaid content

## Decisions

- **Approach**: Dedicated feedback API route in the agent package (Approach A)
- **Granularity**: Per assistant message (one rating per message per user)
- **Storage**: New `feedback` table in the existing LibSQL database (`mastra.db`)
- **Dashboard**: Store only for now; query ad-hoc with SQL. Build a view later.
- **Mastra built-in feedback**: Mastra's `@mastra/core` ships `createFeedback`/`listFeedback` APIs, but they are **trace/span-level only** (require `traceId`, optional `spanId`). They have no per-message or per-thread semantics and no automatic user scoping from auth. A custom table gives us direct message-level ratings with user identity from WorkOS — a better fit for the goals above.

## Database Schema

New `feedback` table in LibSQL (`mastra.db`):

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID, generated client-side |
| `thread_id` | TEXT NOT NULL | References the conversation thread |
| `message_id` | TEXT NOT NULL | The assistant message being rated |
| `resource_id` | TEXT NOT NULL | User ID from WorkOS auth |
| `rating` | TEXT NOT NULL | `'up'` or `'down'` |
| `comment` | TEXT | Optional free-text (only on thumbs-down). Cleared on upsert to `'up'`. |
| `created_at` | TEXT NOT NULL | ISO 8601 timestamp |

Unique constraint on `(message_id, resource_id)` — upsert replaces the previous rating if a user changes their mind. Switching from thumbs-down (with comment) to thumbs-up clears the comment.

### Message ID stability

The current `convertThreadMessageToUIMessage()` in `packages/web/src/lib/parse-message.ts` falls back to `generateUUID()` when `msg.id` is undefined, meaning the same message can get a different ID across page reloads if Mastra memory didn't persist it. To make feedback rehydration reliable, the implementation must ensure that message IDs returned from Mastra memory are stable. If any messages lack IDs, feedback for those messages won't survive a reload — this is an acceptable degradation for the initial version, but the implementation should log a warning when the fallback fires so we can track how often it happens.

## API Endpoints

All endpoints registered on the Mastra agent server (port 4111) via `registerApiRoute()`. **Paths must NOT start with `/api/`** — Mastra reserves that prefix for internal routes and rejects it at both type and runtime level.

### Create/update feedback

`POST /feedback` — Authenticated via WorkOS bearer token.

**Request body:**
```json
{
  "messageId": "msg-abc123",
  "threadId": "thread-xyz",
  "rating": "up",
  "comment": "Wrong policy cited"
}
```

- `rating`: Required. `"up"` or `"down"`.
- `comment`: Optional. Free-text, only expected on `"down"`. Cleared on upsert to `"up"`.
- `resource_id`: Extracted from the auth token server-side, not sent by the client.

**Response:**
- `201 Created` with `{ id }` on insert
- `200 OK` with `{ id }` on upsert (rating replaced)
- `400` for validation errors
- `401` for missing/invalid auth

### Delete feedback

`DELETE /feedback/:id` — removes a rating (when user deselects the active thumb). Scoped to the authenticated user's `resource_id`. Returns `204 No Content`.

### Query feedback

`GET /feedback?threadId=X` — returns all feedback for a thread. Used by the frontend to restore rating state when a thread is selected. Scoped to the authenticated user's `resource_id`.

## Frontend UI

### Component changes

This feature touches three layers, not just `MessageActions`:

1. **`ChatPage`** (`packages/web/src/app/chat/page.tsx`): Adds a feedback fetch/store layer. When a thread is selected (not on initial mount — initial mount creates a fresh threadId with no history), fetch `GET /feedback?threadId=X` and hold the results in state. Provide mutation callbacks (`onRate`, `onDelete`) to child components.

2. **`MessageList`** (`packages/web/src/components/MessageList.tsx`): Currently passes only `content` and `onRerun` per message. Must also pass `messageId`, `threadId`, the current rating (if any), and feedback mutation callbacks down to `MessageActions`.

3. **`MessageActions`** (`packages/web/src/components/MessageActions.tsx`): Adds thumbs-up/down buttons and the optional comment input. Receives feedback state and callbacks as props.

### Interaction

- Two icon buttons: `ThumbsUp` and `ThumbsDown` (Lucide icons, already in the project)
- Unfilled by default. Clicking one fills it and grays out the other.
- Clicking the active thumb again deselects it (sends `DELETE /feedback/:id` to remove the row)
- On thumbs-down: a small text input slides in below with placeholder "What went wrong?" and a submit button
- The rating is saved immediately on click (optimistic). If the user adds a comment, a second `POST /feedback` upserts the same row with the comment attached.

### State management

- **Optimistic UI**: Button fills immediately, API call fires in background. On error, revert and show an inline error indicator (red outline on the button). No toast library exists in the project — avoid adding one for this feature alone.
- **Persistence**: Feedback state fetched per-thread via `GET /feedback?threadId=X` when a user selects an existing thread from the sidebar. On initial page load (fresh threadId, no messages), no fetch is needed.
- **Styling**: Muted icons matching existing Copy/Re-run button style.

## Testing

### Agent (unit tests)

- Feedback repository layer: insert, upsert, query by thread, delete
- API route handler: auth enforcement, validation, happy path, duplicate handling
- Upsert clears comment when switching from down to up

### Web (unit tests)

- `MessageActions` component: renders thumb buttons for assistant messages, optimistic state toggle, comment input appears on thumbs-down, error indicator on failure
- `MessageList`: passes feedback props through to MessageActions

### E2E (Playwright)

- Mocked test: submit thumbs-up, verify button state changes
- Submit thumbs-down with comment, verify the flow
- Select an existing thread from the sidebar, verify ratings rehydrate from the API

## Out of Scope

- Admin dashboard for browsing feedback
- Integration with hallucination verifier (feeding ratings back into verification)
- Analytics or aggregation queries
- Per-citation or per-section granularity
- Category picker on thumbs-down (just free-text for now)
- Toast/notification library (use inline error indicator instead)
- Using Mastra's trace-level feedback APIs (wrong granularity for this feature)
