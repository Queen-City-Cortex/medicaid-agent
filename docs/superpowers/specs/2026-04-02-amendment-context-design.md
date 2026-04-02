# Amendment Context: Fix AMENDS Edge Quality and Agent Confusion

## Problem

The agent sometimes hedges or gives wrong answers when checking amendments, because:

1. **Missing context on AMENDS edges**: The pipeline extracts MA-numbers from ALL section text in change notices, creating correct edges but storing no information about WHAT was changed. The `getAmendments` tool fills `changeSummary` with the first random long section, which is often irrelevant to the target document.
2. **Noisy extraction scope**: 98.5% of AMENDS edges (838/851) come from body text, not title matches. Many are legitimate (COLA notices amend 10+ policies listed in their "CONTENT OF CHANGE" sections), but the current approach also picks up cross-references from BACKGROUND sections that happen to mention an MA-number.
3. **Rigid document-type routing**: The system prompt uses hard-coded rules like "HCWD -> clinical_policy first" that are wrong (HCWD is a dhhs_policy) and don't generalize.

### Concrete example

"What is the earned income limit for HCWD?" is a trick question (there is no earned income limit). The agent finds the right policy (MA-2180) and reads the correct section, but when it calls `getAmendments`, one result is titled "Long Term Care Partnership Program." The agent narrates: "amendment results included unrelated change notices, so I could not cleanly verify which HCWD income rule is the authoritative current version." The amendment IS real (it updated resource limits in MA-2180 IV.I.2), but the agent has no way to tell that from the title alone.

## Design

### 1. Pipeline: Two-tier body extraction with signal-section preference

**File**: `packages/pipeline/src/pipeline/references/amendments.py`

Currently the Cypher query at lines 116-128 fetches ALL section texts for each change notice. Change to a two-tier approach:

**Tier 1 — Signal sections** (preferred): Query sections whose title or body text matches any of these amendment-signal patterns:
- "CONTENT OF CHANGE" (185/203 change notices)
- "POLICY UPDATE" / "POLICY UPDATES" (newer COLA notices use this instead)
- "MAINTENANCE OF MANUAL" (44/203)
- Section titles containing an MA-number pattern (e.g., "A. MA-3550.VIII, Determining Need...") — these are per-policy subsections under POLICY UPDATE headings

**Tier 2 — Full body fallback**: If no signal sections are found for a given change notice, fall back to current behavior (extract from all section text). This prevents losing legitimate edges for the ~5% of change notices with non-standard headings.

Title-based MA-number extraction (line 140) remains unconditional in both tiers.

### 2. Pipeline: Store `change_description` on AMENDS edges

For each AMENDS edge, extract context about what was changed in the target document and store it as a `change_description` property on the edge.

**Extraction logic**:
- For each MA-number mention in the matched section text, extract the surrounding sentence/paragraph (from previous period/newline to next, ~300 char cap)
- For "MAINTENANCE OF MANUAL" sections, grab the full "Remove: MA-XXXX..." line
- When the same (source, target) pair has multiple excerpts (e.g., MA-2180 mentioned in both "CONTENT OF CHANGE" and "MAINTENANCE OF MANUAL"), **concatenate all excerpts** joined by newlines. The current deduplication at line 171 collapses to one edge per pair, so the `change_description` must capture all relevant context for that pair.
- For title-only matches where no body context exists, `change_description` is set to the change notice title.

**Implementation**: Build a `dict[tuple[str,str], list[str]]` keyed by `(source_id, target_id)` that accumulates excerpts. After deduplication, join each pair's excerpts into a single string for the edge property.

**Cypher change**: `MERGE_AMENDS_BATCH` accepts `change_description` per pair:
```cypher
UNWIND $pairs AS pair
MATCH (src:Document {id: pair.source_id})
MATCH (tgt:Document {id: pair.target_id})
MERGE (src)-[r:AMENDS]->(tgt)
SET r.change_description = pair.change_description
```

### 3. Agent tool: Use `change_description` from the edge

**File**: `packages/agent/src/tools/navigate.ts`

Replace the runtime section-text query in `getAmendments` (lines 98-114) with reading `change_description` directly from the AMENDS relationship. The complex `OPTIONAL MATCH` + aggregation for `firstSectionText` is replaced by accessing `r.change_description` on the relationship.

The `changeSummary` field in the tool output now contains the pre-computed, target-specific excerpt instead of random section text.

### 4. Agent prompt: Replace routing rules with taxonomy context and amendment guidance

**File**: `packages/agent/src/index.ts`

**4a. Document-type routing**: Remove the rigid routing block (lines 88-93) and the program-specific routing rule (line 109). Replace with taxonomy context that lets the agent make its own routing decisions:

```
## Document types in the knowledge base
- **dhhs_policy** -- MA-series manual sections covering eligibility, enrollment,
  financial rules, and program administration (e.g., MA-2180 HCWD, MA-2250 Income,
  MA-2280 CAP). This is the largest collection and the primary source for
  "who qualifies" and "how much" questions.
- **clinical_policy** -- Clinical Coverage Policies (CCPs) governing what services
  are covered, medical necessity criteria, and provider billing (e.g., CCP 1A-1
  Dental, CCP 3L CAP/DA services). Use for "what's covered" and "is this medically
  necessary" questions.
- **federal_regulation** -- 42 CFR and other federal rules that NC policies implement.
- **change_notice** -- Amendments to the above. Usually found automatically via
  getAmendments; search directly only when asking about recent rule changes.

When unsure which type applies, search without a filter first, then refine based
on what comes back.
```

**4b. Amendment guidance**: Update the amendment awareness section (lines 96-100) to teach the agent to use `changeSummary` from the tool output. Replace line 98 ("If a change notice exists, read its sections to determine what was modified") with:

```
- Each amendment includes a **changeSummary** describing what was changed in the
  target document. Use this to assess relevance before reading the full change
  notice. Only use getSection on a change notice's sections when the changeSummary
  indicates the amendment is relevant to the question at hand.
```

This prevents the agent from diving into unrelated change notice content and getting confused by titles like "Long Term Care Partnership Program."

### 5. Testing and verification

- **Pipeline unit test** (`packages/pipeline/tests/test_amendments.py`):
  - Test that signal sections (CONTENT OF CHANGE, POLICY UPDATE) are preferred over other body text when they exist.
  - Test the Tier 2 fallback: when no signal sections exist, all body text is used (no regression).
  - Test that a change notice mentioning an MA-number only in a BACKGROUND section (while having a CONTENT OF CHANGE section that doesn't mention it) does NOT create an AMENDS edge for it.
  - Test that `change_description` concatenates multiple excerpts for the same (source, target) pair.
- **Agent unit test** (`packages/agent/tests/tools/navigate.test.ts`): Update to mock the new Cypher shape — `change_description` comes from the AMENDS relationship instead of `firstSectionText` from a section query.
- **Agent integration test** (`packages/agent/tests/integration/neo4j-tools.integration.test.ts`): Update amendment fixtures to include `change_description` on AMENDS edges. Add assertion that `changeSummary` in the tool output matches the edge property.
- **Pipeline integration check**: After re-running `detect_amendments()`, verify edge count and spot-check that MA-2180's amendments retain the legitimate ones (01-14, 03-18, 03-25, etc.) with meaningful `change_description` values.
- **Agent smoke test**: Run "What is the earned income limit for HCWD?" through the CLI runner and verify the agent answers definitively without hedging about unrelated amendments.

## Data

From investigation on 2026-04-02:
- 851 total AMENDS edges; 13 from title, 838 from body
- 203 change notices in the graph
- 185/203 (91%) have "CONTENT OF CHANGE" sections (titled or inline)
- 44/203 (22%) have "MAINTENANCE OF MANUAL" sections
- ~4 newer COLA notices (2024+) use "POLICY UPDATE" / "POLICY UPDATES" instead of "CONTENT OF CHANGE"
- NEMT notices use per-policy subsection headings like "A. MA-3550.VIII, Determining Need..."
- MA-2180 has 7 amendments; all are legitimate but one (02-11 LTC Partnership) confused the agent because its title seemed unrelated

## Non-goals

- Section-level AMENDS edges (fragile section-number parsing, only 22% have MAINTENANCE OF MANUAL sections)
- LLM-based amendment classification (overkill; structural extraction is sufficient)
- Changing the AMENDS edge set for already-correct links (the 02-11 -> MA-2180 edge is legitimate)
