---
title: Live UI Testing Without WorkOS Auth Wall
tags: []
related: [frontend_ui/chat_page_review_fixes/chat_page_review_fixes.md, frontend_ui/chat_page_scroll_stability/chat_page_scroll_stability.md, auth_integration/workos_authkit_nextjs/callback_base_url_resolution.md, frontend_ui/proxy_handling/web_theme_persistence.md, frontend_ui/design_system/document_of_record_design_language.md, frontend_ui/message_persistence_parsing/quiet_citation_styling_in_messagelist.md, frontend_ui/chat_streaming_error_handling/ai_sdk_v6_sse_streaming_and_error_handling.md, frontend_ui/chat_page_thread_cache/chat_page_thread_cache_restoration.md, frontend_ui/thread_sidebar/thread_sidebar_fetch_resilience.md, frontend_ui/message_feedback/message_feedback_flow.md, frontend_ui/live_testing/live_testing_without_the_workos_wall.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-06-19T20:21:26.494Z'
updatedAt: '2026-06-19T20:21:26.494Z'
---
## Raw Concept
**Task:**
Document two ways to live-test the web UI past the WorkOS auth wall and Mastra/Neo4j dependency.

**Changes:**
- Added a dev-only /preview component gallery for fast visual iteration.
- Added an opt-in Playwright design project that drives the real /chat with mocked backend responses.
- Kept the app protected by production 404 gating instead of an env-based auth bypass.

**Files:**
- packages/web/src/app/preview/page.tsx
- packages/web/src/app/preview/gallery.tsx
- packages/web/src/proxy.ts
- packages/web/AGENTS.md
- e2e/playwright.config.ts
- e2e/tests/design/screenshots.shots.ts
- e2e/helpers/mock-routes.ts
- e2e/helpers/chat-page.ts
- e2e/helpers/stream-builder.ts
- e2e/tests/auth.setup.ts

**Flow:**
dev preview -> /preview -> render fixtures -> screenshot OR setup auth cookie -> run design project -> mock backend -> open /chat -> capture screenshots

**Timestamp:** 2026-06-19T20:21:11.025Z

**Patterns:**
- `^/preview$` - Dev-only preview route
- `^npx playwright test --project=design$` - Command to run the design screenshot project
- `^e2e/design-shots/$` - Output directory for design screenshots

## Narrative
### Structure
The UI testing setup has two paths: a dev-only component gallery in packages/web/src/app/preview/ and an opt-in Playwright design project under e2e/tests/design/. The gallery is the fastest way to inspect components without auth or backend dependencies, while the design project exercises the fully wired /chat experience with mocked Mastra responses.

### Dependencies
The design project depends on a saved WorkOS session cookie from auth.setup.ts, a localhost dev server, and mocked backend routes provided by mockMastraAPI. The preview route depends only on NODE_ENV gating and the proxy allow-list entry.

### Highlights
The production protection is the route-level 404 in PreviewPage rather than an auth bypass. The design project uses the real app shell and streams policy content rich enough to populate citations and the Sources panel.

### Rules
Do not add an env-gated auth bypass to proxy.ts. Prefer /preview for fast component work. Use the Playwright design project only when behavior or wiring matters. Run the design project explicitly with npx playwright test --project=design. The preview route must return 404 in production.

### Examples
Empty state screenshots and conversation screenshots are generated for both light and dark themes. The design stream includes tool calls such as searchSections and getSection so inline footnotes and the Sources panel can be reviewed.

## Facts
- **preview_route**: The dev-only component gallery is available at /preview. [project]
- **preview_scope**: /preview renders real components against fixtures with no auth and no Mastra/Neo4j backend. [project]
- **preview_production_gate**: /preview returns 404 in production. [project]
- **preview_proxy_allowlist**: /preview is added to proxy.ts unauthenticatedPaths so it is reachable in development without a login round-trip. [project]
- **design_project_command**: The Playwright design project is run with npx playwright test --project=design. [project]
- **design_auth_state**: The design project uses a real WorkOS test-user cookie via storageState from auth.setup.ts. [project]
- **design_backend_mocking**: The design project mocks the Mastra backend with mockMastraAPI so no agent or database is needed. [project]
- **design_shot_output**: Design screenshots are written to e2e/design-shots/ and the directory is gitignored. [project]
- **design_theme_cookie**: The design project sets a theme cookie per run for light and dark modes. [project]
- **design_scope**: The design project captures the real /chat experience for streaming, sidebar, and citations behavior. [project]
