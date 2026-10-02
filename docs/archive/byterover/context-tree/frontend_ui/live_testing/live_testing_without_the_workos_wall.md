---
title: Live Testing Without the WorkOS Wall
tags: []
related: [frontend_ui/context.md, auth_integration/context.md, frontend_ui/proxy_handling/web_theme_persistence.md, frontend_ui/design_system/document_of_record_design_language.md, frontend_ui/message_persistence_parsing/quiet_citation_styling_in_messagelist.md, frontend_ui/chat_streaming_error_handling/ai_sdk_v6_sse_streaming_and_error_handling.md, frontend_ui/chat_page_thread_cache/chat_page_thread_cache_restoration.md, frontend_ui/thread_sidebar/thread_sidebar_fetch_resilience.md, frontend_ui/message_feedback/message_feedback_flow.md, frontend_ui/chat_page_review_fixes/live_ui_testing_without_workos_auth_wall.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-06-19T20:22:38.206Z'
updatedAt: '2026-06-19T20:22:38.206Z'
---
## Raw Concept
**Task:**
Document two ways to live-test the web UI without the WorkOS auth wall and backend dependency

**Changes:**
- Added a dev-only /preview component gallery for isolated UI iteration
- Added an opt-in Playwright design project that screenshotted the real /chat route with backend mocking
- Explicitly avoided adding an env-gated auth bypass to proxy.ts

**Files:**
- packages/web/src/app/preview/page.tsx
- packages/web/src/app/preview/gallery.tsx
- e2e/tests/design/screenshots.shots.ts
- e2e/playwright.config.ts
- e2e/helpers/mock-routes.ts
- packages/web/AGENTS.md

**Flow:**
/preview for isolated component rendering -> Playwright design project for wired /chat screenshots -> mock backend responses -> capture PNGs for review

**Timestamp:** 2026-06-19

**Author:** project notes

**Patterns:**
- `^npx playwright test --project=design$` - Command used to run the design screenshot project

## Narrative
### Structure
There are two UI validation paths: a dev-only /preview gallery for component-level iteration and a Playwright design project for the actual /chat route with the backend fully mocked. The /preview route is protected by a production 404 gate, while the design project depends on an authenticated storageState and writes screenshots for light and dark themes.

### Dependencies
The design project depends on a minted WorkOS test-user cookie from auth.setup.ts, TEST_USER_EMAIL and TEST_USER_PASSWORD in the root .env, and mockMastraAPI to intercept backend calls. The preview route depends only on fixture data and an in-page light/dark toggle.

### Highlights
The guidance favors /preview for fast visual work and the Playwright design project when streaming, sidebar, or citations need to be seen in the actually wired app. The note also states that no env-gated auth bypass was added to proxy.ts.

### Rules
Prefer /preview for fast visual work; reach for the Playwright project when behavior/wiring matters.

### Examples
Example commands and outputs include opening http://localhost:3000/preview in dev and running npx playwright test --project=design to generate PNGs under e2e/design-shots/.

## Facts
- **preview_route**: /preview is a dev-only component gallery for real UI components against fixtures, with no auth and no backend [project]
- **preview_production_gate**: /preview returns 404 in production via a NODE_ENV check [project]
- **preview_proxy_allowlist**: /preview is listed in proxy.ts unauthenticatedPaths so it is reachable in development without a login round-trip [project]
- **design_project_chat_route**: The Playwright design project drives the real /chat UI using a real WorkOS test-user cookie via storageState [project]
- **design_project_backend**: The design project mocks the Mastra/Neo4j backend via mockMastraAPI so no agent or database is needed [project]
- **design_project_command**: The design project is run with npx playwright test --project=design [project]
- **design_shots_directory**: Design screenshots are written to e2e/design-shots/ and that directory is gitignored [project]
- **theme_cookie**: The design project sets a theme cookie per run for light and dark screenshots [project]
- **test_credentials**: The design project uses TEST_USER_EMAIL and TEST_USER_PASSWORD in the root .env for test credentials [project]
