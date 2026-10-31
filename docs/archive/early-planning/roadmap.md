# NC Medicaid Navigator — Roadmap
**March 29, 2026 | Queen City Cortex LLC**

**Starting point:** Working Graph-RAG agent with 50K sections, 8 tools, 8 document sources, 25 golden dataset entries. CLI-only. No UI, no auth, no production deployment.

**End goal:** First paying customer within 60 days.

---

## Phase 1: Eval & Golden Dataset (1 week)
*Build the regression safety net before changing anything.*

### 1A — Expand Golden Dataset to 50 Entries
- Author 25 new question/answer pairs from real beneficiary questions
- Priority question types to add:
  - **Temporal:** "Was X covered before the 2024 amendment?" / "When did Y policy take effect?"
  - **Negative answers:** "Does Medicaid cover cosmetic surgery?" (answer: no, with specific exclusion citation)
  - **Waiver-specific:** "What home modifications are covered under CAP/DA?" / "What's the difference between CAP/DA and Innovations waiver coverage?"
  - **Multi-hop:** Questions that require following 2+ cross-references to reach the answer
  - **Ambiguous:** Questions where the answer depends on program, waiver, or population
- For each entry: correct answer, source document(s) + section(s), reasoning type, difficulty level

### 1B — Run Level 3 Eval (Answer Quality)
- Wire up LLM-as-judge scoring against the golden dataset
- Metrics: factual accuracy, citation accuracy, completeness, hallucination rate
- Establish baseline scores — these are the numbers you protect from regression
- Store results with timestamps for trend tracking

### 1C — Identify Failure Modes
- Which question types does the agent get wrong? Catalog them.
- Common failure patterns to look for:
  - Retrieval miss (right document never found)
  - Context miss (right document found, wrong section used)
  - Cross-reference miss (reference not followed when it should be)
  - Temporal miss (cited superseded document)
  - Hallucination (confident answer not supported by any source)
- These failures drive Phase 2 priorities

**Done when:** 50 golden dataset entries. Baseline Level 3 scores recorded. Failure modes cataloged with frequency counts.

---

## Phase 2: Thin UI (2 weeks)
*The minimum surface to get the agent into real hands.*

### 2A — Core Interface
- Single-page web app. One search box. Streaming response.
- Section-level citations rendered as clickable references (link to source document/section in the graph)
- Feedback widget: thumbs up / thumbs down + optional free-text comment per response
- "Sources consulted" panel showing which documents the agent read
- Loading state that communicates the agent is researching (not frozen)

### 2B — Auth (Minimal)
- Email/password or magic link. Nothing more.
- No roles, no permissions, no teams. Just "can this person log in?"
- Allowlist-based for the validation phase — you control who has access

### 2C — Feedback Pipeline
- Store every query, response, feedback signal, and the agent's tool call trace
- This is your product analytics AND your eval data source
- Every confirmed-correct answer is a candidate golden dataset entry
- Every confirmed-wrong answer is a debugging target

### 2D — Tech Stack & Deployment
- Evaluate: Next.js (fastest to ship, SSR, Vercel deployment) vs. whatever fits the Mastra ecosystem
- The agent is already TypeScript/Mastra — keep the UI in the same language
- Deploy to Vercel, Railway, or Fly.io — whichever gets you a URL fastest
- Neo4j: move from local Docker to hosted (Neo4j Aura free tier has 200K node limit — we're at ~53K now, but size early for growth from document updates)

**Done when:** A URL exists. Someone who isn't you can log in, ask a question, get a cited answer, and give feedback.

---

## Phase 3: Validation (3–4 weeks)
*Put it in front of the people who will tell you whether this is real.*

### 3A — Recruit 10 Validation Users
- 5 legal aid attorneys (Legal Aid of NC, Disability Rights NC, NC Justice Center)
- 5 benefits counselors / case managers (CAP/DA, ADRC, independent)
- Pitch: "Free access to an AI Medicaid policy research tool. I need your honest feedback."

### 3B — Structured Validation Sessions
- Watch them use it (screen share or in-person). Don't guide them.
- Record what questions they ask naturally — these are your real-world test cases
- Note where they trust the answer vs. where they double-check manually
- Note where the tool fails or gives incomplete answers
- Ask: "Would you pay for this? How much? What would it need to do first?"

### 3C — Iterate on Failures
- Every failed query goes into the golden dataset
- Fix retrieval/agent issues exposed by real usage
- Re-run Level 3 eval after each fix to verify improvement without regression
- Prioritize fixes by user impact, not technical elegance

### 3D — Close the First Customer
- Target: one legal aid org at $200–$500/month (legal aid runs on grants — price for adoption, not revenue)
- The validation sessions are your sales pipeline — you're solving a real problem for real people
- Offer a 3-month pilot at reduced rate if needed to close
- A signed contract changes everything: it validates the market, funds continued development, and becomes your first case study
- Reprice for MCOs in Phase 5 ($2K–$5K/month)

**Done when:** 10 users have tested the product. Failure modes from real usage are fixed. At least one paying customer or signed pilot agreement.

---

## Phase 4: Hardening (2–3 weeks, overlaps with Phase 3)
*Make it production-worthy without over-engineering.*

### 4A — Model Routing & Cost Optimization
- Benchmark Sonnet vs. Opus on the golden dataset (accuracy delta vs. cost delta)
- Implement query complexity router: simple lookups → Sonnet, multi-hop research → Opus
- Measure actual cost per query from validation usage
- Set a cost budget per query and optimize to hit it

### 4B — Update Pipeline (Layer 5)
- Weekly cron: `crawl` → `parse` → `load` → `extract-refs` → `detect-amendments` → `link-concepts` → `embed`
- The crawler and pipeline already support incremental updates — just needs the trigger
- Alert on documents that supersede existing graph nodes
- Re-run eval after each update to catch regressions

### 4C — Reliability
- Error handling for Neo4j connection failures, embedding API timeouts, LLM errors
- Rate limiting for the API
- Basic monitoring: uptime, query latency, error rate
- Backup strategy for Neo4j and the document registry

**Done when:** System handles document updates automatically. Cost per query is known and budgeted. Basic monitoring and error handling in place.

---

## Phase 5: Scale Prep (after first customer)
*Don't build this until revenue validates the direction.*

- MCO outreach (Tier 2 buyers) — use legal aid case study as proof
- Multi-user support, team accounts, usage dashboards
- SSO for enterprise (MCOs will require it)
- Billing/subscription system (Stripe)
- SOC 2 / HIPAA compliance posture (for MCO sales)
- Multi-state expansion planning (identify next state, assess document similarity)

---

## Timeline Summary

| Phase | Duration | Key Milestone |
|---|---|---|
| 1: Eval & Golden Dataset | Week 1 | 50 entries, baseline scores, failure catalog |
| 2: Thin UI | Weeks 2–3 | Live URL with auth and feedback |
| 3: Validation | Weeks 4–7 | 10 users tested, first paying customer |
| 4: Hardening | Weeks 5–7 (parallel) | Auto-updates, cost optimization, monitoring |
| 5: Scale Prep | Week 8+ | Only after revenue validates |

**Target: first paying customer by ~week 7 (mid-May 2026).**

---

## Open Decisions

| Decision | When to Make | Key Inputs |
|---|---|---|
| UI framework (Next.js vs. other) | Phase 2 start | Mastra ecosystem compatibility, deployment speed |
| Hosting provider | Phase 2 start | Deployment speed for validation, path to production |
| Neo4j hosted vs. self-managed | Phase 2 start | Aura free tier viability (200K node limit vs. ~53K current), data volume |
| Sonnet vs. Opus routing threshold | Phase 4 | Golden dataset accuracy delta, cost per query data |
| Embedding model re-evaluation | Phase 4 | voyage-law-2 performance on expanded golden dataset |
| Enterprise compliance (SOC 2, HIPAA) | Phase 5 | MCO buyer requirements |

---

## Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Legal aid orgs too busy to validate | Delays Phase 3 | Start outreach in Phase 1. Lean on personal network. Offer to come to them. |
| Agent accuracy drops on real-world questions | Credibility damage | Phase 1 eval baseline + regression testing catches this early |
| NC DHHS changes document hosting/structure | Breaks crawler | Crawler already handles conditional requests. Monitor for 403s. Manual investigation protocol exists. |
| Cost per query too high for target pricing | Margin pressure | Phase 4 routing optimization. Cache common queries. Measure before optimizing. |
| Competitor launches similar tool | Urgency | Speed to market + domain depth + knowledge graph moat. Ship fast. |
| Scope creep into clinical decision support | Regulatory risk | Hard boundary in product positioning. Policy research only. Train users on the distinction. |
| DHHS policy documents terms of use | May restrict commercial use of automated access | Government documents are generally public domain. User-agent already identifies us with contact URL. Verify site terms before commercial launch. |

---

*This roadmap is a living document. Update after each phase completion and after major strategic inputs (user feedback, first customer, competitive developments).*
