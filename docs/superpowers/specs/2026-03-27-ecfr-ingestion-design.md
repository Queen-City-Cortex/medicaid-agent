# eCFR Federal Regulation Ingestion — Design Specification

**Project:** NC Medicaid Navigator — Layer 0.5
**Author:** Jeff Hoffman / Queen City Cortex LLC
**Date:** March 27, 2026
**Depends on:** Pipeline (complete, at `packages/pipeline/`)
**Location:** `packages/pipeline/src/pipeline/federal/` (new subpackage)

---

## 1. Purpose

Ingest Medicaid-relevant federal regulations from the eCFR API into the existing Neo4j knowledge graph. This resolves the 3,152 dangling CFR cross-references in the graph (the largest category of unresolved references) and enables the agent to do multi-hop reasoning from state policy to the federal law it implements.

### What This Does

- Fetches structured XML from the eCFR API for Medicaid-relevant 42 CFR parts
- Parses XML into Section nodes with proper hierarchy
- Loads into Neo4j as `document_type: 'federal_regulation'`
- Wires up the cross-reference resolver to resolve CFR citations
- Embeds federal regulation sections using the existing Voyage AI pipeline

### What This Does NOT Do

- Ingest the full CFR (only Medicaid-relevant parts)
- Track federal rulemaking or proposed rules
- Parse the Social Security Act (deferred — messier, less frequently cited)
- Replace the state policy corpus (federal regs are read-only reference nodes)

---

## 2. Scope

### CFR Parts to Ingest

Based on analysis of the 3,152 unresolved CFR references in the graph:

| CFR Part Range | Topic | References |
|---|---|---|
| 42 CFR 430-432 | Medicaid program administration | ~20 |
| 42 CFR 433-436 | Eligibility, FFP | ~30 |
| 42 CFR 438 | Managed care | ~800 |
| 42 CFR 440-442 | Services, covered services | ~400 |
| 42 CFR 447 | Payment | ~50 |
| 42 CFR 455-456 | Fraud/abuse, utilization control | ~30 |
| 42 CFR 441 | HCBS waivers (1915c/i) | ~200 |
| 42 CFR 457 | CHIP | ~600 |
| 42 CFR 484 | Home health services | ~100 |

**Total: ~375 unique CFR sections across ~15 Parts.**

Configuration:
```python
CFR_PARTS = [
    # Medicaid program
    (42, 430), (42, 431), (42, 432), (42, 433), (42, 434),
    (42, 435), (42, 436), (42, 438), (42, 440), (42, 441),
    (42, 442), (42, 447), (42, 455), (42, 456),
    # CHIP
    (42, 457),
    # Home health
    (42, 484),
]
```

### What's Excluded (for now)

- **45 CFR** — 50 references, mostly nondiscrimination (Part 92). Add later if needed.
- **Social Security Act** — referenced indirectly but rarely cited by section number in the NC Medicaid corpus.
- **CMS guidance documents** — not regulations, different source, different format.

---

## 3. eCFR API

### 3.1 API Endpoints

The eCFR provides a public REST API at `https://www.ecfr.gov/api/`:

**Full text of a CFR title (XML):**
```
GET https://www.ecfr.gov/api/versioner/v1/full/current/title-42.xml?part=440
```

Returns the full XML for a specific part within a title. The XML is well-structured with hierarchy:
```xml
<DIV5 N="440.1" TYPE="SECTION">
  <HEAD>§ 440.1 Basis and purpose.</HEAD>
  <P>This subpart implements section 1905(a) of the Act...</P>
</DIV5>
```

**Structure metadata:**
```
GET https://www.ecfr.gov/api/versioner/v1/structure/current/title-42.json?part=440
```

Returns the table of contents with section numbers and titles (JSON). Useful for building the section tree without parsing the full XML.

### 3.2 XML Structure

eCFR XML uses `DIV` elements with numeric suffixes for hierarchy:
- `DIV1` = Title
- `DIV3` = Subchapter
- `DIV4` = Part
- `DIV5` = Section (the primary unit — `§ 440.70`)
- `DIV6` = Subsection (within a section, sometimes)
- `DIV8` = Subpart

The `N` attribute contains the section number (e.g., `N="440.70"`).

Content elements:
- `<HEAD>` — section heading
- `<P>` — paragraph
- `<FP>` — flush paragraph
- `<EXTRACT>` — quoted/indented text
- `<GPOTABLE>` — table (with `<ROW>` and `<ENT>` elements)

### 3.3 Rate Limiting

The eCFR API is public and doesn't require authentication. Be polite:
- 1 request per second
- Cache responses locally (federal regs don't change mid-day)
- User-Agent: same as crawler (`NCMedicaidNavigator/1.0`)

---

## 4. Architecture

### 4.1 Data Flow

```
eCFR API (XML)  →  parser.py  →  Section dicts  →  loader.py  →  Neo4j
                                                                  (:Document {document_type: 'federal_regulation'})
                                                                  (:Section)
                                                                  + resolve CFR cross-references
                                                                  + embed via existing pipeline
```

### 4.2 Graph Modeling

**Document nodes** — one per CFR Part:
```
(:Document {
  id: "doc:federal_regulation:42-CFR-440",
  title: "42 CFR Part 440 — Services: General Provisions",
  document_type: "federal_regulation",
  policy_number: "42-CFR-440",
  category: "federal",
  status: "current",
  source_url: "https://www.ecfr.gov/current/title-42/part-440",
  last_indexed: datetime()
})
```

**Section nodes** — one per CFR section (§):
```
(:Section {
  id: "sec:doc:federal_regulation:42-CFR-440:440.70",
  document_id: "doc:federal_regulation:42-CFR-440",
  section_number: "440.70",
  title: "Home health services",
  level: 1,
  content_text: "...",
  content_length: ...,
  has_tables: false,
  has_definitions: false
})
```

Subsections within a CFR section (e.g., `(a)`, `(b)`, `(b)(3)`) are included in the parent section's `content_text`, not as separate Section nodes. CFR sections are typically short enough that this is fine for embedding.

**Relationships** — same as existing: `HAS_SECTION`, `PARENT_OF`, `NEXT_SIBLING`. Federal docs connect to state docs via the cross-reference resolver.

### 4.3 Cross-Reference Resolution

Update `references/resolver.py` to resolve CFR citations:

```
Input: "42 CFR 440.70" or "42 CFR §440.70" or "42CFR § 440.70(b)(3)"
1. Parse: title=42, section=440.70
2. Derive part: 440 (integer part of section number)
3. Look up: doc_id = "doc:federal_regulation:42-CFR-440"
4. Look up: section with section_number = "440.70" in that document
5. Create REFERENCES edge from source section to target section
```

The regex already captures CFR citations. The resolver just needs the lookup logic.

---

## 5. Project Structure

```
packages/pipeline/src/pipeline/federal/
├── __init__.py
├── ecfr_client.py          # Fetch XML from eCFR API, cache locally
├── parser.py               # Parse eCFR XML into section dicts
└── loader.py               # Load parsed sections into Neo4j
```

### 5.1 New Files

**`ecfr_client.py`** — HTTP client for the eCFR API:
- `fetch_part_xml(title, part)` — GET the XML for a CFR part, cache to `data/ecfr-cache/`
- `fetch_structure(title, part)` — GET the structure JSON (for TOC/titles)
- Local file cache: `data/ecfr-cache/title-42-part-440.xml` (skip fetch if cached and < 90 days old)
- 1-second delay between requests
- Same User-Agent as crawler

**`parser.py`** — XML parsing:
- `parse_part_xml(xml_text, title, part)` — returns list of section dicts
- Each section dict has: `section_number`, `title`, `content_text`, `level`
- Handles `<P>`, `<FP>`, `<EXTRACT>`, `<GPOTABLE>` content elements
- Strips heading markers (`§ 440.70`)

**`loader.py`** — Neo4j loading:
- `load_cfr_part(title, part)` — fetch, parse, and load one CFR part
- `load_all_cfr()` — iterate `CFR_PARTS` config, load each
- Reuses existing `graph/queries.py` MERGE patterns
- After loading all parts, re-runs cross-reference resolution for CFR references

### 5.2 Modified Files

**`config.py`** — add:
```python
ECFR_API_BASE = "https://www.ecfr.gov/api/versioner/v1"
ECFR_CACHE_DIR = PROJECT_ROOT / "data" / "ecfr-cache"
ECFR_CACHE_MAX_AGE_DAYS = 90
CFR_PARTS = [(42, p) for p in [430, 431, 432, 433, 434, 435, 436, 438, 440, 441, 442, 447, 455, 456, 457, 484]]
```

**`references/resolver.py`** — add `resolve_cfr_reference()`:
- Parse CFR citation to extract title and section number
- Look up the corresponding Document and Section in the graph
- Create `REFERENCES` edge

**`references/extractor.py`** — improve the CFR regex to normalize citations:
- Handle variations: `42 CFR 440.70`, `42 CFR §440.70`, `42CFR § 440.70`, `42 CFR§ 440.70`
- Extract subsection references like `(b)(3)` (store in reference_text but resolve to the parent section)

**`cli.py`** — add `ingest-cfr` command:
```bash
python -m pipeline.cli ingest-cfr              # Fetch, parse, load all configured CFR parts
python -m pipeline.cli ingest-cfr --part 440    # Specific part only
python -m pipeline.cli ingest-cfr --refresh     # Force re-fetch even if cached
```

**`cli.py`** — update `run-all` to include `ingest-cfr` after `load` and before `extract-refs`.

**`.gitignore`** — add `data/ecfr-cache/`

---

## 6. Testing

### Unit Tests

**`tests/test_ecfr_parser.py`:**
- Save a small XML fixture (one CFR section from a real eCFR response)
- Test section number extraction, title parsing, content extraction
- Test `<GPOTABLE>` table handling
- Test hierarchy (Part → Subpart → Section)

**`tests/test_cfr_resolver.py`:**
- Test CFR citation parsing: `42 CFR 440.70` → `(title=42, section="440.70", part=440)`
- Test normalization of variant formats
- Test subsection stripping: `440.70(b)(3)` → resolves to section `440.70`

### Integration Test

After loading CFR parts, re-run `extract-refs` and verify that the previously unresolved CFR references now resolve. Check:
- `42 CFR 438.10` (163 references — most cited) resolves to a Section node
- `42 CFR 440.70` (Home Health) resolves correctly
- Unresolved federal_regulation count drops from 3,152 to near zero

---

## 7. Success Criteria

1. All 16 configured CFR parts fetched, parsed, and loaded into Neo4j.
2. Federal regulation Document and Section nodes visible in Neo4j Browser.
3. Re-running `extract-refs` resolves >90% of the 3,152 CFR references (some may use non-standard citation formats).
4. `stats` command shows federal_regulation documents and sections.
5. Vector search for "home health services eligibility requirements" returns both state policy sections AND the relevant 42 CFR 440.70 section.
6. No data loss — all section text preserved, chunked if needed.
