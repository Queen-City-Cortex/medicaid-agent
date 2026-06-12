# Golden Dataset Changelog

## v1.0 — 2026-03-26

- Initial seed with 8 entries based on real clinical policies in the graph
- Covers: 2 simple lookup, 3 moderate multi-hop/single-lookup, 1 complex cross-document, 1 negative (edge case)
- All section IDs verified against the live Neo4j graph (758 documents, 13,490 sections)
- Policies covered: 3K-2 (CAP/DA), 5B (Orthotics & Prosthetics), 3L (Personal Care Services), 8C (Outpatient Behavioral Health), 10A (Outpatient Therapy)
- These are synthetic entries for framework validation; Jeff will replace/expand with real entries

## v2.1 — 2026-06-12

- Added `heldout-paraphrase.json`: 50 held-out paraphrases (h-001…h-050), one per
  golden question, same answers/evidence, reworded questions (varied persona and
  surface form, policy scoping preserved where it determines the answer)
- Purpose: honest re-baseline after the 2026-06-11 de-contamination — the old
  2.45 baseline partly measured retrieval code that contained golden-answer
  text, so scores on the original phrasings are not comparable
- Schema: ids now `^(q|h)-\d+$`; `source` gains `held_out_paraphrase`;
  optional `paraphrase_of` provenance field
- Run with: `python -m pipeline.cli eval --level answer --dataset data/golden/heldout-paraphrase.json`
