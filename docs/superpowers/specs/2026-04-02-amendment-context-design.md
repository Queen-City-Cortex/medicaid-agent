# Amendment Context: Fix AMENDS Edge Quality and Agent Confusion

## Problem

The agent sometimes hedges or gives wrong answers when checking amendments, because:

1. **Missing context on AMENDS edges**: The pipeline extracts MA-numbers from ALL section text in change notices, creating correct edges but storing no information about WHAT was changed. The `getAmendments` tool fills `changeSummary` with the first random long section, which is often irrelevant to the target document.
2. **Noisy extraction scope**: 98.5% of AMENDS edges (838/851) come from body text, not title matches. Many are legitimate (COLA notices amend 10+ policies listed in their "CONTENT OF CHANGE" sections), but the current approach also picks up cross-references from BACKGROUND sections that happen to mention an MA-number.
3. **Rigid document-type routing**: The system prompt uses hard-coded rules like "HCWD -> clinical_policy first" that are wrong (HCWD is a dhhs_policy) and don't generalize.

### Concrete example

"What is the earned income limit for HCWD?" is a trick question (there is no earned income limit). The agent finds the right policy (MA-2180) and reads the correct section, but when it calls `getAmendments`, one result is titled "Long Term Care Partnership Program." The agent narrates: "amendment results included unrelated change notices, so I could not cleanly verify which HCWD income rule is the authoritative current version." The amendment IS real (it updated resource limits in MA-2180 IV.I.2), but the agent has no way to tell that from the title alone.

## Design

### 1. Pipeline: Restrict body extraction to amendment-signal sections

**File**: `packages/pipeline/src/pipeline/references/amendments.py`

Currently the Cypher query at lines 116-128 fetches ALL section texts for each change notice. Change the query to only return sections whose title or body contains "CONTENT OF CHANGE" or "MAINTENANCE OF MANUAL":

```
WHERE s.content_text IS NOT NULL
  AND (toLower(s.title) CONTAINS 'content of change'
    OR toLower(s.title) CONTAINS 'maintenance of manual'
    OR toLower(s.content_text) CONTAINS 'content of change'
    OR toLower(s.content_text) CONTAINS 'maintenance of manual')
```

This covers 91% of change notices (185/203 have "CONTENT OF CHANGE" sections). The remaining 9% fall back to title-only matching, which is the right tradeoff since their body text generates false positives.

Title-based MA-number extraction (line 140) remains unconditional.

### 2. Pipeline: Store `change_description` on AMENDS edges

For each AMENDS edge created from a body match, extract the sentence/paragraph around the MA-number mention and store it as a `change_description` property on the edge.

**Extraction logic**:
- Find the MA-number in the section text
- Grab from the previous period/newline to the next period/newline (~300 char cap)
- For "MAINTENANCE OF MANUAL" sections, grab the full "Remove: MA-XXXX..." line

**Cypher change**: `MERGE_AMENDS_BATCH` accepts `change_description` per pair:
```cypher
UNWIND $pairs AS pair
MATCH (src:Document {id: pair.source_id})
MATCH (tgt:Document {id: pair.target_id})
MERGE (src)-[r:AMENDS]->(tgt)
SET r.change_description = pair.change_description
```

For title-only matches where no body context exists, `change_description` is set to the change notice title.

### 3. Agent tool: Use `change_description` from the edge

**File**: `packages/agent/src/tools/navigate.ts`

Replace the runtime section-text query in `getAmendments` (lines 98-114) with reading `change_description` directly from the AMENDS relationship. The complex `OPTIONAL MATCH` + aggregation for `firstSectionText` is replaced by accessing `r.change_description` on the relationship.

The `changeSummary` field in the tool output now contains the pre-computed, target-specific excerpt instead of random section text.

### 4. Agent prompt: Replace routing rules with document taxonomy context

**File**: `packages/agent/src/index.ts`

Remove the rigid document-type routing block (lines 88-93) and the program-specific routing rule (line 109). Replace with taxonomy context that lets the agent make its own routing decisions:

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

### 5. Testing and verification

- **Pipeline unit test**: Update `test_amendments.py` to verify body extraction is restricted to "CONTENT OF CHANGE" sections. Add a test with a change notice that mentions an MA-number only in a BACKGROUND section and confirm no AMENDS edge is created for it.
- **Pipeline integration check**: After re-running `detect_amendments()`, verify edge count drops from 851 and spot-check that MA-2180's amendments retain the legitimate ones (01-14, 03-18, 03-25, etc.) with meaningful `change_description` values.
- **Agent smoke test**: Run "What is the earned income limit for HCWD?" through the CLI runner and verify the agent answers definitively without hedging about unrelated amendments.

## Data

From investigation on 2026-04-02:
- 851 total AMENDS edges; 13 from title, 838 from body
- 203 change notices in the graph
- 185/203 (91%) have "CONTENT OF CHANGE" sections
- 44/203 (22%) have "MAINTENANCE OF MANUAL" sections
- MA-2180 has 7 amendments; all are legitimate but one (02-11 LTC Partnership) confused the agent because its title seemed unrelated

## Non-goals

- Section-level AMENDS edges (fragile section-number parsing, only 22% have MAINTENANCE OF MANUAL sections)
- LLM-based amendment classification (overkill; structural extraction is sufficient)
- Changing the AMENDS edge set for already-correct links (the 02-11 -> MA-2180 edge is legitimate)
