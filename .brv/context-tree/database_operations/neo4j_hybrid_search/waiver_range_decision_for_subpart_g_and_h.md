---
title: Waiver Range Decision for Subpart G and H
tags: []
related: [database_operations/neo4j_hybrid_search/context.md, database_operations/neo4j_write_read_consistency/context.md, database_operations/neo4j_auth/context.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-08T01:52:59.075Z'
updatedAt: '2026-07-08T01:52:59.075Z'
---
## Raw Concept
**Task:**
Document the resolved waiver-range decision for CFR section predicates used in policy corpus retrieval.

**Changes:**
- Confirmed the waiver-range split is intentional rather than buggy.
- Recorded the distinction between Subpart G (1915(c)) and Subpart H (1915(d)).
- Captured the q-045 evidence-role behavior for primary versus supporting citations.

**Files:**
- packages/policy-corpus/src/internal/section-predicates.ts
- packages/policy-corpus/src/internal/term-lists.ts

**Flow:**
audit decision -> predicate rationale -> evidence anchoring -> rerank rebalance

**Timestamp:** 2026-07-07

**Author:** PR docs/waiver-subpart-h-decision commit f8d5724

## Narrative
### Structure
The policy corpus uses section predicates and term lists to classify waiver-related CFR sections. Subpart G covers 1915(c) waiver authority, while Subpart H covers the parallel 1915(d) age-65-or-older waiver application sections.

### Dependencies
q-045 depends on broad collection anchoring across both subparts, but only Subpart G plus 440.180 should be promoted to primary so the supporting 441.351 evidence does not displace the needed 1915(c) citation.

### Highlights
This decision closes the waiver-range ambiguity and supersedes any earlier note that treated it as an open issue or latent bug.

### Rules
Collection anchoring and rerank set should cast wide across Subpart G + H so Subpart H can surface as supporting evidence. Rebalance hints should promote only Subpart G + 440.180 to primary so 1915(d) sections never displace the 1915(c) citation NC questions need.

### Examples
q-045 expects 441.301 as PRIMARY and 441.351 only as SUPPORTING evidence.

## Facts
- **subpart_h_waiver_range_decision**: The Subpart H waiver-range question was resolved on 2026-07-07 in PR docs/waiver-subpart-h-decision at commit f8d5724. [project]
- **waiver_predicate_ranges**: All four waiver-predicate ranges were already correct and the phase split is intentional. [project]
- **prior_memory_status**: Earlier memory describing the issue as a latent bug or open question is superseded. [project]
- **subpart_g_441_300_310**: Subpart G 441.300-.310 implements 1915(c) HCBS Waiver Requirements. [project]
- **subpart_h_441_350_365**: Subpart H 441.350-.365 implements 1915(d) HCBS Waivers for Individuals Age 65 or Older. [project]
- **nc_subpart_h_usage**: NC does not operate the Subpart H waiver type. [project]
- **q_045_evidence_roles**: Golden question q-045 expects 441.301 as PRIMARY and 441.351 only as SUPPORTING evidence. [project]
- **waiver_collection_anchor**: Collection anchoring and rerank should cast wide across Subpart G and H so Subpart H can surface as supporting evidence. [project]
- **waiver_rebalance_hint**: Rebalance hints should promote only Subpart G and 440.180 to primary so 1915(d) sections do not displace the 1915(c) citation. [project]
