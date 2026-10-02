---
title: WS1 Customer-Readiness Legal Surface and Chat Guardrails
summary: WS1 customer-readiness adds a public landing page, legal pages, disclaimer notice persistence, and chat verification guardrails.
tags: []
related: [agent_architecture/local_dev_setup/documentation_pass_convention.md, agent_architecture/nc_medicaid_agent/startup_and_web_ui_hardening.md]
keywords: []
createdAt: '2026-07-10T18:08:06.315Z'
updatedAt: '2026-07-10T18:08:06.315Z'
---
## Reason
Document WS1 customer-readiness changes spanning public legal pages, auth allowlists, and chat safety UI

## Raw Concept
**Task:**
Curate WS1 customer-readiness changes for the web app legal surface and chat guardrails.

**Changes:**
- Added a public landing page at / using a server component with withAuth for CTA state.
- Added /terms and /privacy pages via shared LegalShell.
- Added a persistent DisclaimerNotice above ChatInput with localStorage-based acknowledgment.
- Tightened DeepResearchReport verification and link rendering guardrails.
- Changed MessageList panel defaults to open when sources exist.
- Exposed /, /terms, /privacy, /auth/callback, and /preview as unauthenticated paths in proxy.ts.

**Files:**
- packages/web/src/proxy.ts
- packages/web/src/lib/legal.ts
- packages/web/src/components/DisclaimerNotice.tsx
- packages/web/src/components/DeepResearchReport.tsx
- packages/web/src/components/MessageList.tsx

**Flow:**
public route request -> authkit proxy allowlist -> landing/legal pages render -> disclaimer or report guardrails display -> chat/sources UI reacts

**Timestamp:** 2026-07-10T18:07:37.342Z

**Author:** ByteRover context engineer

**Patterns:**
- `^NEXT_PUBLIC_DEBUG_CHAT=1$` - Enables chat debug logging
- `^disclaimer-acknowledged-v1$` - LocalStorage key for disclaimer acknowledgment
- `^https?:\/\/` (flags: i) - Allowed markdown link targets in DeepResearchReport

## Narrative
### Structure
The WS1 work spans proxy allowlisting, legal constants, a dismissable disclaimer component, and chat/report display safeguards. Legal page status is centralized in lib/legal.ts, while MessageList and DeepResearchReport enforce safer default presentation rules.

### Dependencies
Depends on AuthKit path-to-regexp matching, browser localStorage availability for disclaimer acknowledgment, and Vitest jsdom tests that require Object.defineProperty stubbing for localStorage.

### Highlights
This branch adds a customer-ready public surface without opening all routes, makes legal status explicit, and reduces misleading verification or link behavior in chat/report UI.

### Rules
The EmptyState's "not legal advice" text disappears after the first message, so first-time users get one persistent, dismissable notice above the composer. Acknowledgment is a per-browser localStorage flag (same persistence pattern as use-sidebar-state) — no server state, and it never comes back once dismissed. "0/0 verified" is not a clean bill of health — with nothing checked, a green badge would overstate the guarantee. Show a neutral note instead. The report markdown is model-generated: only render real http(s) links as anchors; anything else (javascript:, data:, relative fabrications) degrades to plain text.

### Examples
The disclaimer button stores disclaimer-acknowledged-v1 in localStorage. The deep research report shows “No citations to verify in this report” when checkedCitations is 0. The sources panel opens by default whenever sources.length > 0.

## Facts
- **public_surface_routes**: The public marketing/legal surface includes /, /terms, and /privacy. [project]
- **legal_review_flag**: LEGAL_REVIEW_PENDING drives a DRAFT banner on legal pages. [project]
- **legal_last_updated**: LEGAL_LAST_UPDATED is July 10, 2026. [project]
- **legal_contact_email**: LEGAL_CONTACT_EMAIL is legal@queencitycortex.com. [project]
- **disclaimer_storage_key**: Disclaimer acknowledgement is stored in localStorage under disclaimer-acknowledged-v1. [project]
- **verification_empty_state**: DeepResearchReport shows a neutral message when checkedCitations is 0. [project]
- **markdown_link_policy**: Non-http(s) markdown links are degraded to plain text in DeepResearchReport. [project]
- **sources_panel_default**: MessageList defaults panelOpen to sources.length > 0 instead of citedCount > 0. [project]
- **chat_debug_flag**: Chat debug logs are gated by NEXT_PUBLIC_DEBUG_CHAT=1. [project]
- **nextjs_proxy_entrypoint**: Next.js 16 uses proxy.ts with a named proxy export for middleware. [project]
- **authkit_unauthenticated_paths**: AuthKit unauthenticated paths include /, /terms, /privacy, /auth/callback, and /preview. [project]
