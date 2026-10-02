---
title: Web Theme Persistence
summary: The web app stores theme preference in a cookie for first paint, while WorkOS metadata only syncs preferences across devices and backfills the cookie.
tags: []
related: [frontend_ui/design_system/document_of_record_design_language.md, frontend_ui/message_persistence_parsing/quiet_citation_styling_in_messagelist.md, frontend_ui/chat_streaming_error_handling/ai_sdk_v6_sse_streaming_and_error_handling.md, frontend_ui/chat_page_thread_cache/chat_page_thread_cache_restoration.md, frontend_ui/thread_sidebar/thread_sidebar_fetch_resilience.md, frontend_ui/message_feedback/message_feedback_flow.md, frontend_ui/live_testing/live_testing_without_the_workos_wall.md, frontend_ui/chat_page_review_fixes/live_ui_testing_without_workos_auth_wall.md]
keywords: []
createdAt: '2026-06-20T02:08:40.997Z'
updatedAt: '2026-06-20T02:08:40.997Z'
---
## Reason
Document the corrected theme persistence model in the web README

## Raw Concept
**Task:**
Document how the web app persists and applies theme preference.

**Changes:**
- Clarified the theme is cookie-first
- Retained WorkOS metadata only as a sync/backfill mechanism
- Noted server-side and client-side reads that prevent theme flash

**Files:**
- packages/web/README.md
- packages/web/src/app/actions/theme.ts
- packages/web/src/app/layout.tsx

**Flow:**
read cookie server-side -> pre-paint client script -> render correct theme -> sync to WorkOS for cross-device reuse

**Timestamp:** 2026-06-20

## Narrative
### Structure
Theme persistence is implemented as a cookie-first flow with WorkOS metadata as an auxiliary sync layer.

### Dependencies
Depends on layout.tsx and src/app/actions/theme.ts for cookie reading and user-metadata sync.

### Highlights
This avoids a flash of incorrect theme on first load while still supporting cross-device preference carryover.

### Examples
The README explicitly states the preference follows users across devices and backfills the cookie on a new device.

## Facts
- **web_app_type**: The web app is a Next.js 16 chat interface for the NC Medicaid Navigator agent. [project]
- **theme_storage**: Theme preference is stored in a theme cookie. [project]
- **theme_server_read**: layout.tsx reads the theme cookie server-side. [project]
- **theme_client_read**: A pre-paint inline script reads the theme client-side to avoid flash of unstyled content. [project]
- **workos_theme_sync_role**: WorkOS user metadata is used only for cross-device sync and cookie backfill. [project]
