---
title: Golden Dataset De-contamination and Retrieval Constants
summary: Policy-corpus retrieval was de-contaminated by replacing memorized answer terms, removing hardcoded section-number bonuses, and preserving legitimate HCBS rule terms and vector overscan constants.
tags: []
related: []
keywords: []
createdAt: '2026-06-12T03:42:03.777Z'
updatedAt: '2026-06-12T03:42:03.777Z'
---
## Reason
Capture the anti-contamination changes and retrieval constants from policy-corpus internals.

## Raw Concept
**Task:**
Document policy-corpus retrieval de-contamination and tuning changes

**Changes:**
- Replaced HCWD limit history terms with topical HCWD income rule terms
- Removed the 01-14 change-notice bonus from HCWD history retrieval
- Removed the hardcoded 5.4.3 section-number match from prior-auth quantity detection
- Kept WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS as legitimate HCBS domain knowledge
- Documented Neo4j vector overscan behavior and retrieval limit constants

**Files:**
- packages/policy-corpus/src/internal/shared.ts
- packages/policy-corpus/src/frame/context/routing.ts

**Flow:**
query intent -> candidate scoring -> vector overscan -> topical filtering -> group-specific ranking

**Timestamp:** 2026-06-12T03:41:28.495Z

## Narrative
### Structure
The shared internals file defines retrieval constants and topical term lists, while routing.ts contains the HCWD income history retrieval query and document selection logic.

### Dependencies
Uses Neo4j session queries, document metadata mapping, and query-intent helpers; vector search requires overscanning because queryNodes(k) returns global top-k.

### Highlights
The retrieval pipeline now avoids eval contamination by removing memorized answer fragments and hardcoded policy-specific section matches.

### Rules
Topical match only — this used to also hardcode section number 5.4.3, coupling retrieval to one specific policy's table of contents.
Surfaces income/premium rule sections from HCWD change notices, newest first.
Scoring is topical only — the previous version used verbatim golden-answer sentences and a title bonus for the one change notice ('01-14') that answers the golden question, which was eval contamination.

### Examples
Examples of preserved constants include VECTOR_OVERSCAN_FACTOR = 8, VECTOR_OVERSCAN_MAX = 200, MAX_CONTENT_CHARS = 6000, and MAX_COMBINED_CHARS = 6000.

## Facts
- **hcwd_limit_history_terms**: HCWD_LIMIT_HISTORY_TERMS contained verbatim golden answers and was replaced with topical HCWD_INCOME_RULE_TERMS. [project]
- **collect_hcwd_income_history_hits**: collectHcwdIncomeHistoryHits is now topical-only and no longer uses the 01-14 document bonus. [project]
- **prior_auth_quantity_section**: isPriorAuthQuantitySection dropped the hardcoded 5.4.3 section-number match. [project]
- **eval_baseline**: Eval baseline 2.45 was partly memorized routing and should be re-baselined on a held-out slice before trusting deltas. [project]
- **waiver_application_primary_section_numbers**: WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS remains legitimate HCBS regulations domain knowledge and is not contamination. [project]
- **neo4j_vector_index**: The Neo4j vector index cannot pre-filter because queryNodes(k) returns GLOBAL top-k and WHERE only filters that pool. [project]
- **vector_overscan_strategy**: Per-type-group coverage requires overscanning the index and filtering the deeper pool down to each group's top-k. [project]
- **vector_overscan_factor**: VECTOR_OVERSCAN_FACTOR is 8. [project]
- **vector_overscan_max**: VECTOR_OVERSCAN_MAX is 200. [project]
- **content_limits**: MAX_CONTENT_CHARS and MAX_COMBINED_CHARS are both 6000. [project]
- **frame_limits**: FRAME_PRIMARY_LIMIT is 4, FRAME_SUPPORT_LIMIT is 4, FRAME_AVOID_LIMIT is 3, and FRAME_DOCUMENT_LIMIT is 3. [project]
- **hcwd_income_rule_terms**: HCWD_INCOME_RULE_TERMS includes income limit, countable income, unearned income, earned income, federal poverty level, sliding scale, premium amount, and premium amounts. [project]
- **prior_auth_quantity_terms**: PRIOR_AUTH_QUANTITY_TERMS includes quantity and episodic drugs, quantity limit, quantity limits, quantity limitation, quantity limitations, episodic drug, episodic drugs, and maximum supply. [project]
- **waiver_application_primary_section_numbers**: WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS includes 440.180, 441.300, 441.301, 441.302, 441.303, 441.350, 441.351, 441.352, 441.353, 441.354, and 441.355. [project]
