---
title: Launch Blocker Fixes
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-04-04T03:09:40.157Z'
updatedAt: '2026-04-04T03:09:40.157Z'
---
## Raw Concept
**Task:**
Document the launch blocker fixes across proxy, concept handling, hallucination verification, and search testing

**Changes:**
- Renamed the Next.js 16 middleware export in proxy.ts and ensured authkitProxy receives NextFetchEvent and NextRequest inputs
- Whitelisted concept relationships (COVERS, DEFINES, RESTRICTS, GOVERNS, REFERENCES_CONCEPT) before executing Cypher via concepts.ts and enforced explicit null handling in section metadata
- Expanded hallucination-verifier evidence formatting to include metadata for getSection/getDocument/getAmendments/lookupPolicy/followReferences, built source text truncation, and failure sentinel handling with rewritten assistant text
- Extended search.test.ts to mock fulltext handlers, dedup/topK/snippet/embedding failure behaviors, concept filtering, and Voyage API error propagation while providing session handlers and embedding stubs

**Flow:**
proxy export rename -> relationship whitelist + concept sections -> verifier evidence formatting + sentinel -> search test mocks covering dedup, snippet truncation, and error handling

**Timestamp:** 2026-04-04

## Narrative
### Structure
Launch blocker remediation spans proxy middleware updates, concept relationship filtering, hallucination verification tooling, and targeted search testing to ensure release hygiene.

### Dependencies
Proxy.ts depends on Next.js 16 middleware conventions and authkitProxy handlers; concepts.ts relies on allowed relationship types before Cypher execution; the verifier relies on buildSourceText, various evidence helpers, and sentinel-driven rewrites; search.test.ts uses mocked session handlers, fetch embedding stubs, and Voyage API error simulation.

### Highlights
The fixes prevent middleware export mismatches, block unauthorized relationship types, enforce evidence formatting and failure semantics, and harden search tests for deduplication, snippet caps, embedding failures, and concept filtering to keep numbered sections.

## Facts
- **proxy_middleware**: proxy.ts renames the Next.js 16 middleware export to proxy and forwards NextFetchEvent and NextRequest into authkitProxy [project]
- **concept_relationships_whitelist**: concepts.ts now whitelists relationships COVERS, DEFINES, RESTRICTS, GOVERNS, REFERENCES_CONCEPT before executing Cypher and handles null metadata explicitly [project]
- **hallucination_verifier_failure**: hallucination-verifier evidence helpers buildSourceText with char limits, cited/uncited ordering, truncation notice, returns VERIFICATION_UNAVAILABLE when evidence fails, appends disclaimer, and rewrites assistant output [project]
- **search_test_hardening**: search.test.ts adds fulltext mock handlers that enforce dedup prioritization, topK caps, 500-char snippet truncation, chunk_embeddings failure handling, numbered concept filtering, and Voyage API error propagation [project]
