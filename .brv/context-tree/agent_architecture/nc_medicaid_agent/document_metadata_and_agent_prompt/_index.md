---
children_hash: 6be416abfaf8a6648965706fd5c0c926c9bc4b28f9d82d4133d3e065afeca01a
compression_ratio: 0.3724409448818898
condensation_order: 0
covers: [context.md, document_metadata_and_agent_prompt_guidance.md]
covers_token_total: 1270
summary_level: d0
token_count: 473
type: summary
---
### Structural Summary — Document Metadata & Agent Prompt Focus
- **Domain Linkage**: Subtopic `document_metadata_and_agent_prompt` extends `agent_architecture/nc_medicaid_agent` by detailing the metadata helpers, environment validation, and system prompt policies that keep the NC Medicaid Navigator agent compliant.
- **Core Flow**: Startup validation checks for VOYAGE_API_KEY plus either OpenAI or Anthropic keys, then instantiates providers, configures LibSQL primary storage with DuckDB for observability, applies SensitiveDataFilter tracing/Pino logging, initializes observational and contextual memories, sets the Mastra server/CLI runner (10-minute timeout, health endpoint), and enforces a detailed system prompt covering tools, taxonomies, amendment checks, and citation formatting.
- **Metadata Helpers**: `document-metadata.ts` exposes `source_url` via `document_nodes` and returns all metadata fields (id, title, document_type, policy_number, effective_date, url, status) so citations can hyperlink to original policies.
- **System Prompt Rules**: Requires every cited policy call `getAmendments`, mention section IDs and policy numbers, link to source URLs, and follow explicit response formatting to avoid hallucinations; the CLI uses `npx tsx --env-file=.env src/index.ts "your question here"`.
- **Dependencies & Environment**: Defaults to `DATABASE_URL=file:./mastra.db`, depends on Mastra agent/core/processors/storage, LibSQL/DuckDB, observability exporters, MastraAuthWorkos for server auth, MastraCompositeStore, and mandates the VOYAGE_API_KEY plus OpenAI/Anthropic credentials before booting.
- **Facts Highlighted**: Document nodes already capture `source_url`; metadata helper returns full policy fields; `validateEnv` enforces required keys; system prompt enforces `getAmendments` on every citation while linking to source URLs and noting sections/policy numbers.