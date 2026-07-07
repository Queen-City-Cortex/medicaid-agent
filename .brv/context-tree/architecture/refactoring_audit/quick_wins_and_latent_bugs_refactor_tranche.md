---
title: Quick Wins and Latent Bugs Refactor Tranche
tags: []
related: [database_operations/neo4j_write_read_consistency/context.md, facts/project/context.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-07-06T03:28:23.068Z'
updatedAt: '2026-07-06T03:28:23.068Z'
---
## Raw Concept
**Task:**
Document the first refactor tranche that removed dead code, consolidated text matching helpers, centralized path normalization, and clarified waiver section predicates.

**Changes:**
- Deleted dead CorpusGraphWriter.mark_document_status and its vulture whitelist entry
- Deleted dead web buildSourceIndex
- Consolidated includesAnyTerm into includesPhrase
- Exported REWRITE_PART_TYPE and OK_PART_TYPE from message-parts.ts
- Unified AnswerFrame type imports through policy-corpus
- Moved crawler registry access and local path normalization into pipeline/crawler_registry.py
- Hoisted waiver CFR encodings into documented predicates

**Files:**
- packages/pipeline/src/pipeline/crawler_registry.py
- packages/policy-corpus/src/internal/section-predicates.ts

**Flow:**
audit review -> dead code removal -> helper consolidation -> canonical type import cleanup -> registry normalization -> predicate documentation

**Timestamp:** 2026-07-06

**Author:** refactor/quick-wins-and-latent-bugs

**Patterns:**
- `^441\.(30\d|35\d)$` - Waiver authority anchor section numbers for 42 CFR 441 Subparts G and H

## Narrative
### Structure
The refactor spans pipeline registry helpers and policy-corpus section predicates, with the registry module standardizing local_path joins and the predicates module centralizing textual classification for coverage and waiver retrieval.

### Dependencies
Consumers must normalize registry paths relative to CRAWLER_DATA_DIR using posix separators; rerank and frame pipelines depend on the shared phrase-matching predicates and canonical AnswerFrame types from policy-corpus.

### Highlights
The changes were behavior-preserving, removed drift-prone duplicates, and left all test suites green. Waiver section-number logic is now explicit about anchor, implementing, and rebalance ranges instead of being inlined at call sites.

### Rules
"Which CFR sections are waiver-primary" deliberately differs by phase: evidence anchoring casts wider (Subparts G and H) than rebalance reordering (Subpart G only), and the rerank scorer uses the curated WAIVER_APPLICATION_PRIMARY_SECTION_NUMBERS set from term-lists.ts (§§ 441.300–.303, 441.350–.355, 440.180). These encodings used to be inlined at each site and drifted silently; keep every variant here, side by side, so a range change is a visible decision rather than an accident.

### Examples
normalize_local_path converts backslashes to forward slashes, strips the crawler data dir prefix when the input path is absolute, and returns the posix relative path used as the registry join key.

## Facts
- **refactor_commit**: Commit 06e3128 on branch refactor/quick-wins-and-latent-bugs implemented the audit's first tranche. [project]
- **corpus_graph_writer_dead_method**: Dead CorpusGraphWriter.mark_document_status and its vulture whitelist line were deleted, while private _mark_document_statuses remains for merge_amendments. [project]
- **web_build_source_index**: Dead web buildSourceIndex was deleted. [project]
- **term_matching_api**: includesAnyTerm was merged into includesPhrase across query-intent.ts and rerank.ts. [project]
- **message_part_exports**: REWRITE_PART_TYPE and OK_PART_TYPE were exported from message-parts.ts and used in parse-message.ts. [project]
- **answer_frame_type_source**: Agent processors now import canonical AnswerFrame types from policy-corpus after deleting drifted local copies. [project]
- **crawler_registry_ownership**: pipeline/crawler_registry.py owns normalize_local_path and read_registry_rows, while audit.py keeps a one-line wrapper for monkeypatchable CRAWLER_DATA_DIR. [project]
- **waiver_cfr_predicates**: Waiver CFR encodings were hoisted to four documented predicates in section-predicates.ts. [project]
- **test_suite_status**: All suites were green: pipeline 305, policy-corpus 239, agent 215, web 251. [project]
