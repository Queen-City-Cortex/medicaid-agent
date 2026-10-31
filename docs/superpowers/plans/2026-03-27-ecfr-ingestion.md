# eCFR Federal Regulation Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest Medicaid-relevant 42 CFR parts from the eCFR API into the Neo4j knowledge graph and resolve the 3,152 dangling federal regulation cross-references.

**Architecture:** Fetch structured XML from the eCFR REST API, parse sections with Python's `xml.etree.ElementTree`, load as Document/Section nodes into the existing Neo4j graph, then re-run cross-reference resolution so state policy sections link to the federal sections they cite.

**Tech Stack:** Python 3.14, xml.etree.ElementTree, httpx (or urllib), Neo4j, existing pipeline infrastructure

**Spec:** `docs/superpowers/specs/2026-03-27-ecfr-ingestion-design.md`

---

## File Map

| File | Responsibility |
|---|---|
| `packages/pipeline/src/pipeline/config.py` | Add eCFR config constants (modify) |
| `packages/pipeline/src/pipeline/federal/__init__.py` | Package init (create) |
| `packages/pipeline/src/pipeline/federal/ecfr_client.py` | Fetch XML from eCFR API with local file cache (create) |
| `packages/pipeline/src/pipeline/federal/parser.py` | Parse eCFR XML into section dicts (create) |
| `packages/pipeline/src/pipeline/federal/loader.py` | Load parsed CFR sections into Neo4j (create) |
| `packages/pipeline/src/pipeline/references/resolver.py` | Add CFR reference resolution branch (modify) |
| `packages/pipeline/src/pipeline/cli.py` | Add `ingest-cfr` command, update `run-all` and `stats` (modify) |
| `packages/pipeline/.gitignore` | Add `data/ecfr-cache/` (modify) |
| `packages/pipeline/tests/test_ecfr_parser.py` | XML parser tests against fixture (create) |
| `packages/pipeline/tests/test_cfr_resolver.py` | CFR citation parsing tests (create) |
| `packages/pipeline/tests/fixtures/ecfr-sample.xml` | Real eCFR XML fixture for tests (create) |

---

### Task 1: Config & Project Setup

**Files:**
- Modify: `packages/pipeline/src/pipeline/config.py`
- Create: `packages/pipeline/src/pipeline/federal/__init__.py`
- Modify: `packages/pipeline/.gitignore`

- [ ] **Step 1: Add eCFR config constants**

Add to the end of `packages/pipeline/src/pipeline/config.py`:

```python
# eCFR (Federal Regulations)
ECFR_API_BASE = "https://www.ecfr.gov/api/versioner/v1"
ECFR_CACHE_DIR = PROJECT_ROOT / "data" / "ecfr-cache"
ECFR_CACHE_MAX_AGE_DAYS = 90
CFR_PARTS = [(42, p) for p in [
    430, 431, 432, 433, 434, 435, 436, 438,
    440, 441, 442, 447, 455, 456, 457, 484,
]]
```

- [ ] **Step 2: Create federal package**

```bash
mkdir -p packages/pipeline/src/pipeline/federal
touch packages/pipeline/src/pipeline/federal/__init__.py
```

- [ ] **Step 3: Update .gitignore**

Append to `packages/pipeline/.gitignore`:

```
data/ecfr-cache/
```

- [ ] **Step 4: Create cache directory**

```bash
mkdir -p packages/pipeline/data/ecfr-cache
```

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/config.py packages/pipeline/src/pipeline/federal/ packages/pipeline/.gitignore
git commit -m "feat(pipeline): add eCFR config and federal package scaffold"
```

---

### Task 2: eCFR API Client

**Files:**
- Create: `packages/pipeline/src/pipeline/federal/ecfr_client.py`

- [ ] **Step 1: Write the eCFR client**

Write `packages/pipeline/src/pipeline/federal/ecfr_client.py`:

```python
"""Fetch XML from the eCFR API with local file caching."""

import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from rich.console import Console

from pipeline.config import ECFR_API_BASE, ECFR_CACHE_DIR, ECFR_CACHE_MAX_AGE_DAYS

console = Console()

USER_AGENT = "NCMedicaidNavigator/1.0 (+https://queencitycortex.com/crawler-info)"


def _cache_path(title: int, part: int, suffix: str = ".xml") -> Path:
    """Get the local cache file path for a CFR part."""
    return ECFR_CACHE_DIR / f"title-{title}-part-{part}{suffix}"


def _is_cache_fresh(path: Path) -> bool:
    """Check if a cached file exists and is younger than the max age."""
    if not path.exists():
        return False
    mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
    age_days = (datetime.now(timezone.utc) - mtime).days
    return age_days < ECFR_CACHE_MAX_AGE_DAYS


def fetch_part_xml(title: int, part: int, refresh: bool = False) -> str:
    """
    Fetch the full XML for a CFR part from the eCFR API.

    Caches locally to avoid repeated requests. Returns the XML text.
    """
    cache = _cache_path(title, part, ".xml")

    if not refresh and _is_cache_fresh(cache):
        return cache.read_text(encoding="utf-8")

    url = f"{ECFR_API_BASE}/full/current/title-{title}.xml?part={part}"
    console.print(f"  Fetching {url}...")

    ECFR_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as response:
        xml_text = response.read().decode("utf-8")

    cache.write_text(xml_text, encoding="utf-8")

    # Rate limit: 1 request per second
    time.sleep(1)

    return xml_text


def fetch_structure(title: int, part: int, refresh: bool = False) -> str:
    """
    Fetch the structure JSON for a CFR part from the eCFR API.

    Used to get TOC and section titles. Returns the JSON text.
    """
    cache = _cache_path(title, part, ".json")

    if not refresh and _is_cache_fresh(cache):
        return cache.read_text(encoding="utf-8")

    url = f"{ECFR_API_BASE}/structure/current/title-{title}.json?part={part}"
    console.print(f"  Fetching structure {url}...")

    ECFR_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as response:
        json_text = response.read().decode("utf-8")

    cache.write_text(json_text, encoding="utf-8")

    time.sleep(1)

    return json_text
```

- [ ] **Step 2: Verify import**

Run: `cd packages/pipeline && .venv/bin/python -c "from pipeline.federal.ecfr_client import fetch_part_xml; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/pipeline/federal/ecfr_client.py
git commit -m "feat(pipeline): add eCFR API client with local file caching"
```

---

### Task 3: Fetch a Real XML Sample & Examine Structure

**Files:**
- Create: `packages/pipeline/tests/fixtures/ecfr-sample.xml`

This task has the implementer fetch one real CFR part, examine the XML structure, and save a fixture. This is critical — the spec's DIV hierarchy mapping may not match reality.

- [ ] **Step 1: Fetch 42 CFR Part 440 XML**

```bash
cd packages/pipeline && .venv/bin/python -c "
from pipeline.federal.ecfr_client import fetch_part_xml
xml = fetch_part_xml(42, 440)
print(f'Fetched {len(xml)} bytes')
# Show the first 3000 chars to understand structure
print(xml[:3000])
"
```

- [ ] **Step 2: Examine the XML structure**

Look at the actual XML to determine:
- What DIV levels are used (DIV1? DIV5? DIV8?)
- Where section headings appear (`<HEAD>` tags)
- Where the `N` attribute with section numbers lives
- How `<P>`, `<FP>`, `<EXTRACT>`, `<GPOTABLE>` appear

Run:
```bash
cd packages/pipeline && .venv/bin/python -c "
import xml.etree.ElementTree as ET
xml = open('data/ecfr-cache/title-42-part-440.xml').read()
root = ET.fromstring(xml)

# Find all unique tag names
tags = set()
def walk(el, depth=0):
    tags.add(el.tag)
    if depth < 3:
        for child in el:
            walk(child, depth + 1)
walk(root)
print('Tags found:', sorted(tags))

# Find section elements (look for N attribute with section numbers)
for el in root.iter():
    n = el.get('N', '')
    if n and '.' in n and el.tag.startswith('DIV'):
        print(f'{el.tag} N={n} TYPE={el.get(\"TYPE\", \"\")}')
        # Show first child HEAD if any
        head = el.find('HEAD')
        if head is not None:
            print(f'  HEAD: {head.text}')
        break
"
```

Document findings before writing the parser.

- [ ] **Step 3: Save a small fixture**

Extract just one or two sections from the XML to use as a test fixture:

```bash
cd packages/pipeline && .venv/bin/python -c "
import xml.etree.ElementTree as ET
xml = open('data/ecfr-cache/title-42-part-440.xml').read()
root = ET.fromstring(xml)

# Find section elements and extract a small sample
# Save first 2 sections as a fixture
sections = []
for el in root.iter():
    n = el.get('N', '')
    t = el.get('TYPE', '')
    if t == 'SECTION' and '.' in n:
        sections.append(el)
        if len(sections) >= 3:
            break

# Build a minimal fixture XML
fixture_root = ET.Element('CFRDOC')
for s in sections:
    fixture_root.append(s)

fixture_xml = ET.tostring(fixture_root, encoding='unicode')
open('tests/fixtures/ecfr-sample.xml', 'w').write(fixture_xml)
print(f'Saved fixture with {len(sections)} sections')
"
```

- [ ] **Step 4: Commit fixture**

```bash
git add packages/pipeline/tests/fixtures/ecfr-sample.xml
git commit -m "test(pipeline): save eCFR XML fixture for parser tests"
```

---

### Task 4: eCFR XML Parser (TDD)

**Files:**
- Create: `packages/pipeline/tests/test_ecfr_parser.py`
- Create: `packages/pipeline/src/pipeline/federal/parser.py`

- [ ] **Step 1: Write the parser test**

Write `packages/pipeline/tests/test_ecfr_parser.py`:

```python
"""Test eCFR XML parser against real fixture."""

import pytest
from pathlib import Path

from pipeline.federal.parser import parse_part_xml

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def sample_xml():
    fixture = FIXTURES_DIR / "ecfr-sample.xml"
    if not fixture.exists():
        pytest.skip("No eCFR XML fixture available")
    return fixture.read_text()


class TestParsePartXml:
    def test_extracts_sections(self, sample_xml):
        sections = parse_part_xml(sample_xml, 42, 440)
        assert len(sections) > 0

    def test_sections_have_numbers(self, sample_xml):
        sections = parse_part_xml(sample_xml, 42, 440)
        for s in sections:
            assert s["section_number"] is not None
            assert "." in s["section_number"]  # e.g., "440.1"

    def test_sections_have_titles(self, sample_xml):
        sections = parse_part_xml(sample_xml, 42, 440)
        for s in sections:
            assert s["title"]  # Not empty

    def test_sections_have_content(self, sample_xml):
        sections = parse_part_xml(sample_xml, 42, 440)
        with_content = [s for s in sections if s["content_text"].strip()]
        assert len(with_content) > 0

    def test_section_ids_are_correct_format(self, sample_xml):
        sections = parse_part_xml(sample_xml, 42, 440)
        for s in sections:
            assert s["id"].startswith("sec:doc:federal_regulation:42-CFR-440:")

    def test_heading_markers_stripped(self, sample_xml):
        sections = parse_part_xml(sample_xml, 42, 440)
        for s in sections:
            # Title should not start with "§" — that should be stripped
            assert not s["title"].startswith("§")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/pipeline && .venv/bin/python -m pytest tests/test_ecfr_parser.py -v`
Expected: FAIL — cannot import `parser`.

- [ ] **Step 3: Write the parser**

Write `packages/pipeline/src/pipeline/federal/parser.py`:

The parser needs to adapt to the actual XML structure discovered in Task 3. The key logic:

```python
"""Parse eCFR XML into section dicts for Neo4j loading."""

import re
import xml.etree.ElementTree as ET


def parse_part_xml(xml_text: str, title: int, part: int) -> list[dict]:
    """
    Parse eCFR XML for a CFR part into a list of section dicts.

    Each dict has: id, section_number, title, content_text, content_length,
    level, has_tables, has_definitions, document_id
    """
    root = ET.fromstring(xml_text)
    doc_id = f"doc:federal_regulation:{title}-CFR-{part}"
    sections: list[dict] = []

    # Find all section elements
    # eCFR uses TYPE="SECTION" attribute on DIV elements
    for el in root.iter():
        el_type = el.get("TYPE", "")
        if el_type != "SECTION":
            continue

        section_number = el.get("N", "")
        if not section_number:
            continue

        # Extract heading
        head_el = el.find("HEAD")
        raw_title = head_el.text.strip() if head_el is not None and head_el.text else ""

        # Strip "§ 440.70" prefix from title
        clean_title = re.sub(r"^§\s*[\d.]+\s*", "", raw_title).strip()
        # Also strip trailing period
        clean_title = clean_title.rstrip(".")

        # Extract content text from all paragraph-like elements
        content_parts: list[str] = []
        has_tables = False
        has_definitions = False

        for child in el:
            tag = child.tag
            if tag == "HEAD":
                continue  # Already handled
            elif tag in ("P", "FP"):
                text = _extract_text(child)
                if text:
                    content_parts.append(text)
            elif tag == "EXTRACT":
                text = _extract_text(child)
                if text:
                    content_parts.append(f"  {text}")
            elif tag == "GPOTABLE":
                table_text = _extract_table(child)
                if table_text:
                    content_parts.append(table_text)
                    has_tables = True
            elif tag == "CITA":
                # Citation/authority — include as content
                text = _extract_text(child)
                if text:
                    content_parts.append(f"[Authority: {text}]")
            else:
                # Other elements — extract text content
                text = _extract_text(child)
                if text:
                    content_parts.append(text)

        content_text = "\n\n".join(content_parts)

        # Check for definitions
        if "definition" in clean_title.lower() or '"' in content_text[:500]:
            has_definitions = True

        section_id = f"sec:{doc_id}:{section_number}"

        sections.append({
            "id": section_id,
            "document_id": doc_id,
            "section_number": section_number,
            "title": clean_title or f"§ {section_number}",
            "level": 1,  # CFR sections are flat within a part
            "content_text": content_text.strip(),
            "content_length": len(content_text.strip()),
            "has_tables": has_tables,
            "has_definitions": has_definitions,
        })

    return sections


def _extract_text(element: ET.Element) -> str:
    """Recursively extract all text content from an XML element."""
    parts: list[str] = []
    if element.text:
        parts.append(element.text.strip())
    for child in element:
        child_text = _extract_text(child)
        if child_text:
            parts.append(child_text)
        if child.tail:
            parts.append(child.tail.strip())
    return " ".join(parts)


def _extract_table(table_el: ET.Element) -> str:
    """Extract a GPOTABLE element as markdown-like text."""
    rows: list[list[str]] = []
    for row_el in table_el.iter("ROW"):
        cells: list[str] = []
        for ent_el in row_el.iter("ENT"):
            cell_text = _extract_text(ent_el) if ent_el.text or len(ent_el) > 0 else ""
            cells.append(cell_text)
        if cells:
            rows.append(cells)

    if not rows:
        return ""

    # Format as simple text table
    lines: list[str] = []
    for row in rows:
        lines.append(" | ".join(row))
    return "\n".join(lines)
```

- [ ] **Step 4: Run parser tests — iterate until they pass**

Run: `cd packages/pipeline && .venv/bin/python -m pytest tests/test_ecfr_parser.py -v`

The parser may need adjustments based on the actual XML structure from Task 3. Adapt the element finding logic to match reality.

Expected: All PASS.

- [ ] **Step 5: Run ALL tests**

Run: `cd packages/pipeline && .venv/bin/python -m pytest tests/ -v`
Expected: All pass (existing + new).

- [ ] **Step 6: Commit**

```bash
git add packages/pipeline/src/pipeline/federal/parser.py packages/pipeline/tests/test_ecfr_parser.py
git commit -m "feat(pipeline): add eCFR XML parser with section extraction"
```

---

### Task 5: Federal Regulation Loader

**Files:**
- Create: `packages/pipeline/src/pipeline/federal/loader.py`

- [ ] **Step 1: Write the loader**

Write `packages/pipeline/src/pipeline/federal/loader.py`:

```python
"""Load parsed CFR sections into Neo4j."""

from rich.console import Console

from pipeline.config import CFR_PARTS
from pipeline.federal.ecfr_client import fetch_part_xml
from pipeline.federal.parser import parse_part_xml
from pipeline.graph.connection import get_session
from pipeline.graph import queries
from pipeline.graph.schema import ensure_schema

console = Console()


def load_cfr_part(title: int, part: int, refresh: bool = False) -> dict:
    """Fetch, parse, and load one CFR part into Neo4j. Returns stats."""
    xml_text = fetch_part_xml(title, part, refresh=refresh)
    sections = parse_part_xml(xml_text, title, part)

    doc_id = f"doc:federal_regulation:{title}-CFR-{part}"

    with get_session() as session:
        # MERGE document node
        session.run(queries.MERGE_DOCUMENT, {
            "id": doc_id,
            "title": f"{title} CFR Part {part}",
            "document_type": "federal_regulation",
            "policy_number": f"{title}-CFR-{part}",
            "category": "federal",
            "status": "current",
            "source_url": f"https://www.ecfr.gov/current/title-{title}/part-{part}",
            "local_path": "",
            "pdf_path": "",
            "page_count": 0,
            "section_count": len(sections),
        })

        # MERGE section nodes
        prev_section_id = None
        for section in sections:
            session.run(queries.MERGE_SECTION, {
                "id": section["id"],
                "document_id": doc_id,
                "section_number": section["section_number"],
                "title": section["title"],
                "level": section["level"],
                "content_text": section["content_text"],
                "content_length": section["content_length"],
                "has_tables": section["has_tables"],
                "has_definitions": section["has_definitions"],
            })

            # HAS_SECTION edge
            session.run(queries.MERGE_HAS_SECTION, {
                "doc_id": doc_id,
                "sec_id": section["id"],
            })

            # NEXT_SIBLING edge
            if prev_section_id:
                session.run(queries.MERGE_NEXT_SIBLING, {
                    "prev_id": prev_section_id,
                    "next_id": section["id"],
                })
            prev_section_id = section["id"]

    return {
        "document_id": doc_id,
        "sections": len(sections),
    }


def load_all_cfr(part_filter: int | None = None, refresh: bool = False) -> dict:
    """Load all configured CFR parts into Neo4j."""
    ensure_schema()

    stats = {"parts_loaded": 0, "sections_total": 0, "errors": 0}

    parts = CFR_PARTS
    if part_filter:
        parts = [(t, p) for t, p in parts if p == part_filter]

    console.print(f"[bold]Loading {len(parts)} CFR parts...[/bold]")

    for title, part in parts:
        try:
            console.print(f"  {title} CFR Part {part}...", end=" ")
            result = load_cfr_part(title, part, refresh=refresh)
            console.print(f"[green]OK[/green] ({result['sections']} sections)")
            stats["parts_loaded"] += 1
            stats["sections_total"] += result["sections"]
        except Exception as e:
            console.print(f"[red]ERROR: {e}[/red]")
            stats["errors"] += 1

    return stats
```

- [ ] **Step 2: Verify import**

Run: `cd packages/pipeline && .venv/bin/python -c "from pipeline.federal.loader import load_all_cfr; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/pipeline/federal/loader.py
git commit -m "feat(pipeline): add CFR graph loader for Neo4j"
```

---

### Task 6: CFR Cross-Reference Resolver (TDD)

**Files:**
- Create: `packages/pipeline/tests/test_cfr_resolver.py`
- Modify: `packages/pipeline/src/pipeline/references/resolver.py`

- [ ] **Step 1: Write the resolver test**

Write `packages/pipeline/tests/test_cfr_resolver.py`:

```python
"""Test CFR citation parsing and normalization."""

import pytest
from pipeline.references.resolver import parse_cfr_citation


class TestParseCfrCitation:
    def test_standard_format(self):
        result = parse_cfr_citation("42 CFR 440.70")
        assert result == {"title": 42, "section": "440.70", "part": 440}

    def test_with_section_symbol(self):
        result = parse_cfr_citation("42 CFR §440.70")
        assert result == {"title": 42, "section": "440.70", "part": 440}

    def test_with_spaced_section_symbol(self):
        result = parse_cfr_citation("42 CFR § 440.70")
        assert result == {"title": 42, "section": "440.70", "part": 440}

    def test_no_space_before_cfr(self):
        result = parse_cfr_citation("42CFR § 440.70")
        assert result == {"title": 42, "section": "440.70", "part": 440}

    def test_with_subsection(self):
        # Subsection (b)(3) should be stripped — resolve to parent section
        result = parse_cfr_citation("42 CFR 440.70(b)(3)")
        assert result == {"title": 42, "section": "440.70", "part": 440}

    def test_three_digit_part(self):
        result = parse_cfr_citation("42 CFR 438.10")
        assert result == {"title": 42, "section": "438.10", "part": 438}

    def test_deep_section(self):
        result = parse_cfr_citation("42 CFR 484.4")
        assert result == {"title": 42, "section": "484.4", "part": 484}

    def test_title_45(self):
        result = parse_cfr_citation("45 CFR 92.42")
        assert result == {"title": 45, "section": "92.42", "part": 92}

    def test_invalid_format(self):
        result = parse_cfr_citation("not a cfr citation")
        assert result is None

    def test_from_target_id_format(self):
        # The extractor produces target_ids like "42 CFR 440.70"
        result = parse_cfr_citation("42 CFR 440.70")
        assert result is not None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/pipeline && .venv/bin/python -m pytest tests/test_cfr_resolver.py -v`
Expected: FAIL — `parse_cfr_citation` doesn't exist.

- [ ] **Step 3: Add `parse_cfr_citation` and CFR resolution to resolver.py**

Add to `packages/pipeline/src/pipeline/references/resolver.py`:

At the top of the file (after imports), add:

```python
import re

CFR_CITATION_RE = re.compile(
    r"(\d+)\s*CFR\s*§?\s*([\d]+(?:\.[\d]+)*)"
)
```

Add the `parse_cfr_citation` function:

```python
def parse_cfr_citation(text: str) -> dict | None:
    """
    Parse a CFR citation string into its components.

    Input: "42 CFR 440.70" or "42 CFR §440.70(b)(3)"
    Output: {"title": 42, "section": "440.70", "part": 440}
    """
    match = CFR_CITATION_RE.search(text)
    if not match:
        return None

    title = int(match.group(1))
    section = match.group(2)

    # Strip subsection references like (b)(3) — they're after the section number
    # The regex already captures just the numeric part

    # Derive part number: integer part of section number (before the dot)
    part = int(section.split(".")[0])

    return {"title": title, "section": section, "part": part}
```

Add the CFR branch to `resolve_reference()` — after the `elif ref.ref_type == "section":` block, add:

```python
        elif ref.ref_type == "federal_regulation":
            parsed = parse_cfr_citation(ref.target_id)
            if parsed:
                doc_id = f"doc:federal_regulation:{parsed['title']}-CFR-{parsed['part']}"
                result = session.run(
                    "MATCH (s:Section {document_id: $doc_id, section_number: $sn}) RETURN s.id",
                    {"doc_id": doc_id, "sn": parsed["section"]},
                )
                record = result.single()
                if record:
                    return {
                        "resolved": True,
                        "target_node_id": record["s.id"],
                        "target_type": "section",
                        "edge_type": "REFERENCES",
                    }
```

- [ ] **Step 4: Run CFR resolver tests**

Run: `cd packages/pipeline && .venv/bin/python -m pytest tests/test_cfr_resolver.py -v`
Expected: All PASS.

- [ ] **Step 5: Run ALL tests**

Run: `cd packages/pipeline && .venv/bin/python -m pytest tests/ -v`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add packages/pipeline/src/pipeline/references/resolver.py packages/pipeline/tests/test_cfr_resolver.py
git commit -m "feat(pipeline): add CFR citation parsing and cross-reference resolution"
```

---

### Task 7: CLI Commands & Stats Update

**Files:**
- Modify: `packages/pipeline/src/pipeline/cli.py`

- [ ] **Step 1: Add `ingest-cfr` command**

Add to `packages/pipeline/src/pipeline/cli.py`:

```python
@cli.command("ingest-cfr")
@click.option("--part", type=int, help="Ingest only this CFR part number")
@click.option("--refresh", is_flag=True, help="Force re-fetch even if cached (use when CMS finalizes major rules)")
def ingest_cfr(part: int | None, refresh: bool):
    """Fetch and load Medicaid-relevant federal regulations from eCFR."""
    from pipeline.federal.loader import load_all_cfr

    stats = load_all_cfr(part_filter=part, refresh=refresh)
    console.print(f"\n[bold]eCFR ingest complete:[/bold] {stats['parts_loaded']} parts, {stats['sections_total']} sections, {stats['errors']} errors")
```

- [ ] **Step 2: Update `stats` to show federal vs state breakdown**

In the `stats` command, replace the simple node count with a breakdown:

After the existing node count loop, add:

```python
        # Federal vs state document breakdown
        doc_breakdown = session.run("""
            MATCH (d:Document)
            WITH d.document_type AS doc_type, count(d) AS cnt
            RETURN doc_type, cnt ORDER BY doc_type
        """)
        console.print("\n[bold]Documents by type:[/bold]")
        for r in doc_breakdown:
            console.print(f"  {r['doc_type']}: {r['cnt']}")
```

- [ ] **Step 3: Update `run-all` to include `ingest-cfr`**

In the `run_all` function, add after Stage 2 (Load) and before Stage 3 (Cross-references):

```python
    console.print("[bold]Stage 2.5: Federal Regulations[/bold]")
    from pipeline.federal.loader import load_all_cfr
    cfr_stats = load_all_cfr()
    console.print(f"  {cfr_stats['parts_loaded']} CFR parts, {cfr_stats['sections_total']} sections\n")
```

- [ ] **Step 4: Verify CLI**

Run: `cd packages/pipeline && .venv/bin/python -m pipeline.cli --help`
Expected: Shows `ingest-cfr` command.

Run: `cd packages/pipeline && .venv/bin/python -m pipeline.cli ingest-cfr --help`
Expected: Shows `--part` and `--refresh` options.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/cli.py
git commit -m "feat(pipeline): add ingest-cfr CLI command and federal/state stats breakdown"
```

---

### Task 8: End-to-End Integration Test

This validates the full flow: fetch → parse → load → resolve → embed.

- [ ] **Step 1: Ingest all CFR parts**

```bash
cd packages/pipeline && .venv/bin/python -m pipeline.cli ingest-cfr
```

Expected: 16 CFR parts fetched, parsed, and loaded. Watch for errors.

- [ ] **Step 2: Check stats**

```bash
cd packages/pipeline && .venv/bin/python -m pipeline.cli stats
```

Expected: Shows federal_regulation documents and sections alongside state documents.

- [ ] **Step 3: Re-run cross-reference extraction**

```bash
cd packages/pipeline && .venv/bin/python -m pipeline.cli extract-refs
```

Expected: The `resolved` count should increase significantly. The `federal_regulation` unresolved count should drop from ~3,152 to well under 500.

- [ ] **Step 4: Verify a specific cross-reference end-to-end**

Pick a state policy section that cites `42 CFR 438.10` (the most-cited section at 163 references) and verify the REFERENCES edge exists:

```bash
cd packages/pipeline && .venv/bin/python -c "
from pipeline.graph.connection import get_session

with get_session() as session:
    result = session.run('''
        MATCH (state:Section)-[r:REFERENCES]->(fed:Section)
        WHERE fed.section_number = '438.10'
        RETURN state.document_id, state.section_number, r.reference_text
        LIMIT 5
    ''')
    print('State sections referencing 42 CFR 438.10:')
    for rec in result:
        print(f'  {rec[\"state.document_id\"]} {rec[\"state.section_number\"]} -> \"{rec[\"r.reference_text\"]}\"')
"
```

Expected: Shows state policy sections with REFERENCES edges to the federal section.

- [ ] **Step 5: Embed federal regulation sections**

```bash
cd packages/pipeline && VOYAGE_API_KEY="$VOYAGE_API_KEY" .venv/bin/python -m pipeline.cli embed
```

Expected: Embeds the new federal regulation sections (they should be short, so no chunking needed for most).

- [ ] **Step 6: Test vector search with federal context**

```bash
cd packages/pipeline && VOYAGE_API_KEY="$VOYAGE_API_KEY" .venv/bin/python -m pipeline.cli search "home health services eligibility requirements"
```

Expected: Results should include BOTH state policy sections AND the relevant 42 CFR 440.70 section.

- [ ] **Step 7: Run all tests**

```bash
cd packages/pipeline && .venv/bin/python -m pytest tests/ -v
```

- [ ] **Step 8: Check unresolved references**

```bash
cd packages/pipeline && .venv/bin/python -c "
import json
from collections import Counter
data = json.loads(open('data/unresolved-references.json').read())
types = Counter(r['ref_type'] for r in data)
print('Remaining unresolved by type:')
for t, c in types.most_common():
    print(f'  {t}: {c}')
"
```

Expected: `federal_regulation` count well below 500 (most resolved).

- [ ] **Step 9: Final commit**

```bash
git add packages/pipeline/
git commit -m "feat(pipeline): complete eCFR ingestion with cross-reference resolution"
```
