---
children_hash: a7fcf2f7ab581fc03e5c84928f6452ec9a6f3ad3b505cec7e1eeecda62c989cb
compression_ratio: 0.7105517909002904
condensation_order: 1
covers: [live_testing_without_the_workos_wall.md]
covers_token_total: 1033
summary_level: d1
token_count: 734
type: summary
---
# Live Testing Without the WorkOS Wall

This entry documents two complementary ways to live-test the web UI without requiring full production auth or backend availability. The design splits fast component iteration from wired-app validation, and explicitly avoids an env-gated auth bypass in `proxy.ts`.

## Primary paths

### `live_testing_without_the_workos_wall.md`
- **Purpose:** Compare two local testing approaches for the web UI:
  1. a dev-only `/preview` component gallery
  2. an opt-in Playwright **design** project that screenshots the real `/chat` route with backend mocking
- **Core flow:** `/preview` for isolated component rendering → Playwright design project for the actual wired app → mocked backend responses → PNG capture for review
- **Key rule:** prefer `/preview` for quick visual iteration; use the Playwright design project when streaming, sidebar behavior, or citations need to be validated in the real app
- **Notable constraint:** no auth-bypass flag was added to `proxy.ts`

## Structural overview

### `/preview` path
- Dev-only component gallery for rendering real UI components against fixtures
- No auth wall and no backend dependency
- Protected from production use by a `NODE_ENV`-based 404 gate
- Listed in `proxy.ts` unauthenticated paths so it works in development without a login round-trip
- Best for fast, isolated UI work and theme toggling

### Playwright `design` project
- Runs against the real `/chat` route
- Uses a minted WorkOS test-user cookie via `storageState`
- Intercepts Mastra/Neo4j backend calls through `mockMastraAPI`
- Produces screenshots for light and dark themes
- Intended for validating the fully wired UI, especially streaming and citations
- Outputs PNGs to `e2e/design-shots/`, which is gitignored

## Dependencies and setup signals
- Requires `auth.setup.ts` to mint the WorkOS test-user cookie
- Uses `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` from the root `.env`
- Depends on `e2e/helpers/mock-routes.ts` for backend mocking
- Playwright config is in `e2e/playwright.config.ts`
- Screenshot command is `npx playwright test --project=design`

## Drill-down references
- `live_testing_without_the_workos_wall.md` — overall strategy, rules, and tradeoffs
- `frontend_ui/context.md` — broader UI context
- `auth_integration/context.md` — auth/test-user setup background
- `frontend_ui/chat_streaming_error_handling/ai_sdk_v6_sse_streaming_and_error_handling.md` — streaming-related validation
- `frontend_ui/chat_page_thread_cache/chat_page_thread_cache_restoration.md` — chat state/cache behavior
- `frontend_ui/message_persistence_parsing/quiet_citation_styling_in_messagelist.md` — citation rendering details
- `frontend_ui/message_feedback/message_feedback_flow.md` — feedback UI flow
- `frontend_ui/proxy_handling/web_theme_persistence.md` — theme persistence behavior
- `frontend_ui/design_system/document_of_record_design_language.md` — design system context