---
title: Amendment Pipeline and Prompt Guardrails
tags: []
related: [agent_architecture/nc_medicaid_agent/nc_medicaid_navigator_agent.md, agent_architecture/nc_medicaid_agent/observational_memory_and_policy_guidance.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-02T18:58:50.406Z'
updatedAt: '2026-04-02T18:58:50.406Z'
---
## Raw Concept
**Task:**
Document how Medicaid amendment graphs are built and how the NC Medicaid agent reuses those graphs plus prompt guardrails for accurate policy QA.

**Changes:**
- Adopt a two-tier amendment detection that prefers signal sections, falls back to full section text, and stores change_description on AMENDS edges.
- Limit getAmendments traversals to depth-1 because only two multi-hop artifact chains exist while still ordering candidates by effective date and distance and surfacing the longest sections for changeSummary.
- Correct routing so HCWD questions map to dhhs_policy MA-2180, and teach the agent to avoid hedging when encountering Long Term Care Partnership amendments.

**Files:**
- packages/pipeline/src/pipeline/references/amendments.py
- packages/agent/src/tools/navigate.ts
- packages/agent/src/index.ts

**Flow:**
detect_amendments → build MA-series lookup and regex stats → AMENDS edge creation with change_description → navigate.getAmendments orders reachable docs by date/distance, picks the authoritative doc, and surfaces long sections → system prompt enforces tool routing, citation rules, and final answer formatting.

**Timestamp:** 2026-04-02

## Narrative
### Structure
The amendments pipeline scans change notices and SPAs with regexes, normalizes MA/SPAs, batches graph writes, and exposes stats; followReferences and getAmendments use documentMetadataReturn/mapDocumentMetadataRecord helpers to traverse AMENDS edges, gather authoritative change summaries, and signal the most recent amendment or current document. The agent index wires in Anthropic/OpenAI clients, composite storage (LibSQLStore default + DuckDB observability), observational and working memory templates, the tool list, HallucinationVerifier, Mastra server settings, and CLI runner behavior to deliver NC Medicaid answers.

### Dependencies
Graph writes rely on GRAPH_BATCH_SIZE for batching, regexes such as _CHANGE_NOTICE_RE/_MA_SERIES_RE/_REVISED_SPA_RE for scanning headings, and Navigator helpers for metadata. Agent behavior requires LibSQLStore, DuckDB observability store, observational/working memory templates for user profiles, and the HallucinationVerifier/ tool list to honor system prompt rules.

### Highlights
Change notices follow structured sections (CONTENT OF CHANGE, POLICY UPDATE, MAINTENANCE OF MANUAL) and the pipeline returns counts/stats while storing edges for documents with matching policy_number. The system prompt demands always calling getAmendments, preferring authoritative documents, reading change notices, citing explicitly, comparing similar policy numbers, providing plain-language answers, and warning about verification after retries.

### Rules
SYSTEM_PROMPT lists tools, routes questions by document type, enforces calling getAmendments, favors authoritative documents, reads change notices, and notes when limits are removed while citing via lookupPolicy/search and always running getSection for precise sections. When policy numbers share prefixes, compare policies explicitly, reply in plain language, and state inability only after retrying; narration follows each tool batch and the final answer must be markdown with verification warnings, verbatim facts, and policy difference mentions. HallucinationVerifier runs during tool execution, MAX_STEPS = 99, and onIterationComplete forces a near-limit final answer with explicit feedback while the CLI runner handles question input plus final-phase warnings.

### Examples
The NC Medicaid CLI runner accepts a question argument, executes tool batches with narration, and emits a markdown response after getAmendments-based change summaries. Anti-hallucination safeguards mean answers always reference policies, mention any policy differences (such as HCWD vs MA-2180), and flag statements that need further verification.

## Facts
- **amends_edge_match_type**: 98.5% of AMENDS edges are body-only matches, which contributes to noisy amendment signals. [project]
- **amendment_signal_extraction**: The proposed amendment detection change prefers signal sections before falling back to the full text and stores change_description on AMENDS edges to reduce noise. [project]
- **get_amendments_selection**: getAmendments orders newer documents reachable via AMENDS*1.. by effective date/distance, collects sections over 100 characters for changeSummary, and selects the most recent amendment or current doc as authoritative. [project]
- **system_prompt_rules**: The system prompt mandates citation-heavy responses, plain-language summaries, and explicit warnings when verification is needed. [project]
