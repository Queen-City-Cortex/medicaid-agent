---
title: Mastra Upgrade Type and Runtime Boundaries
tags: []
related: [auth_integration/context.md, auth_integration/runtime-boundary-bugs-cluster-around-deployment-auth-and-database-initialization.md, agent_architecture/context/ws5_customer_readiness.md, agent_architecture/context/ws2_customer_readiness_reliability_fixes.md, agent_architecture/context/ws1_customer_readiness_legal_surface_and_chat_guardrails.md, agent_architecture/context/policy_corpus_embedding_client_and_verifier_flow.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-06-23T04:11:47.022Z'
updatedAt: '2026-06-23T04:11:47.022Z'
---
## Raw Concept
**Task:**
Document type and runtime fixes for the Mastra upgrade across tools, routes, and middleware.

**Changes:**
- Adjusted helper typing for Tool.execute returning void or output
- Switched route and middleware handlers to ContextWithMastra
- Added resource binding middleware after auth

**Files:**
- packages/agent/tests/helpers/run-tool.ts

**Flow:**
tool execution -> validation guard -> route handling with ContextWithMastra -> auth middleware sets user -> resource binding middleware copies user id to MASTRA_RESOURCE_ID_KEY

**Timestamp:** 2026-06-23

## Narrative
### Structure
This topic captures the common type boundary between Mastra core utilities, server route handlers, and middleware. It explains why vendored Hono types must not be mixed with the standalone Hono package.

### Dependencies
Depends on @mastra/core/server exports, Hono middleware sequencing, and authenticated request context storage.

### Highlights
The shared fix is to keep all route handlers on ContextWithMastra and to bind the authenticated user to the resource id before memory operations run.

### Examples
Example middleware flow: auth middleware stores user in requestContext, then bindResourceToAuthenticatedUser copies that user id into MASTRA_RESOURCE_ID_KEY.

## Facts
- **tool_execute_return_type**: Tool.execute is now typed as Promise<void | TOutput> after the @mastra/core upgrade. [project]
- **run_tool_execute_signature**: The runTool helper must accept | void in the execute signature so TypeScript infers the concrete TOutput. [project]
- **run_tool_guardrails**: runTool throws when execute is missing, when the tool returns undefined, or when validation fails. [project]
- **vendored_hono_type_conflict**: @mastra/core ships vendored Hono types under dist/_types/hono that conflict with the top-level hono package on the GET_MATCH_RESULT symbol. [project]
- **mastra_context_type**: registerApiRoute handlers and server.middleware should use @mastra/core/server ContextWithMastra instead of hono Context. [project]
- **resource_binding_key**: bindResourceToAuthenticatedUser writes MASTRA_RESOURCE_ID_KEY from the authenticated user into the request context. [project]
