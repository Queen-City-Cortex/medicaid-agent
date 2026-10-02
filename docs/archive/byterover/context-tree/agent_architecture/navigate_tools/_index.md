---
children_hash: 7587813d8bbf26ad8620e134599459515b7acbefba3f7f1a98307a685cdcbfc5
compression_ratio: 0.9055555555555556
condensation_order: 1
covers: [getamendments_optional_match_filtering.md]
covers_token_total: 180
summary_level: d1
token_count: 163
type: summary
---
## Navigate Tools

- **getamendments_optional_match_filtering.md** is the structural source of truth for the `getAmendments` tool’s Neo4j query behavior in the navigate tools module.
- The topic centers on how `getAmendments` uses **OPTIONAL MATCH** to retrieve amendment-related rows, then applies **null-row filtering** so only meaningful amendment data is kept.
- It also documents the tool’s **metadata mapping**, **authoritative document selection**, and the rules/facts that govern how amendment results are interpreted.
- The associated context stub is now reduced to a brief overview; detailed behavior remains in the main file for drill-down.