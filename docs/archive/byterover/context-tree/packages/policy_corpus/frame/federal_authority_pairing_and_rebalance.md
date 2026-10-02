---
title: Federal Authority Pairing and Rebalance
summary: Federal authority retrieval pairs statute and regulation, boosts title matches for authority citations, and rebalances waiver/SPA/EPSDT hints while preserving statute retention.
tags: []
related: [packages/policy_corpus/frame/rebalance/federal-authority.ts.md, packages/policy_corpus/src/internal/query-intent.ts.md]
keywords: []
createdAt: '2026-06-12T20:57:03.409Z'
updatedAt: '2026-06-12T20:57:03.409Z'
---
## Reason
Document federal authority pairing, authority-citation boosts, and rebalance hints for waiver, SPA, and EPSDT queries.

## Raw Concept
**Task:**
Document the federal authority pairing and rebalance changes in the policy corpus frame pipeline.

**Changes:**
- Turned on federal authority pairing via asksForAuthorityCitation and authorityCitationQuery.
- Added authority title boosting, statute/regulation title pairing, and candidate pairing to keep CFR authority-first.
- Added waiver-authority, SPA, and EPSDT rebalance hints while preserving statute retention and existing MLR behavior.

**Files:**
- packages/policy-corpus/src/frame/federal-authority.ts
- packages/policy-corpus/src/frame/rebalance/federal-authority.ts
- packages/policy-corpus/src/internal/query-intent.ts

**Flow:**
query intent -> authority signal detection -> federal hit ranking -> statute/regulation pairing -> frame rebalance hints

**Timestamp:** 2026-06-12T20:56:37.286Z

## Narrative
### Structure
The frame pipeline resolves federal authority evidence in four steps: signals, federal evidence, implementation evidence, and candidate set assembly. Rebalance logic then adjusts primary, supporting, and avoid sections using query-specific hints.

### Dependencies
Depends on shared query-intent predicates, focus-term ranking, and section/document hydration helpers. Authority questions require statute + implementing regulation pairing, while waiver-authority questions anchor on 42 CFR Part 441 Subpart G and SSA TITLE-19.

### Highlights
Authority citation questions now prefer official section headings over body mentions, and statute retention keeps one federal_statute section visible even when regulation hints dominate. SPA and EPSDT hints were added to prevent misrouting into CHIP or procedural notice parts.

### Rules
Order matters: WAIVER_AUTHORITY_HINT must run before WAIVER_HINT because authority phrasing is narrower. Statute retention keeps one surfaced federal_statute section in primary when regulation-only hints would otherwise remove it. MLR and generic managed care federal hints were considered but intentionally left out.

### Examples
Examples include 1915(c) HCBS waiver authority queries routing to 42 CFR Part 441 Subpart G, SPA timeliness questions routing to 42 CFR 430, and EPSDT questions routing to 42 CFR 441 Subpart B.

## Facts
- **federal_authority_pairing**: Workstream C uses asksForAuthorityCitation in query-intent.ts plus authorityCitationQuery to turn on federal authority pairing in frame/federal-authority.ts. [project]
- **federal_program_name_expansions**: FEDERAL_PROGRAM_NAME_EXPANSIONS expands focus terms with official program names, frame-only, and never through extractSearchTerms. [project]
- **authority_title_boost**: boostAuthorityTitleMatches adds a 0.3x phrase-title boost so headings like 441 Subpart B outrank body mentions such as 440.345. [project]
- **statute_regulation_title_pairing**: withStatuteRegulationTitlePairing admits the missing document type’s top title when only statute or regulation is present in preferred titles. [project]
- **statute_regulation_candidate_pairing**: ensureStatuteRegulationCandidatePairing splices the missing type’s top hit at index 1 so CFR remains authoritative-first. [project]
- **ssa_title_19_anchor_scope**: SSA TITLE-19 anchors plus statutory candidates now apply to waiverAuthorityQuery, not just application queries. [project]
- **waiver_authority_hint**: WAIVER_AUTHORITY_HINT delegates to isWaiverAuthorityQuery. [project]
- **statute_retention**: Statute retention keeps one surfaced federal_statute section in primary when regulation-only hints would otherwise remove it. [project]
- **federal_authority_pipeline_steps**: Federal-authority evidence resolution in frame/federal-authority.ts is organized into four steps: buildFederalAuthoritySignals, collectFederalAuthorityEvidence, collectFederalImplementationEvidence, and buildFederalAuthorityCandidateSets. [project]
- **authority_citation_title_preference**: Authority-citation questions get a section-TITLE phrase boost so a section whose heading carries the official multi-word program name is preferred over body-text acronym mentions. [project]
- **authority_answer_pairing**: Authority answers should pair the statute with its implementing regulation. [project]
- **waiver_authority_routing**: WAIVER_AUTHORITY_HINT handles questions like what federal regulation authorizes 1915(c) HCBS waivers and should route to 42 CFR Part 441 Subpart G sections 441.300–441.310 rather than 42 CFR 430.25. [project]
- **spa_hint**: The SPA_HINT matches plan amendment, SPA, or submission/timeliness/deadline plus plan queries and treats 42 CFR 430 as primary. [project]
- **epsdt_hint**: The EPSDT_HINT matches EPSDT or early and periodic screening queries and treats 42 CFR 441 Subpart B sections 441.50–441.62 as primary. [project]
- **mlr_hint_decision**: MLR handling was considered but left out of the rebalance hints because the existing MLR test suite already produces the right frame. [project]
- **federal_query_hint_order**: Order matters in FEDERAL_QUERY_HINTS: WAIVER_AUTHORITY_HINT runs before WAIVER_HINT because authority phrasing is narrower. [project]
- **existing_context_domains**: The local context tree already contains domains such as agent_architecture, amendment_detection, auth_integration, database_operations, evaluation, frontend_ui, packages, and qa. [project]
