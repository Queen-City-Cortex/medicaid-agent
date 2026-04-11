---
title: Document Metadata and Agent Prompt Guidance
tags: []
related: [agent_architecture/nc_medicaid_agent/context.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-04T20:32:20.519Z'
updatedAt: '2026-04-04T20:32:20.519Z'
---
## Raw Concept
**Task:**
Capture the NC Medicaid Navigator agent metadata helpers, environment validation, and system prompt requirements for accurate policy citations.

**Changes:**
- Recorded that document metadata helpers expose source_url to support clickable citations across tools.
- Documented the startup, model selection, storage, memory, and server configuration described in src/index.ts.
- Codified the system prompt guidance covering available tools, policy taxonomy, amendment verification, and response rules.

**Files:**
- packages/agent/src/tools/document-metadata.ts
- packages/agent/src/index.ts

**Flow:**
Startup validation -> instantiate Anthropic/OpenAI providers -> configure LibSQL/DuckDB storage and memory options -> set the elaborate system prompt (tools, document types, amendment/citation rules) -> configure Mastra server routes, observability, and CLI runner.

**Timestamp:** 2026-04-04

**Author:** NC Medicaid Navigator maintainers

## Narrative
### Structure
The ncMedicaidAgent boots Mastra with a composite storage layer (LibSQL primary, DuckDB for observability) alongside SensitiveDataFilter-powered tracing and Pino logging. Memory includes observational memory powered by openai/gpt-5.4-mini and working memory templates scoped to each resource, while the system prompt outlines the tools (searchSections, getSection, lookupPolicy, etc.), document taxonomies, amendment practices, and citation requirements that guide every policy answer.

### Dependencies
Requires VOYAGE_API_KEY plus either OPENAI_API_KEY or ANTHROPIC_API_KEY, defaults DATABASE_URL to file:./mastra.db, and depends on Mastra core libraries (agent, processors, storage), LibSQL, DuckDB, observability exporters, MastraAuthWorkos for server auth, and MastraCompositeStore for storage domains.

### Highlights
Document metadata helper ensures the url column is always exposed so citations can hyperlink to the original policy. The elaborate system prompt enforces amendment checks via getAmendments, requires section IDs, policy numbers, and linked URLs for every citation, and spells out response formatting plus anti-hallucination requirements. The CLI runner provides npx tsx --env-file=.env src/index.ts "your question here" for ad-hoc queries with a 10-minute server timeout and health endpoint.

### Rules
IMPORTANT: After every batch of tool calls, emit a short text message (1-2 sentences) explaining what you found and what you're doing next. The user sees tool calls as icons — without your narration they have no idea what's happening. Never make more than 3 tool calls in a row without narrating.
When ready to answer, transition naturally to a well-formatted response using markdown.
Use headings, bullet lists, bold for key terms.
Cite specific policy sections (e.g., "Clinical Coverage Policy 1F, Section 3.2.1").
ALWAYS provide a substantive final answer — even if your research was incomplete, summarize what you found and what you could not find.

CRITICAL: Anti-hallucination rules
- ONLY state facts that appear verbatim in retrieved section content. If a specific detail (dollar amount, date, threshold, eligibility criterion) is not in the text you retrieved via getSection, say "I could not find this specific detail in the policy documents" — do NOT guess or infer from general knowledge.
- If you cannot find information in the database, say so clearly.
- Do not speculate beyond what the policy documents say.
- Distinguish between NC Medicaid Standard Plan and NC Medicaid Managed Care (NC HEALTH CHOICE / PHPs) where relevant.
- Note when a policy may have been recently updated and recommend the user verify with DHHS if the stakes are high.

### Examples
CLI usage: npx tsx --env-file=.env src/index.ts "your question here"

## Facts
- **document_nodes_url**: Document nodes already store source_url from the crawler. [project]
- **document_metadata_fields**: documentMetadataReturn returns id, title, document_type, policy_number, effective_date, source_url as url, and status for the alias. [project]
- **startup_env**: validateEnv throws if VOYAGE_API_KEY is missing or if neither OPENAI_API_KEY nor ANTHROPIC_API_KEY is provided. [environment]
- **amendment_checks**: System prompt insists on always calling getAmendments on every document cited. [project]
- **citation_requirements**: System prompt requires linking citations to source URLs and mentioning specific section IDs and policy numbers. [project]
