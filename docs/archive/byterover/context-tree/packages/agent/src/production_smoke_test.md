---
title: Production Smoke Test
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-10T21:31:45.653Z'
updatedAt: '2026-07-10T21:31:45.653Z'
---
## Raw Concept
**Task:**
Document the production smoke test in e2e/scripts/smoke-production.mjs

**Changes:**
- Added env-file loading precedence so local overrides win over committed defaults
- Added auth handling for the production smoke run using WorkOS login
- Expanded the final validation to require a sufficiently long answer, visible sources, and at least one tool step
- Expanded the research trail before counting tool steps so collapsed cards are included

**Files:**
- e2e/scripts/smoke-production.mjs

**Flow:**
load env files -> open authenticated chat -> start fresh thread -> ask question -> wait for final answer -> expand research trail -> count tool steps -> save screenshot

**Timestamp:** 2026-07-10

## Narrative
### Structure
The script is a Playwright-based CLI that authenticates into /chat, asks a question, verifies response quality, and captures a screenshot. Helper functions cover auth submission, thread reset, answer validation, env parsing, and screenshot saving.

### Dependencies
Depends on Playwright Chromium, repository and web env files, WorkOS auth, test user credentials, and chat DOM test ids such as chat-input, send-button, assistant-message, sources-panel, and research-trail-trigger.

### Highlights
The smoke test now reflects the collapsed research trail UI and production expectations after the post-quota-topup fix. The observed healthy run had 5 tool steps, 6 cited sources, and high verifier quality.

### Rules
Production smoke requires TEST_USER_EMAIL and TEST_USER_PASSWORD.

loadEnvFile never overwrites already-set keys, so earlier files win:
list .env.local before .env so local overrides take precedence.

P2 UX: once a run completes, tool steps collapse into the "Research trail" Collapsible and the step cards are UNMOUNTED until expanded — expand it first or the count below reads 0 on every healthy answer.

The script loads .env.local before .env and does the same for packages/web/.env.local before packages/web/.env.

If the assistant rendered an error state, ended without an answer, or returned too-short content, the smoke must fail.

The script must save a screenshot on success and a .failed screenshot on errors.

### Examples
The script prints Production smoke passed at {baseUrl}/chat and reports Question, Answer characters, Tool steps, Sources, and Screenshot.

## Facts
- **env_load_order**: The production smoke script loads .env.local before .env and does the same for packages/web so earlier files win. [convention]
- **smoke_auth_requirements**: Production smoke requires TEST_USER_EMAIL and TEST_USER_PASSWORD. [project]
- **smoke_base_url**: The smoke script defaults to https://medicaid-agent.up.railway.app as the base URL. [project]
- **research_trail_ui_behavior**: The smoke script clicks research-trail-trigger before counting tool-step elements because the collapsible unmounts cards. [project]
- **smoke_answer_requirements**: The smoke script expects at least one visible tool step and a final answer of at least 200 characters by default. [project]
- **smoke_screenshot_path**: The script saves a screenshot to /tmp/nc-medicaid-prod-smoke.png by default and writes a .failed screenshot on errors. [project]
- **smoke_validation_flow**: The script waits for the assistant answer and source panel, checks for ended-without-answer, and rejects error-like final answers. [project]
