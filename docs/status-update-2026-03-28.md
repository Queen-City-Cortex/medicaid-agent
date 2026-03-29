# NC Medicaid Navigator — Status Update
**March 28, 2026 | Queen City Cortex LLC**

---

## Summary

Layers 0 and 1 of the NC Medicaid Navigator are complete. We have a production-ready document pipeline that crawls NC Medicaid policy from seven government sources, parses PDFs into structured data, builds a knowledge graph with cross-references between state policy, federal regulations, and federal statute, and provides vector search with an evaluation harness for measuring quality. The system is ready for Layer 3 (the agent).

## What We Built

### Document Crawler (`packages/crawler/` — TypeScript)

A polite, incremental crawler that discovers and downloads NC Medicaid policy documents while respecting rate limits and robots.txt.

**7 source types crawled:**
- Clinical Coverage Policies (177 PDFs) — the core policy corpus
- Medicaid Bulletins (200 PDFs) — policy changes and clarifications
- State Plan Amendments (329 PDFs) — formal plan modifications
- Waiver Documents (11 PDFs) — CAP/DA, Innovations, 1915(i)
- NCTracks Provider Manuals (26 documents) — billing and claims guides
- DHHS Policies Repository (1,210 documents) — eligibility manuals, administrative letters, forms
- eCFR Federal Regulations and Social Security Act — ingested directly via API

**Key capabilities:**
- Hash-based change detection (conditional HTTP requests, never re-downloads unchanged documents)
- SQLite registry tracking every document ever seen
- 2-second rate limiting per domain, exponential backoff on errors
- 150 tests passing

### Document Pipeline (`packages/pipeline/` — Python)

Transforms raw PDFs into a navigable Neo4j knowledge graph with vector embeddings.

**The graph contains:**

| What | Count |
|---|---|
| Documents | 1,997 |
| Sections | 49,557 |
| Chunks (for oversized sections) | 2,345 |
| Policy Concepts | 33 |
| Vector embeddings | 22,157 (all content sections + chunks) |
| Cross-reference edges | 4,687 (section-to-section + section-to-document) |
| Amendment edges | 426 (change notices linked to target manuals) |
| Concept-section edges | 9,959 |
| Hierarchy edges | 9,433 PARENT_OF + 43,346 NEXT_SIBLING |

**Three-tier legal authority chain:**
- **Social Security Act** (63 sections from Title XIX Medicaid + Title XXI CHIP) — sourced from uscode.house.gov
- **Code of Federal Regulations** (3,272 sections across 42 parts of 42 CFR + 45 CFR) — sourced from eCFR API
- **NC State Policy** (clinical coverage policies, bulletins, SPAs, waivers, eligibility manuals)

When a state policy cites "Section 1902" or "42 CFR 440.70", those references resolve to actual nodes in the graph. The agent can traverse from a state coverage rule to the federal regulation that authorizes it to the statute that requires it.

**Pipeline stages:**
1. **Parse** — Docling converts PDFs to structured JSON with section hierarchy, tables, and metadata
2. **Load** — Creates Document/Section nodes in Neo4j with PARENT_OF/NEXT_SIBLING hierarchy
3. **Federal ingestion** — eCFR (API → XML → sections) and SSA (USC → HTML → sections)
4. **Cross-references** — Regex extraction resolves internal section refs, cross-document policy refs, CFR citations, SSA citations, and attachment references
5. **Amendments** — Detects "CHANGE NOTICE FOR MANUAL NO." patterns and creates AMENDS edges
6. **Embeddings** — Voyage AI (voyage-law-2) with contextualized heading chains and smart chunking for oversized sections
7. **Concepts** — 33 seeded PolicyConcepts (programs, services, processes, eligibility, entities) linked to sections

**89 tests passing.**

### Evaluation Harness (Layer 1)

Measures retrieval quality against a golden dataset of verified Medicaid policy Q&A pairs.

- **Level 1 (Retrieval):** Precision@k, Recall@k, MRR, Primary Hit Rate
- **Level 2 (Cross-Reference):** Resolution accuracy against known cross-reference paths
- **Levels 3-4 (Answer Quality, Citation Accuracy):** Stubbed for Layer 3 agent
- **Regression detection:** Compare any two eval runs, flag >5% drops
- **8 seed golden dataset entries** (target: 50, Jeff to expand)
- **Baseline retrieval:** 75% primary hit rate on seed entries

### Infrastructure

- **Turborepo monorepo** with npm workspaces (`packages/crawler` + `packages/pipeline`)
- **Neo4j Community Edition** via Docker (persistent volume)
- **Operations runbook** at `RUNBOOK.md` (daily/weekly/quarterly maintenance procedures)

## Bug Fixes Applied

Over the course of development, we found and fixed 9 bugs through code review and data quality audits:

1. Filename collision on document updates (archived old file before rename)
2. Pipeline fuzzy filename lookup producing wrong document matches (switched to exact match + URL hash)
3. Crawler download phase not scoped to selected source types
4. Container headings dropped from graph (fixed, then reloaded to recover 17K sections)
5. Eval scoring on section_number alone (false cross-document matches — now uses full section_id)
6. Concept linker short alias false matches ("AT" matching the preposition in all-caps text)
7. Concept linker misclassifying "Services Not Covered" as COVERS instead of RESTRICTS
8. AMENDS edges falsely linking SPAs to DHHS documents (tightened SPA number regex + type filter)
9. voyageai SDK crash on Python 3.14 (replaced with httpx direct API calls)

## Cross-Reference Resolution Progress

| Reference Type | Extracted | Resolved | Rate |
|---|---|---|---|
| Internal sections | ~4,400 | ~3,600 | 81% |
| Attachments | ~1,900 | ~1,750 | 91% |
| Federal regulations (CFR) | ~3,100 | ~2,530 | 82% |
| Social Security Act | ~670 | ~530 | 79% |
| Cross-document policies | ~210 | ~105 | 50% |
| **Total** | **~12,100** | **~9,450** | **78%** |

Remaining 2,691 unresolved references are mostly: internal section refs in DHHS documents with flat structure (826), waiver categorical references (879), CFR parts outside our scope (572), and a few edge cases.

## What's Next: Layer 3 (Agent)

Design requirements are documented in `packages/pipeline/docs/agent-requirements.md`:

- **Negative answer reasoning** — the agent must handle "this was removed" or "this is not covered"
- **Table lookup tool** — structured query against premium tables, billing codes, income limits
- **Document-type routing** — eligibility questions → DHHS policies, coverage → clinical policies
- **Amendment awareness** — cite current policy, not superseded versions
- **Multi-hop graph traversal** — follow cross-references from state policy → CFR → SSA

## Numbers

- 74 git commits
- 236 tests (150 crawler + 86 pipeline)
- ~2,100 documents crawled from 8 sources
- ~50,000 sections in the knowledge graph
- ~22,000 vector embeddings
- ~9,500 resolved cross-references
- $3-4 total Voyage AI embedding cost for the full corpus
