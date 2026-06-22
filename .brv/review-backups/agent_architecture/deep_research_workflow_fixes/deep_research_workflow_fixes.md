---
title: Deep Research Workflow Fixes
summary: 'PR #17 merged as c61709f fixed OpenAI o1 routing, immediate cancelled state on decline, and human-readable corpus source labels in deep research verification.'
tags: []
related: [agent_architecture/context/context.md, frontend_ui/chat_page_transport/authenticated_chat_transport_reinitialization.md, agent_architecture/nc_medicaid_agent/startup_and_web_ui_hardening.md]
keywords: []
createdAt: '2026-06-21T05:39:51.447Z'
updatedAt: '2026-06-21T05:39:51.447Z'
---
## Reason
Document merged PR #17 review fixes for deep research behavior and source labeling

## Raw Concept
**Task:**
Document the Deep Research feature review fixes that were applied after greptile PR review.

**Changes:**
- Added o1 model-prefix routing to OpenAI in createModel
- Changed decline() to mark cancelled immediately
- Introduced sourceLabel(SourceEntry) for readable corpus source labels

**Files:**
- packages/agent/src/model.ts
- packages/web/src/lib/use-deep-research.ts
- packages/agent/src/deep-research/workflow.ts

**Flow:**
review -> code update -> merged to main -> verification of model routing, cancel UX, and source label formatting

**Timestamp:** 2026-06-21T05:39:24.565Z

**Author:** greptile PR review

## Narrative
### Structure
The review touches three separate code paths: agent model selection, browser deep-research state transitions, and workflow verification output.

### Dependencies
Model routing depends on matching provider prefixes correctly; cancel handling depends on workflow bailout behavior; source labeling depends on parsing serialized evidence text.

### Highlights
The key user-visible improvements are that o1 models now route to OpenAI, Cancel no longer flashes the researching phase, and corpus sources appear with policy/section-style labels instead of raw IDs.

### Rules
OpenAI reasoning models use the o1/o3/o4 prefixes; everything non-OpenAI (claude-*) routes to Anthropic. The decline round-trip just bails the workflow to a cancelled report, so show the cancelled state immediately rather than flashing "Researching…". The project forbids exposing raw internal IDs (sec:doc:…) in the UI.

### Examples
Example label formatting: Policy 5B § 2.3 — Therapeutic Leave.

## Facts
- **deep_research_pr**: PR #17 was merged to main as c61709f. [project]
- **model_factory_sharing**: createModel in packages/agent/src/model.ts is shared by both the chat agent and deep-research agents. [project]
- **openai_model_routing_bug**: OpenAI model routing originally matched gpt-, o3, and o4 prefixes only, which caused o1 models such as o1-mini and o1-preview to route to Anthropic and fail with auth/model-not-found. [project]
- **openai_model_routing_fix**: The fix added an o1 prefix to the OpenAI branch in createModel. [project]
- **decline_status_fix**: packages/web/src/lib/use-deep-research.ts decline() now sets status to cancelled immediately instead of researching before awaiting the cancel round-trip. [project]
- **cancel_ui_flash_fix**: The decline behavior avoids flashing the wrong phase, including spinner and sub-question list, on Cancel. [project]
- **raw_id_violation**: deep-research/workflow.ts verifyStep previously emitted corpusSources.label as the raw section key, violating the no-raw-IDs rule. [project]
- **source_label_helper**: The new sourceLabel(SourceEntry) helper parses serialized evidence text with Title, Section, and Policy lines into readable labels such as Policy 5B § 2.3 — Therapeutic Leave. [project]
- **source_label_fallback**: sourceLabel(SourceEntry) falls back to the source key only when no usable metadata is present. [project]
