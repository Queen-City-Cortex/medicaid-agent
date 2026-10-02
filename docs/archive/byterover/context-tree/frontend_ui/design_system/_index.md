---
children_hash: 87b5cd229a6fd7bcf1d5b28b250620b4262007f48f7623abca7c4b823d38f095
compression_ratio: 0.840958605664488
condensation_order: 1
covers: [document_of_record_design_language.md]
covers_token_total: 918
summary_level: d1
token_count: 772
type: summary
---
# frontend_ui / Design Language

## Overview
This entry defines the **Document of Record** editorial design language for `packages/web`, centered on a document-like chat UI with archival typography, warm/cool theme palettes, and print-aware presentation. The system is implemented through `globals.css` and `fonts.ts`, with styling driven by CSS variables, Tailwind theme tokens, and self-hosted fonts.

## Core Design Decisions
- **Typography stack:**  
  - `Fraunces` for display
  - `Newsreader` for body/reading text
  - `IBM Plex Mono` for apparatus, metadata, and monospace contexts
- **Theme model:**  
  - Light theme: **parchment**
  - Dark theme: **library at night**
  - Colors are defined in **OKLCH** token palettes
- **Visual texture:**  
  - A fixed **paper-grain SVG noise overlay** adds tactile, archival texture
  - Overlay sits at **z-index: 10** to remain below portaled overlays and sidebar/backdrop layers
- **Print behavior:**  
  - Print rules remove chrome and expand scroll areas for clean pagination
  - External links expand to print-safe URLs

## Implementation Structure
- **`packages/web/src/app/globals.css`**
  - Defines theme tokens, typography utilities, selection and scrollbar styling, grain overlay, reduced-motion handling, and print rules
- **`packages/web/src/app/fonts.ts`**
  - Defines the three self-hosted font exports
  - Composes CSS variable class names for app-wide font delivery

## Rendering / Styling Flow
`next/font` self-hosting → CSS variables → theme tokens → page chrome and content styling

## Key Constraints and Rules
- Preserve every `data-testid` attribute during UI restyling
- The grain overlay must stay beneath portaled overlays and sidebar/backdrop layers
- `.font-mono` uses its own `font-feature-settings` and **replaces**, rather than merges with, body font feature settings

## Notable UI Characteristics
- Warm parchment light mode and lamplit dark mode
- Gold accents and gold-tinted text selection
- Slim warm scrollbars
- Sidebar active-thread ribbon styling
- Gold letterhead rule for the masthead
- Print-safe citation and link handling

## Related Drill-Down Entries
- **`web_theme_persistence.md`** — theme persistence behavior
- **`quiet_citation_styling_in_messagelist.md`** — citation presentation in message lists
- **`ai_sdk_v6_sse_streaming_and_error_handling.md`** — streaming/error-handling context tied to UI rendering
- **`chat_page_thread_cache_restoration.md`** — chat thread restoration interactions with layout
- **`thread_sidebar_fetch_resilience.md`** — sidebar resilience and fetch behavior
- **`message_feedback_flow.md`** — feedback UI flow
- **`live_testing_without_the_workos_wall.md`** and **`live_ui_testing_without_workos_auth_wall.md`** — live UI testing constraints and workflow

## Facts to Preserve
- `packages/web` uses a **Document of Record** editorial design language
- Fonts are self-hosted via `next/font` and wired through CSS variables in `layout.tsx`
- The design system preserves testability; the Vitest suite stayed green because `data-testid` attributes were retained