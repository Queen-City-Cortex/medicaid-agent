# Message Feedback (Thumbs Up/Down)

## Goals

1. **Improve the agent** — Identify weak answers to tune prompts, retrieval, and verification
2. **Audit trail** — Track accuracy ratings for stakeholder reporting on Medicaid content

## Decisions

- **Approach**: Dedicated feedback API route in the agent package (Approach A)
- **Granularity**: Per assistant message (one rating per message per user)
- **Storage**: New `feedback` table in the existing LibSQL database (`mastra.db`)
- **Dashboard**: Store only for now; query ad-hoc with SQL. Build a view later.
- **Mastra**: No built-in support — fully custom implementation

## Database Schema

New `feedback` table in LibSQL (`mastra.db`):

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID, generated client-side |
| `thread_id` | TEXT NOT NULL | References the conversation thread |
| `message_id` | TEXT NOT NULL | The assistant message being rated |
| `resource_id` | TEXT NOT NULL | User ID from WorkOS auth |
| `rating` | TEXT NOT NULL | `'up'` or `'down'` |
| `comment` | TEXT | Optional free-text (only on thumbs-down) |
| `created_at` | TEXT NOT NULL | ISO 8601 timestamp |

Unique constraint on `(message_id, resource_id)` — upsert replaces the previous rating if a user changes their mind.

## API Endpoint

`POST /api/feedback` on the Mastra agent server (port 4111). Authenticated via WorkOS bearer token (same as chat endpoint).

### Request

```json
{
  "messageId": "msg-abc123",
  "threadId": "thread-xyz",
  "rating": "up",
  "comment": "Wrong policy cited"
}
```

- `rating`: Required. `"up"` or `"down"`.
- `comment`: Optional. Free-text, only expected on `"down"`.
- `resource_id`: Extracted from the auth token server-side, not sent by the client.

### Response

- `201 Created` with `{ id }` on insert
- `200 OK` with `{ id }` on upsert (rating replaced)
- `400` for validation errors
- `401` for missing/invalid auth

### Delete endpoint

`DELETE /api/feedback/:id` — removes a rating (when user deselects the active thumb). Scoped to the authenticated user's `resource_id`. Returns `204 No Content`.

### Query endpoint

`GET /api/feedback?threadId=X` — returns all feedback for a thread. Used by the frontend to restore rating state on page load. Scoped to the authenticated user's `resource_id`.

## Frontend UI

### Placement

Added to the existing `MessageActions` component (`packages/web/src/components/MessageActions.tsx`) alongside the Copy and Re-run buttons. Shown only for completed assistant messages (not while streaming).

### Interaction

- Two icon buttons: `ThumbsUp` and `ThumbsDown` (Lucide icons, already in the project)
- Unfilled by default. Clicking one fills it and grays out the other.
- Clicking the active thumb again deselects it (sends a `DELETE /api/feedback/:id` to remove the row)
- On thumbs-down: a small text input slides in below with placeholder "What went wrong?" and a submit button
- The rating is saved immediately on click (optimistic). If the user adds a comment, a second `POST /api/feedback` upserts the same row with the comment attached.

### State management

- **Optimistic UI**: Button fills immediately, API call fires in background. On error, revert and show a brief toast.
- **Persistence**: Feedback state fetched per-thread via `GET /api/feedback?threadId=X` when loading messages, so ratings survive page reloads.
- **Styling**: Muted icons matching existing Copy/Re-run button style.

## Testing

### Agent (unit tests)

- Feedback repository layer: insert, upsert, query by thread
- API route handler: auth enforcement, validation, happy path, duplicate handling

### Web (unit tests)

- `MessageActions` component: renders thumb buttons for assistant messages, optimistic state toggle, comment input appears on thumbs-down

### E2E (Playwright)

- Mocked test: submit thumbs-up, verify button state changes
- Submit thumbs-down with comment, verify the flow
- Reload page, verify rating persists

## Out of Scope

- Admin dashboard for browsing feedback
- Integration with hallucination verifier (feeding ratings back into verification)
- Analytics or aggregation queries
- Per-citation or per-section granularity
- Category picker on thumbs-down (just free-text for now)
