# Working artifact from the round-two triage-corpus review

I read every minor note in the eight scopes (about 226), opened about 50 in code or data, promoted 5 notes into 6 findings and discarded about 45.

Three promotions came from checking a note against the official source, not just the code:
- The DHHS index tags 137 of its 921 listed documents "Archived", including every superseded income and reserve table. The parser drops the tag and the loader labels them current.
- The agency states that fee schedules on the crawled site stopped being updated on 3 November 2022, yet 189 files are labelled primary and current.
- Policy 1A-30 has no policy number because its link text lacks a comma, which removes it from lookups, frames and amendment chains.

Two more are frame defects shown by probes: alias substrings that force the wrong policy, and two-policy questions framed from one policy. The sixth is a fee-schedule date-parsing bug.

Discards, by reason:
- About 14 were already inside round-one findings.
- About 20 were true but had no consumer, gate or measurable effect.
- Four fail closed elsewhere. The main one: the scope check on the model's retyped query is repeated by the verifier on the user's own text.
- Four were not true as stated.
- Three need Neo4j or a paid embedding to settle.

The scratch directory held scripts from an earlier interrupted attempt at this task. I used them as leads and re-ran or rewrote each at HEAD.

## Triage ledger

Notes read in full: about 226 across corpus-retrieval, corpus-frames, neo4j-live, rag-design, contracts-seams, pipeline-parse-graph, pipeline-refs-federal-jev and crawler. Opened in code or data: about 50.

### Promoted

| # | Originating note (scope) | Result |
|---|---|---|
| 1 | crawler: several active versions of one manual section; "check what retrieval uses to prefer the newest" | Nothing does. Widened: the agency's Archived tag on 137 of 921 listed rows is discarded. |
| 2 | neo4j-live: "64 of 143 primary schedules are dated 2022 (newest 2025-02-01)" | Root cause: the crawled source has had no updates since 2022-11-03. |
| 3 | corpus-frames: query-intent.ts:458 'cap/c' matches CAP/Choice | Holds. Widened to 'outpatient therapy' forcing Policy 10A. |
| 4 | crawler: clinical-policies.ts:54 "one without a number"; neo4j-live: unresolved "1A-30 x18" | Same document: Policy 1A-30 has no policy number. |
| 5 | neo4j-live: same fee-schedule note | Date misparse; "2025-02-01" is a February 2021 file. |
| 6 | corpus-frames: document-selection.ts:237 one-policy frame | Holds. Plan text added. |

### Verified true but low (not promoted)

| Note | Why low |
|---|---|
| pipeline-refs: cfr-supersessions.json:7, 45:74 effective 2025-10-01 | The reason text in the same entry says Part 74 was superseded in Dec 2014. Reachable only through lookupPolicy('45 CFR 74'). |
| contracts-seams: corpus-status.ts:26 "Corpus updated" = max(last_indexed) | It is graph load time. Release loads follow the crawl, so skew is small. Worth fixing together with findings 1 and 2: source_checked_at is already on each Document. |
| pipeline-refs: eval/levels/cross_ref.py:40 cannot match REFERENCES_DOCUMENT | True (those edges start at Sections). The level has 2 golden entries and gates nothing. |
| corpus-retrieval: sections.ts:63-72 container children without ORDER BY | True. The text carries headings and a truncation note. |
| pipeline-parse-graph: converter.py:1742 non-PDF formats parse with no deadline | True. Largest local XLSX parse is 6.6 s; no evidence of a hang. |
| pipeline-parse-graph: fee_xlsx.py:105/:121 checks cannot fail | True. Compaction only trims trailing empty cells, so nothing is lost. |

### Discarded: already inside a round-one finding

| Note | Covered by |
|---|---|
| evidence.ts:108 effective_date as grounding evidence | pipeline-parse-graph-01 (impact) |
| term-lists.ts:235 'phone' avoid term | corpus-frames-03 ("Matched phone.") |
| change_notice advertised as a searchable type (four scopes) | neo4j-live-11 |
| policy-lookup.ts:61 synthetic rows fill the lookup | neo4j-live-11, pipeline-refs-federal-jev-05 |
| amendments.py:292 lock bypass | neo4j-live-11 (evidence) |
| release.py:225 federal refetch after reset | prior-findings-04 |
| amendment.ts:116 reason label | corpus-frames-09 |
| linker.py:53 RESTRICTS on "Exception to Policy Limitations" | pipeline-parse-graph-12 |
| evaluation_evidence.py:53 model environment; results.py:159 | model-inventory-09 |
| MA-2270 header expansion; amendment-context docLimit | corpus-retrieval-05, neo4j-live-12, corpus-frames-09 (and needs Neo4j) |
| anchor-text titles ("here", "clean page") | neo4j-live-12 |
| jev/scope.ts:17 Jev scope provider | privacy-compliance-product-07 |
| hybrid.ts:8 degraded mode drops policy_scoped | agent-processors-tools-05 |
| substring intent notes ('hearing', 'child', 'difference between') | corpus-retrieval-07, corpus-frames-05 |

### Discarded: fail closed or not true as stated

| Note | Finding |
|---|---|
| service.ts:31 scope check runs on the model's query | Fail closed. The verifier re-resolves scope from the user text (run.ts:99, COVERAGE_VERIFICATION_QUERY). |
| service.ts:42 "Full evidence" against the 6,000-character cap | MA-3321 tables are about 3 KB. |
| policy-corpus.ts:22 retrievalMode global | Resets to hybrid on the next successful embed; display only. |
| deep-research schemas.ts:81 omits 'recovering' | A TypeScript type for progress events. The run-state enum has it. |
| parse_provenance.py:144 hard-coded attestations | The function is read-only and compares the registry hash before returning. |
| unresolved 10B, 1K-7, 1A-41, 1S-4, 9C "absent from the graph" | Not on the live index: retired policies. Only 1A-30 is real (finding 4). |
| loader.py:360 LIKE fallback | Pattern is anchored on '/' + stem + extension and filtered by source type. |
| source_audit.py exact host | The stricter side fails closed. |

### Discarded: true but no consumer, gate or measurable effect

query-intent.ts:5 (1915 read as a year); hybrid.ts:20 topK; search.ts:134 apostrophe phrases; rerank.ts:184; config.py:97 CFR parts; schema.ts:244 canonicalisation on open; registry.ts:117 cross-family URL; reconcile --repair (not scheduled); medicaid-page-documents.ts:107 phone hrefs (never registered); answer.py:566 route_widened (never read); frames-federal.test.ts:24 fixture format; converter.py:1113 upper-case extensions (none among 4,529 local files); status amendment without AMENDS (status is not a retrieval filter); prompt.ts:119; schema.py:40 reset in one transaction (not testable without Neo4j); corpus-manifest.json:26 freshness slack.

## Scratch artefacts

All under `<review scratch directory, not kept>/gaps/triage-corpus/`:

- `ledger.md`, `draft-findings.md`
- Frame probes: `frames.probe.ts` / `frames.out`, `alias2.probe.ts` / `alias2.out`, `archived.probe.ts` / `archived.out`, `p3/twopolicy.probe.ts` / `p3/twopolicy.out`, `feerank.probe.ts`
- Fee schedules: `fee_dates.py` / `fee_dates.json`, `variant_date_cases.py`, `fee_groups4.py`
- Live captures (2026-10-05): `clinical-index.html`, `dhhs-index-live.html`, `fs-providers-fee-schedules.html`, `fs-document-collection.html`
- `dhhs-index-rows.json`, `dhhs-archived.mts`, `probe-alias.mts`, `crawler-copy.db` (read-only copy of the workstation registry)

The repository working tree was clean after the work (`git status --porcelain` empty).
