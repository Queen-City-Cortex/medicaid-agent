# NC Medicaid Navigator — Status Update
**March 29, 2026 | Queen City Cortex LLC**

---

## Summary

The NC Medicaid Navigator agent is live. In three days we went from an empty directory to a working Graph-RAG system that answers Medicaid policy questions by querying a 50,000-section knowledge graph spanning state policy, federal regulations, and federal statute. The agent correctly answers complex questions — including the HCWD earned income question that originally exposed a corpus gap and drove us to expand our document sources from 4 to 8.

## What's Working

### The Agent (Layer 3 — NEW)

A Claude-powered agent built on Mastra that answers NC Medicaid policy questions using 8 specialized tools:

| Tool | What it does |
|---|---|
| `searchSections` | Vector similarity search across the knowledge graph with document-type filtering |
| `getSection` | Read section content (auto-expands empty container headings to show children) |
| `getDocument` | Document metadata + navigable section listing (content sections only) |
| `getSectionContext` | Hierarchy navigation — ancestors, siblings, children |
| `followReferences` | Cross-reference traversal (state→federal, section→section) |
| `getAmendments` | Amendment chain traversal (find superseding change notices) |
| `findConceptSections` | Find sections linked to a policy concept (EPSDT, Prior Auth, etc.) |
| `lookupPolicy` | Direct lookup by policy number |

**Tested questions:**
- "Does NC Medicaid cover chiropractic services?" → Correctly finds Policy 1F, identifies coverage criteria, limitations, visit limits, and EPSDT exception. Checks for amendments.
- "Is there a maximum earned income limit for HCWD?" → Correctly identifies: no separate earned income cap, 200% FPL total countable income limit, 150% FPL unearned income cap, premium tiers by income band, specific dollar amounts ($1,437/month). Cites DHHS eligibility manual sections.

The agent uses document-type routing (eligibility questions → DHHS policies, coverage → clinical policies), checks for amendments before answering, and provides section-level citations.

### The Knowledge Graph (Layer 0)

| Metric | Count |
|---|---|
| Documents | 1,997 |
| Sections | 49,557 |
| Chunks (oversized sections) | 2,345 |
| Policy Concepts | 33 |
| Vector embeddings | 22,157 |
| Cross-reference edges | 4,687 |
| Amendment edges (AMENDS) | 426 |
| Concept-section edges | 9,959 |
| Hierarchy edges | 52,779 (PARENT_OF + NEXT_SIBLING) |

**Eight document sources:**

| Source | Documents | Type |
|---|---|---|
| DHHS Policies Repository | 1,210 | Eligibility manuals, admin letters, forms |
| State Plan Amendments | 329 | Formal plan modifications |
| Medicaid Bulletins | 200 | Policy changes and clarifications |
| Clinical Coverage Policies | 177 | Service coverage rules |
| eCFR Federal Regulations | 42 parts (3,272 sections) | 42 CFR + 45 CFR |
| Social Security Act | 2 titles (63 sections) | Title XIX Medicaid + Title XXI CHIP |
| NCTracks Provider Manuals | 26 | Billing and claims guides |
| Waiver Documents | 11 | CAP/DA, Innovations, 1915(i) |

**Three-tier legal authority chain complete:** Social Security Act → Code of Federal Regulations → NC State Policy. Cross-references between tiers resolve automatically — when a clinical policy cites "42 CFR 440.70" or "Section 1902", those link to actual graph nodes.

### The Document Crawler (Layer 0 Prerequisite)

TypeScript/Node.js crawler with 7 source modules. Rate-limited (2s/request), respects robots.txt, conditional HTTP requests for change detection, SQLite registry, hash-based caching.

### The Evaluation Harness (Layer 1)

- **25 golden dataset entries** spanning 7 difficulty levels and reasoning types
- **Level 1 (Retrieval):** Precision@k, Recall@k, MRR, Primary Hit Rate
- **Level 2 (Cross-Reference):** Resolution accuracy
- **Regression detection** between eval runs (5% threshold)
- Levels 3-4 (Answer Quality, Citation Accuracy) stubbed for when we have the agent running in production

### Infrastructure

- **Turborepo monorepo:** `packages/crawler` (TypeScript), `packages/pipeline` (Python), `packages/agent` (TypeScript/Mastra)
- **Neo4j Community Edition** via Docker
- **Voyage AI** (voyage-law-2) for embeddings, called via direct httpx API (voyageai SDK incompatible with Python 3.14)
- **Operations runbook** at `RUNBOOK.md`
- **81 git commits**, **236+ tests** (150 crawler + 86 pipeline)

## Key Technical Decisions

1. **Mastra for the agent framework.** TypeScript-based, uses Vercel AI SDK under the hood. Tools defined with Zod schemas. The agent queries Neo4j directly via the JS driver — no Python dependency at query time.

2. **Tools auto-expand empty container headings.** DHHS eligibility documents are flat (memos/letters). Docling creates container headings with no body text. Rather than rebuild the graph, the `getSection` tool detects empty sections and returns children's content automatically.

3. **Document-type routing in the system prompt.** The agent knows that eligibility questions should search `dhhs_policy` first, coverage questions should search `clinical_policy`, and federal questions should search `federal_regulation`. This dramatically reduces noise.

4. **Amendment awareness as a first-class behavior.** The agent checks for AMENDS edges on any document it cites. Change notices that remove or modify provisions are surfaced explicitly.

## Bug Fixes Since Last Update

10. Neo4j integer type error — `topK` passed as float from LLM, now coerced with `Math.round()` + `neo4j.int()`
11. Empty container headings blocking the agent — auto-expand in `getSection`, filter from `getDocument`

## Cross-Reference Resolution

| Reference Type | Extracted | Resolved | Rate |
|---|---|---|---|
| Internal sections | ~4,400 | ~3,600 | 81% |
| Attachments | ~1,900 | ~1,750 | 91% |
| Federal regulations (CFR) | ~3,100 | ~2,530 | 82% |
| Social Security Act | ~670 | ~530 | 79% |
| Cross-document policies | ~210 | ~105 | 50% |
| **Total** | **~12,100** | **~9,450** | **78%** |

## What's Next

1. **Expand golden dataset to 50 entries.** Priority: temporal and negative-answer questions. Jeff to author from real beneficiary questions.

2. **Run Level 3 eval.** Now that the agent exists, we can measure answer quality against the golden dataset using LLM-as-judge.

3. **Layer 4 (UI).** The agent is a CLI tool today. Next step is a web interface for beneficiaries and legal aid attorneys.

4. **Production hardening.** The agent uses Claude Sonnet for development. Production may want Opus for complex multi-hop questions. Need to benchmark cost vs. quality tradeoffs.

## Numbers

- 81 git commits
- 236+ tests (150 crawler + 86 pipeline)
- ~2,100 documents crawled from 8 sources
- ~50,000 sections in the knowledge graph
- ~22,000 vector embeddings
- ~9,500 resolved cross-references
- 8 agent tools
- 25 golden dataset entries
- 3 days from empty directory to working agent
