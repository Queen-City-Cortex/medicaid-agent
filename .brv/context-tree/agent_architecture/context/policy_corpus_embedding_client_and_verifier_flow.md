---
title: Policy Corpus Embedding Client and Verifier Flow
tags: []
related: [facts/project/context.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-09T02:45:13.932Z'
updatedAt: '2026-07-09T02:45:13.932Z'
---
## Raw Concept
**Task:**
Document the agent policy-corpus embedding client and answer verification pipeline

**Changes:**
- embedQueries posts query batches to Voyage using VOYAGE_API_URL and VOYAGE_MODEL
- Network and HTTP failures are logged with voyage.embed_request_failed and voyage.embed_http_error
- runVerificationForAnswer emits a single JSON telemetry line after a ---VERIFIER--- marker
- Deterministic URL and quote sanitization always runs on outgoing text

**Files:**
- packages/agent/src/policy-corpus.ts
- packages/agent/src/processors/verifier/run.ts

**Flow:**
query batch -> Voyage embedding -> search client -> verification -> rewrite decision -> sanitization -> telemetry emit

**Timestamp:** 2026-07-09

**Author:** unknown

## Narrative
### Structure
The agent creates a policy-corpus client from createNeo4jPolicyCorpus, provides embedQuery on top of embedQueries, and exposes policyCorpus as a singleton.

### Dependencies
Verification rewrite is required for unsupported, irrelevant, major relevance issue, or incomplete citations. If verification is unavailable, a disclaimer is appended and critical details should be checked against NC DHHS.

### Highlights
Telemetry uses stable snake_case fields such as supported, relevant, citations_complete, confidence, severity, and verifier_unavailable. Sanitization of fabricated URLs or quotes counts as a rewrite for downstream message replacement.

### Examples
If verification service is unavailable, the appended disclaimer directs users to verify critical details with NC DHHS.
