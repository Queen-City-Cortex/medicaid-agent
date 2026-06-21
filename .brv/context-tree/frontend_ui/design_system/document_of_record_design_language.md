---
title: Document of Record Design Language
summary: Editorial chat UI design system using self-hosted Fraunces, Newsreader, and IBM Plex Mono with parchment/light and library-at-night/dark themes, paper-grain overlay, and print-safe citation handling.
tags: []
related: [frontend_ui/proxy_handling/web_theme_persistence.md, frontend_ui/message_persistence_parsing/quiet_citation_styling_in_messagelist.md, frontend_ui/chat_streaming_error_handling/ai_sdk_v6_sse_streaming_and_error_handling.md, frontend_ui/chat_page_thread_cache/chat_page_thread_cache_restoration.md, frontend_ui/thread_sidebar/thread_sidebar_fetch_resilience.md, frontend_ui/message_feedback/message_feedback_flow.md, frontend_ui/live_testing/live_testing_without_the_workos_wall.md, frontend_ui/chat_page_review_fixes/live_ui_testing_without_workos_auth_wall.md]
keywords: []
createdAt: '2026-06-20T01:01:34.897Z'
updatedAt: '2026-06-20T01:01:34.897Z'
---
## Reason
Document the editorial design system for packages/web chat app

## Raw Concept
**Task:**
Document the frontend UI design system and typography/theme implementation for packages/web.

**Changes:**
- Introduced a Document of Record editorial design language
- Defined light and dark theme token palettes in OKLCH
- Added a fixed paper-grain SVG-noise overlay
- Configured font feature settings for reading serif and mono apparatus usage
- Preserved all data-testid attributes while restyling classNames and strings

**Files:**
- packages/web/src/app/globals.css
- packages/web/src/app/fonts.ts

**Flow:**
next/font self-hosting -> CSS variables -> theme tokens -> page chrome and content styling

**Timestamp:** 2026-06-20T01:01:15.611Z

## Narrative
### Structure
globals.css defines theme tokens, typography utilities, selection/scrollbar behavior, grain overlay, reduced-motion handling, and print rules. fonts.ts defines the three self-hosted font exports and composes their CSS variable class names.

### Dependencies
Depends on next/font/google for self-hosted font generation and Tailwind theme variables for app-wide styling. The print layer assumes the chat UI uses ScrollArea slots and assistant message/citation selectors.

### Highlights
The visual language is intentionally archival and document-like: warm parchment paper in light mode, lamplit dark mode, gold accents, and a tactile grain overlay. Print output removes chrome and expands scroll areas so the chat can paginate cleanly.

### Rules
Preserve every data-testid attribute when restyling the UI. The paper-grain overlay must remain below portaled overlays and sidebar/backdrop layers. font-feature-settings on .font-mono replaces, not merges with, the body font feature settings.

### Examples
Examples include gold-tinted text selection, slim warm scrollbars, a left-border active-thread ribbon in the sidebar, a gold letterhead rule for the masthead, and print-time URL expansion after external links.

## Facts
- **design_language**: packages/web uses a "Document of Record" editorial design language. [project]
- **font_stack**: Font stack uses Fraunces for display, Newsreader for reading/body, and IBM Plex Mono for apparatus metadata. [project]
- **font_delivery**: Fonts are self-hosted via next/font and wired through CSS variables in layout.tsx. [project]
- **theme_names**: Light theme is named "parchment" and dark theme is named "library at night". [project]
- **grain_overlay_z_index**: The paper-grain overlay is placed at z-index: 10 to stay below portaled overlays and sidebar/backdrop layers. [project]
- **test_safety_constraint**: The web vitest suite remained green after restyling because data-testid attributes were preserved. [project]
