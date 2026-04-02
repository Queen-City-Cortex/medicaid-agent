---
children_hash: b376f0a953125138412dcd69182bd94c6a73b69debc5f5e9440b7d998022cdbf
compression_ratio: 0.33897058823529413
condensation_order: 1
covers: [amendment_pipeline_and_prompt_guardrails.md, context.md]
covers_token_total: 1360
summary_level: d1
token_count: 461
type: summary
---
### Amendment Pipeline and Prompt Guardrails (amendment_pipeline_and_prompt_guardrails.md, context.md)
- **Purpose & Scope**: Documents how Medicaid amendment graphs are built, how the NC Medicaid agent leverages them, and how the system prompt enforces tool routing/guardrails for policy QA (see `context.md` overview/key concepts).
- **Pipeline Flow**: Amendment detection now prefers signal sections with depth-1 `getAmendments` traversals; change summaries include long sections and change_description metadata; `navigate.getAmendments` orders reachable docs by effective date/distance before choosing the authoritative policy and surfaces citation-ready sections (facts: `amendment_signal_extraction`, `get_amendments_selection`).
- **Prompt & Agent Guardrails**: System prompt lists tools, mandates calling `getAmendments`, prefers authoritative docs, enforces citation/verification behavior (fact: `system_prompt_rules`); it routes HCWD questions specifically to dhhs_policy MA-2180, cautions on Long Term Care Partnership amendments, and ensures plain-language answers with policy-difference callouts and verification warnings.
- **Infrastructure & Dependencies**: Pipeline writes using regexes (`_CHANGE_NOTICE_RE`, `_MA_SERIES_RE`, `_REVISED_SPA_RE`), batches with `GRAPH_BATCH_SIZE`, and relies on Navigator/metadata helpers; agent setup wires Anthropic/OpenAI clients, LibSQLStore/DuckDB storage, memory templates, tool list, HallucinationVerifier, Mastra settings, and CLI runner behavior (from narrative structure/dependencies).
- **Operational Highlights**: Change notices follow defined sections, stats are emitted, noisy body-only AMENDS edges (~98.5% per fact) are mitigated by signal-first detection, and the CLI runner narrates tool batches culminating in markdown responses citing policy differences and verification status.