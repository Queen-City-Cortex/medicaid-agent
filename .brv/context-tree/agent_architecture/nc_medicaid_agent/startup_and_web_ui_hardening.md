---
title: Startup and Web UI Hardening
tags: []
related: [agent_architecture/nc_medicaid_agent/context.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-04T03:10:40.950Z'
updatedAt: '2026-04-04T03:10:40.950Z'
---
## Raw Concept
**Task:**
Document NC Medicaid Navigator startup validation, server endpoints, CLI runner, and chat UI constraints that uphold policy fidelity.

**Changes:**
- Enforced VOYAGE_API_KEY plus at least one of OPENAI_API_KEY or ANTHROPIC_API_KEY before agent creation.
- Outlined Mastra configuration (models, storage, memory, observability, logger, exporter, filters, timeouts) baked into packages/agent/src/index.ts.
- Described unauthenticated /healthz Neo4j probe and CLI runner invocation.
- Captured chat page components, message rendering, thread lifecycle, sidebar states, and textarea limits in packages/web/src/app/chat/page.tsx.

**Files:**
- packages/agent/src/index.ts
- packages/web/src/app/error.tsx
- packages/web/src/app/chat/page.tsx

**Flow:**
Startup -> validate env -> configure Mastra agent (models, memory, observability, exporter, sensitive filters) -> expose /chat + /healthz routes + CLI runner -> serve chat UI with thread lifecycle and message rendering.

**Timestamp:** 2026-04-04

## Narrative
### Structure
packages/agent/src/index.ts wires Mastra core + agent creation, including model provider selection (gpt-series to OpenAI, others to Anthropic), LibSQL storage, observational and working memory scopes, default exporters, observability tagging serviceName nc-medicaid-navigator, logger level info, 10-minute server timeout, and CORS origins pulled from envs or localhost. The CLI runner (npx tsx --env-file=.env src/index.ts "your question here") mirrors HTTP chat behavior with maxSteps, thread-specific memory, and driver cleanup. packages/web/src/app/error.tsx and chat/page.tsx compose the user-facing side with a global error boundary and a chat view centered on AGENT_ID nc-medicaid-navigator, MASRTA_URL from env or http://localhost:4111, sidebar/threads UI, auto-scrolling, research traces, and message actions.

### Dependencies
Depends on Mastra core, agent, Anthropic/OpenAI SDKs, Neo4j driver helpers, hallucination verifier, MastraAuthWorkos, Memory, LibSQL, Observability, SensitiveDataFilter, DefaultExporter, ReactMarkdown, chat hooks, DefaultChatTransport, UI atoms, storage for threads, and centralized theme toggles.

### Highlights
System prompt enforces tool-first policy research (searchSections -> getSection -> getAmendments, cite authoritativeDocument, highlight removed limits, prefer CCP when intersecting), anti-hallucination rules (only verbatim facts, mention missing info, distinguish plan types, note updates), response format (tool batches + markdown with headings/bullets/bold), and maxSteps limit with hallucinationVerifier forcing final answer.

### Rules
Always call lookupPolicy when a policy number is mentioned, start every query with searchSections, call getSection before answering, check getAmendments after retrieving sections, follow references via getSectionContext/followReferences, use getSection to confirm numeric thresholds, compare scope for similar policy numbers, cite policies omitted due to scope mismatch, prefer CCP coverage rules over DHHS manuals for service coverage, narrate tool batches before answering, admit uncertain info, try at least three searches, call out missing info, prefer plain-language answers, and obey anti-hallucination guardrails (verbatim facts, note updates, mention plan distinctions).

### Examples
CLI runner: `npx tsx --env-file=.env src/index.ts "your question here"`. Chat UI empty state shows example cards from EXAMPLES array, and MessageActions rerun reuses the last user prompt when running again.

## Facts
- **env_requirements**: Startup insists on VOYAGE_API_KEY plus at least one of OPENAI_API_KEY or ANTHROPIC_API_KEY before creating the agent. [project]
- **healthz_check**: /healthz runs a no-auth Neo4j RETURN 1 query and reports {status: ok/degraded, neo4j: connected/error} with HTTP 200/503. [project]
- **global_error_boundary**: Global error boundary renders "Something went wrong" with a Try again button that calls reset. [project]
- **chat_input_constraints**: Chat textarea caps input at 10,000 chars, auto-resizes up to 120px, disables while loading, and shows spinner on the send button. [project]
- **chat_transport**: Chat page uses AGENT_ID nc-medicaid-navigator, DefaultChatTransport targeting ${MASTRA_URL}/chat, and preserves thread/memory metadata per request. [project]
