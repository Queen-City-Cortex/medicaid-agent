# Golden Dataset Changelog

## v1.0 — 2026-03-26

- Initial seed with 8 entries based on real clinical policies in the graph
- Covers: 2 simple lookup, 3 moderate multi-hop/single-lookup, 1 complex cross-document, 1 negative (edge case)
- All section IDs verified against the live Neo4j graph (758 documents, 13,490 sections)
- Policies covered: 3K-2 (CAP/DA), 5B (Orthotics & Prosthetics), 3L (Personal Care Services), 8C (Outpatient Behavioral Health), 10A (Outpatient Therapy)
- These are synthetic entries for framework validation; Jeff will replace/expand with real entries
