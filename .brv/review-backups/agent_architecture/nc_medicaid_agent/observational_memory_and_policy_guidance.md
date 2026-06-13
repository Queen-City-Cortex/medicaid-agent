---
title: Observational Memory and Policy Guidance
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-02T01:46:00.326Z'
updatedAt: '2026-04-02T01:46:00.326Z'
---
## Raw Concept
**Task:**
Document the NC Medicaid Navigator agent memory setup and policy-answering instructions tied to packages/agent/src/index.ts

**Changes:**
- Enabled Mastra Observational Memory for the agent
- Structured the system prompt with policy tool routing, citation, amendment, and anti-hallucination guardrails
- Configured server, storage, and memory dependencies to support the agent and background observers

**Files:**
- packages/agent/src/index.ts

**Flow:**
Incoming user question -> searchSections (with document-type routing) -> pick section with getSection -> consult amendments and context -> answer while citing section IDs and amendments -> log observations via Observational Memory -> respond within markdown format

**Timestamp:** 2026-04-02T00:00:00Z

## Narrative
### Structure
The entrypoint wires Mastra components: LibSQL storage, Mastra Memory with observationalMemory.model=openai/gpt-5.4-mini, the ncMedicaidAgent definition, and the Mastra server (host 0.0.0.0, port default 4111 with env-driven CORS origins) plus the CLI runner.

### Dependencies
Relies on @mastra/core for Mastra classes, @mastra/memory >=1.1.0 with supported adapters (libsql, pg, mongodb), AI SDK clients for OpenAI/Anthropic, and processor/hallucination verifier utilities tied to neo4j driver cleanup.

### Highlights
Observational Memory compresses lengthy tool-call conversations, preventing context rot while the background Observer/Reflector agents run on openai/gpt-5.4-mini. The system prompt enumerates eight tools, document-type routing, amendment awareness, and a requirement to call lookupPolicy when users mention policy numbers.

### Rules
Always cite the specific section ID (e.g., "Section doc-123:sec-4.1") and policy number, note the effective date, and mention any amendments. If a change notice supersedes content, cite both the original and amendment. If a question mentions a policy number, call lookupPolicy first before performing searchSections. Start every new topic by calling searchSections, then use getSection to read the full section before answering. Use getAmendments for every cited document and prefer the authoritativeDocument field when it differs. Document-type routing: Eligibility/enrollment -> documentTypes ["dhhs_policy"]; Coverage/medical necessity -> ["clinical_policy"]; Federal requirements -> ["federal_regulation"]; Recent rule changes -> ["change_notice"]; Broad questions -> search without filters then refine. After three unsuccessful searches, explain what was found and what could not be determined.

## Facts
- **observational_memory_benefit**: Observational Memory compresses long tool-call-heavy conversations into dense observation logs to prevent context rot. [project]
- **observational_memory_model**: The memory uses openai/gpt-5.4-mini for the Observer/Reflector background agents. [project]
- **observational_memory_requirements**: Mastra Observational Memory requires @mastra/memory >= 1.1.0 and a supported storage adapter (libsql, pg, mongodb). [project]
- **agent_tools**: The NC Medicaid Navigator exposes eight tools: searchSections, getSection, getDocument, getSectionContext, followReferences, getAmendments, findConceptSections, and lookupPolicy. [project]
- **agent_server_config**: The server is configured with host 0.0.0.0, default port 4111, and CORS origins driven by the CORS_ORIGINS environment variable. [project]
