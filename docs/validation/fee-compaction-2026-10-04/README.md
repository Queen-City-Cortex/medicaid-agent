# Fee-schedule compaction diagnostic — 2026-10-04

Trailing empty XLSX cells inflated fee-schedule bodies and contextual embedding inputs. The targeted `fee-schedule-trailing-empty-v1` representation reduced measured fee-only tokens by **89.1552%**, without changing populated cells or graph identities. These are offline diagnostics: **NOT_ASSESSED**, non-promotable, no embeddings generated, and **$0 provider spend**.

| Measured fee-only quantity | Original | Candidate |
| --- | ---: | ---: |
| Eligible documents | 1,701 | 1,701 |
| Graph sections / relationships | 5,387 / 9,239 | 5,387 / 9,239 |
| Sections with content | 4,247 | 4,247 |
| Body UTF-8 bytes | 2,750,838,732 | 368,268,779 |
| Planned embedding inputs | 329,888 | 46,523 |
| Pinned local tokens | 1,897,659,254 | 205,797,106 |

The 696 transformed workbooks cover 893 sheets, including two empty sheets. Their native rendered bytes fell from 2,593,381,319 to 210,810,743 (**91.8712%**). Independent native coordinate digests match every emitted populated cell, and native reconstruction matches every original cached body. Formula positions, merges, leading/interior blanks and sheet/row order remain represented; 39 missing formula caches were recorded without recalculation. The remaining 288 XLS and 717 PDF payloads are unchanged.

Both graphs used the normal loader, shared contextual planner version 2, `voyage-4` / 1024 dimensions, and the same pinned tokenizer SHA. A final read-only audit compares actual `Document.document_type`, eligibility, titles, hierarchy, roles, formats, variant metadata and relationship identities. The typed identity receipts match exactly. The earlier bulk inspector queried an absent `source_type` property; that null field was not used as evidence of eligibility. The separate final audit corrects that query and confirms all 1,701 documents are answer-ready fee schedules.

## Cost projection and limits

Adding the measured fee delta to the prerequisite's unchanged non-fee totals projects **227,607,239 full-corpus tokens**, about **$13.66** at the frozen **2026-10-03 rate of $0.06 per million tokens**. This replaces the previous approximately $115.17 estimate. It is a projection, not a new full-corpus measurement, current price quote, invoice or qualification run. See [cost projection](cost-projection.json) and its dated rate source.

The new payloads change the corpus snapshot and invalidate the previous four scope approvals. No approval was rebound. The mixed-corpus 99-identity catalog has no fee-schedule entries, so this experiment cannot establish answer quality or release qualification. All 269 retained parse exceptions remain excluded; no recovery is claimed. The retained-sidecar audit includes 1,970 sidecars, including 244 without JSON payloads.

Original checkout pending files, registry, native inputs, retained sidecars, original graph dump and PR #204 were preserved. Task-owned graph containers, anonymous volumes and the internal network were removed after recording receipts; the developer graph remains running. No merge, deployment, activation or agency contact occurred.

## Evidence and validation

- [Graph metrics](graph-metrics.json), [staging summary](staging-summary.json), [native proof summary](native-proof-summary.json), and [private receipt checksums](checksums.json).
- [Image source attestations](inspection-source.json) distinguish the bulk measurement image at `6031d98` from the final typed audit image at `b6db153`. All pipeline parser, loader, planner and tokenizer behavior is unchanged between them; the latter fixes the metadata audit query. Each image's 98 inspected source/configuration file hashes were verified against its checkout.
- [Preservation and cleanup](preservation-and-cleanup.json). Public reports omit cell values, source URLs, credentials and private absolute paths. Complete proofs and runtime receipts remain in private storage.
- Linux pipeline suite with real Neo4j: **648 passed**. Ruff, Vulture and the three inspector guard tests passed. Operations checks: **16 Node tests and eight shell tests passed**. Opus approved the corrected implementation after two substantive review fixes.
- Final CI is recorded on [draft PR #207](https://github.com/Queen-City-Cortex/medicaid-agent/pull/207), stacked on [PR #199](https://github.com/Queen-City-Cortex/medicaid-agent/pull/199). [PR #204](https://github.com/Queen-City-Cortex/medicaid-agent/pull/204) remains separate.

See the [runbook](../../operations/fee-schedule-compaction.md) for reproduction and the proposed exact relational fee lookup follow-up. No relational implementation or rollout is part of this diagnostic.
