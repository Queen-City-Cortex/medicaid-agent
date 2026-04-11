---
children_hash: 38d6b85015fe261fdc2b3d682caf1f91e62645d7f9d172ae244ed5006db48074
compression_ratio: 0.5988562091503268
condensation_order: 1
covers: [context.md, message_feedback_flow.md]
covers_token_total: 1224
summary_level: d1
token_count: 733
type: summary
---
### message_feedback
- **Scope & Purpose**: Synthesizes the message feedback pipeline from persistence (LibSQL) through agent routes to chat UI integration so contributors understand schema definitions, APIs, and optimistic behaviors. See `context.md` for overview and structural context.
- **Persistence & API Layer** (`message_feedback_flow.md` raw concept & structure):
  - **FeedbackRepository** (`packages/agent/src/feedback/repository.ts`): Lazily provisioned LibSQL `feedback` table with `UNIQUE(message_id, resource_id)` and rating guardrails; offers `upsert`, `delete`, and `getByThread` operations tied to Mastra identifiers.
  - **Routes** (`packages/agent/src/feedback/routes.ts`): `registerApiRoute` (paths must avoid leading `/api/`) exposes POST/GET/DELETE handlers, validates payloads via zod, and derives `resourceId` from `c.get("requestContext").get("user")`, enforcing authentication rules.
- **Client & UI Integration** (`message_feedback_flow.md` narrative):
  - **Web Feedback Client** (`packages/web/src/lib/feedback-client.ts`): Helpers for `submitFeedback`, `deleteFeedback`, and `getFeedbackByThread` that call `/feedback*` endpoints with Bearer tokens, `credentials: include`, and configurable base URLs (`NEXT_PUBLIC_MASTRA_URL` / localhost).
  - **MessageActions Component** (`packages/web/src/components/MessageActions.tsx`): Renders tooltip-decorated thumbs controls plus copy/rerun buttons, enforces optimistic `feedbackMap` updates (rollbacks on API errors), and reveals a “What went wrong?” comment input when downvotes lack text; tied to `onRate`, `onClearRating`, and `onComment`.
  - **Chat Page** (`packages/web/src/app/chat/page.tsx`): Augments `DefaultChatTransport` with `feedbackMap` state and persistence hooks to merge GET responses during thread load.
- **Flow & Rules** (`message_feedback_flow.md` narrative/facts):
  - **Flow**: Thread load → fetch messages → fetch thread feedback → populate `feedbackMap` → optimistic rating updates → POST/DELETE APIs → rollback on failure; down votes can attach optional comments.
  - **Rules**: 1) `registerApiRoute` paths cannot start with `/api/`; 2) `getResourceId` must obtain `user.userId`/`user.id` or throw `User not authenticated`; 3) `FeedbackEntry.comment` is null for up ratings and only set when user supplies text on down ratings.
- **Key Highlights** (`message_feedback_flow.md` highlights/facts):
  - Optimistic UI updates with rollback, comment capture for downvotes, and GET feedback merges into UI state.
  - Feedback system surfaces 401 guidance via `getResourceId`.
  - MessageActions’ rating buttons feed into both UI state (`feedbackMap`) and backend persistence.
- **Dependencies** (`message_feedback_flow.md` narrative):
  - Requires `@libsql/client`, Hono `registerApiRoute`, zod validation, `crypto.randomUUID`, DefaultChatTransport/Mastra memory payloads, and web environment configuration (base URL + Bearer tokens).