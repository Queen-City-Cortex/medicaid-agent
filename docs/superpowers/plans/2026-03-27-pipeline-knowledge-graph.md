# Document Pipeline + Knowledge Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pipeline that transforms crawled NC Medicaid PDFs into a Neo4j knowledge graph with vector embeddings for semantic search.

**Architecture:** Three-stage pipeline (Parse → Load → Embed) in Python. Docling converts PDFs to structured JSON. A graph loader creates Document/Section/PolicyConcept nodes with cross-reference edges in Neo4j. Voyage AI generates embeddings stored on Section nodes with a Neo4j vector index.

**Tech Stack:** Python 3.14, Docling, Neo4j Community (Docker), Voyage AI, Click, Pydantic, Rich

**Spec:** `docs/superpowers/specs/2026-03-27-pipeline-knowledge-graph-design.md`

---

## File Map

| File | Responsibility |
|---|---|
| `packages/pipeline/pyproject.toml` | Dependencies (modify existing) |
| `packages/pipeline/src/pipeline/__init__.py` | Package init (exists) |
| `packages/pipeline/src/pipeline/config.py` | Paths, Neo4j connection, API keys from env vars |
| `packages/pipeline/src/pipeline/cli.py` | Click CLI with all subcommands |
| `packages/pipeline/src/pipeline/parse/__init__.py` | Parse package init |
| `packages/pipeline/src/pipeline/parse/converter.py` | Docling DocumentConverter setup, PDF→JSON+MD+metadata |
| `packages/pipeline/src/pipeline/parse/post_process.py` | Section number extraction, hierarchy repair |
| `packages/pipeline/src/pipeline/graph/__init__.py` | Graph package init |
| `packages/pipeline/src/pipeline/graph/connection.py` | Neo4j driver setup, session context manager |
| `packages/pipeline/src/pipeline/graph/schema.py` | Constraint + index creation |
| `packages/pipeline/src/pipeline/graph/loader.py` | Parsed JSON → Neo4j Document/Section nodes + edges |
| `packages/pipeline/src/pipeline/graph/queries.py` | Reusable Cypher query templates |
| `packages/pipeline/src/pipeline/references/__init__.py` | References package init |
| `packages/pipeline/src/pipeline/references/extractor.py` | Regex-based cross-reference extraction |
| `packages/pipeline/src/pipeline/references/resolver.py` | Reference → graph node resolution |
| `packages/pipeline/src/pipeline/embeddings/__init__.py` | Embeddings package init |
| `packages/pipeline/src/pipeline/embeddings/generator.py` | Voyage AI embedding generation with batching |
| `packages/pipeline/src/pipeline/embeddings/indexer.py` | Neo4j vector index creation + population |
| `packages/pipeline/src/pipeline/concepts/__init__.py` | Concepts package init |
| `packages/pipeline/src/pipeline/concepts/seed.py` | PolicyConcept seed data + Neo4j loading |
| `packages/pipeline/src/pipeline/concepts/linker.py` | Concept-Section relationship creation |
| `packages/pipeline/tests/test_post_process.py` | Section number + hierarchy tests |
| `packages/pipeline/tests/test_extractor.py` | Cross-reference regex tests |
| `packages/pipeline/tests/test_resolver.py` | Reference resolution tests |
| `packages/pipeline/tests/test_loader.py` | Graph loader tests (synthetic DoclingDocument) |
| `packages/pipeline/tests/fixtures/` | Sample Docling JSON outputs |

---

### Task 1: Project Setup — Config & Dependencies

**Files:**
- Modify: `packages/pipeline/pyproject.toml`
- Create: `packages/pipeline/src/pipeline/config.py`
- Create: `packages/pipeline/.gitignore` (update)

- [ ] **Step 1: Update pyproject.toml with all dependencies**

Edit `packages/pipeline/pyproject.toml`:

```toml
[project]
name = "nc-medicaid-pipeline"
version = "1.0.0"
description = "Document parsing pipeline for NC Medicaid policy documents"
requires-python = ">=3.11"
dependencies = [
    "docling>=2.0",
    "docling-core>=2.8",
    "neo4j>=5.25",
    "voyageai>=0.3",
    "click>=8.0",
    "pydantic>=2.0",
    "rich>=13.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "ruff>=0.4",
]

[build-system]
requires = ["setuptools>=75.0"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
where = ["src"]

[tool.ruff]
src = ["src"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 2: Install dependencies**

Run: `cd packages/pipeline && .venv/bin/pip install -e '.[dev]'`
Expected: All packages install successfully.

- [ ] **Step 3: Create config.py**

Write `packages/pipeline/src/pipeline/config.py`:

```python
from pathlib import Path
import os

# Project root is packages/pipeline/
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# Crawler paths (sibling package in monorepo)
CRAWLER_DATA_DIR = PROJECT_ROOT.parent / "crawler" / "data" / "documents"
CRAWLER_DB_PATH = PROJECT_ROOT.parent / "crawler" / "data" / "crawler.db"

# Pipeline output
PARSED_DATA_DIR = PROJECT_ROOT / "data" / "parsed"

# Neo4j
NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "medicaid-dev")
NEO4J_DATABASE = os.environ.get("NEO4J_DATABASE", "neo4j")

# Embedding
EMBEDDING_MODEL = "voyage-law-2"
EMBEDDING_DIMENSIONS = 1024
VOYAGE_API_KEY = os.environ.get("VOYAGE_API_KEY", "")

# LLM (optional, for cross-reference extraction pass 2)
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
LLM_MODEL = "claude-haiku-4-5-20251001"

# Processing
PARSE_BATCH_SIZE = 10
EMBED_BATCH_SIZE = 128

# Source type directory mapping (must match crawler's SOURCE_TYPE_DIRS)
SOURCE_TYPE_DIRS = {
    "clinical_policy": "clinical-policies",
    "bulletin": "bulletins",
    "state_plan_amendment": "state-plan-amendments",
    "waiver": "waivers",
}
```

- [ ] **Step 4: Update .gitignore**

Append to `packages/pipeline/.gitignore`:

```
data/parsed/
data/unresolved-references.json
```

- [ ] **Step 5: Create package directories**

```bash
mkdir -p packages/pipeline/src/pipeline/{parse,graph,references,embeddings,concepts}
mkdir -p packages/pipeline/tests/fixtures
mkdir -p packages/pipeline/data/parsed/{clinical-policies,bulletins,state-plan-amendments,waivers}
touch packages/pipeline/src/pipeline/{parse,graph,references,embeddings,concepts}/__init__.py
```

- [ ] **Step 6: Verify import works**

Run: `cd packages/pipeline && .venv/bin/python -c "from pipeline.config import CRAWLER_DATA_DIR; print(CRAWLER_DATA_DIR)"`
Expected: Prints the absolute path to `packages/crawler/data/documents`.

- [ ] **Step 7: Commit**

```bash
git add packages/pipeline/
git commit -m "feat(pipeline): add config and dependencies for pipeline package"
```

---

### Task 2: Docling Converter

**Files:**
- Create: `packages/pipeline/src/pipeline/parse/converter.py`

- [ ] **Step 1: Write the converter module**

Write `packages/pipeline/src/pipeline/parse/converter.py`:

```python
"""Convert PDFs to structured JSON using Docling."""

import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import docling
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import (
    PdfPipelineOptions,
    TableStructureOptions,
)
from rich.console import Console

from pipeline.config import CRAWLER_DATA_DIR, PARSED_DATA_DIR, SOURCE_TYPE_DIRS

console = Console()


def create_converter() -> DocumentConverter:
    """Create a Docling DocumentConverter with OCR and table extraction enabled."""
    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = True
    pipeline_options.do_table_structure = True
    pipeline_options.table_structure_options = TableStructureOptions(
        do_cell_matching=True,
    )
    return DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
        }
    )


def file_sha256(path: Path) -> str:
    """Compute SHA-256 hex digest of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def should_parse(pdf_path: Path, meta_path: Path) -> bool:
    """Check if a PDF needs (re-)parsing by comparing file hashes."""
    if not meta_path.exists():
        return True
    try:
        meta = json.loads(meta_path.read_text())
        stored_hash = meta.get("source_pdf_hash", "")
        current_hash = f"sha256:{file_sha256(pdf_path)}"
        return stored_hash != current_hash
    except (json.JSONDecodeError, KeyError):
        return True


def parse_pdf(pdf_path: Path, converter: DocumentConverter) -> dict:
    """Parse a single PDF and return the Docling document dict + stats."""
    start = time.time()
    result = converter.convert(str(pdf_path))
    elapsed = time.time() - start

    doc = result.document
    doc_dict = doc.export_to_dict()
    md_text = doc.export_to_markdown()

    # Count sections and tables
    section_count = 0
    table_count = 0
    for item, _level in doc.iterate_items():
        label = getattr(item, "label", None)
        if label is not None:
            label_str = str(label)
            if "section_header" in label_str.lower() or "title" in label_str.lower():
                section_count += 1
            elif "table" in label_str.lower():
                table_count += 1

    page_count = getattr(doc, "num_pages", None) or len(getattr(doc, "pages", []))

    return {
        "doc_dict": doc_dict,
        "markdown": md_text,
        "section_count": section_count,
        "table_count": table_count,
        "page_count": page_count,
        "parse_time_seconds": round(elapsed, 2),
    }


def save_parsed(
    pdf_path: Path,
    parsed: dict,
    source_type: str,
) -> Path:
    """Save parsed JSON, markdown, and metadata sidecar."""
    out_dir = PARSED_DATA_DIR / SOURCE_TYPE_DIRS.get(source_type, source_type)
    out_dir.mkdir(parents=True, exist_ok=True)

    stem = pdf_path.stem
    json_path = out_dir / f"{stem}.json"
    md_path = out_dir / f"{stem}.md"
    meta_path = out_dir / f"{stem}.meta.json"

    # Save JSON (full Docling document)
    json_path.write_text(json.dumps(parsed["doc_dict"], indent=2, default=str))

    # Save Markdown (human inspection)
    md_path.write_text(parsed["markdown"])

    # Save metadata sidecar
    meta = {
        "source_pdf": str(pdf_path),
        "source_pdf_hash": f"sha256:{file_sha256(pdf_path)}",
        "parsed_at": datetime.now(timezone.utc).isoformat(),
        "docling_version": getattr(docling, "__version__", "unknown"),
        "section_count": parsed["section_count"],
        "table_count": parsed["table_count"],
        "page_count": parsed["page_count"],
        "parse_time_seconds": parsed["parse_time_seconds"],
        "warnings": [],
    }
    meta_path.write_text(json.dumps(meta, indent=2))

    return json_path


def discover_pdfs(source_type: str | None = None) -> list[Path]:
    """Find all PDFs in the crawler's data directory."""
    pdfs = []
    if source_type:
        dir_name = SOURCE_TYPE_DIRS.get(source_type, source_type)
        source_dir = CRAWLER_DATA_DIR / dir_name
        if source_dir.exists():
            pdfs.extend(sorted(source_dir.glob("*.pdf")))
    else:
        for st, dir_name in SOURCE_TYPE_DIRS.items():
            source_dir = CRAWLER_DATA_DIR / dir_name
            if source_dir.exists():
                pdfs.extend(sorted(source_dir.glob("*.pdf")))
    return pdfs


def source_type_for_pdf(pdf_path: Path) -> str:
    """Infer source_type from the PDF's parent directory name."""
    dir_name = pdf_path.parent.name
    for st, dn in SOURCE_TYPE_DIRS.items():
        if dn == dir_name:
            return st
    return "unknown"


def parse_all(
    source_type: str | None = None,
    force: bool = False,
    file_path: Path | None = None,
) -> dict:
    """Parse all unprocessed PDFs. Returns stats dict."""
    converter = create_converter()
    stats = {"parsed": 0, "skipped": 0, "errors": 0}

    if file_path:
        pdfs = [file_path]
    else:
        pdfs = discover_pdfs(source_type)

    console.print(f"[bold]Found {len(pdfs)} PDFs to process[/bold]")

    for pdf_path in pdfs:
        st = source_type_for_pdf(pdf_path)
        out_dir = PARSED_DATA_DIR / SOURCE_TYPE_DIRS.get(st, st)
        meta_path = out_dir / f"{pdf_path.stem}.meta.json"

        if not force and not should_parse(pdf_path, meta_path):
            stats["skipped"] += 1
            continue

        try:
            console.print(f"  Parsing {pdf_path.name}...", end=" ")
            parsed = parse_pdf(pdf_path, converter)
            save_parsed(pdf_path, parsed, st)
            console.print(
                f"[green]OK[/green] "
                f"({parsed['section_count']} sections, "
                f"{parsed['table_count']} tables, "
                f"{parsed['parse_time_seconds']}s)"
            )
            stats["parsed"] += 1
        except Exception as e:
            console.print(f"[red]ERROR: {e}[/red]")
            stats["errors"] += 1

    return stats
```

- [ ] **Step 2: Verify it compiles**

Run: `cd packages/pipeline && .venv/bin/python -c "from pipeline.parse.converter import create_converter; print('OK')"`
Expected: Prints `OK`.

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/pipeline/parse/
git commit -m "feat(pipeline): add Docling PDF converter with caching and metadata"
```

---

### Task 3: Post-Processing — Section Numbers & Hierarchy

**Files:**
- Create: `packages/pipeline/src/pipeline/parse/post_process.py`
- Create: `packages/pipeline/tests/test_post_process.py`

- [ ] **Step 1: Write the test**

Write `packages/pipeline/tests/test_post_process.py`:

```python
import pytest
from pipeline.parse.post_process import extract_section_number, infer_level_from_number


class TestExtractSectionNumber:
    def test_simple_number(self):
        assert extract_section_number("5.0 Coverage Requirements") == "5.0"

    def test_nested_number(self):
        assert extract_section_number("5.1.3 Eligibility Criteria") == "5.1.3"

    def test_with_section_prefix(self):
        assert extract_section_number("Section 2.2 Special Provisions") == "2.2"

    def test_single_digit(self):
        assert extract_section_number("1.0 Description of the Service") == "1.0"

    def test_attachment_label(self):
        assert extract_section_number("Attachment A: Claims Information") is None

    def test_no_number(self):
        assert extract_section_number("Introduction") is None

    def test_number_not_at_start(self):
        # Numbers in the middle of text are not section numbers
        assert extract_section_number("There are 42 CFR requirements") is None

    def test_deep_nesting(self):
        assert extract_section_number("5.2.1.4 Specific Conditions") == "5.2.1.4"


class TestInferLevelFromNumber:
    def test_top_level(self):
        assert infer_level_from_number("1.0") == 1

    def test_second_level(self):
        assert infer_level_from_number("5.1") == 2

    def test_third_level(self):
        assert infer_level_from_number("5.1.3") == 3

    def test_fourth_level(self):
        assert infer_level_from_number("5.2.1.4") == 4

    def test_none_input(self):
        assert infer_level_from_number(None) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/pipeline && .venv/bin/python -m pytest tests/test_post_process.py -v`
Expected: FAIL — cannot import.

- [ ] **Step 3: Write the implementation**

Write `packages/pipeline/src/pipeline/parse/post_process.py`:

```python
"""Post-processing for Docling output: section number extraction and hierarchy repair."""

import re


# Match section numbers at the start of heading text
# Patterns: "5.0", "5.1.3", "Section 5.1", "Subsection 5.2.1"
SECTION_NUMBER_RE = re.compile(
    r"^(?:Section\s+|Subsection\s+)?(\d+(?:\.\d+)+)\b"
)


def extract_section_number(heading_text: str) -> str | None:
    """
    Extract a section number from heading text.

    Returns the section number string (e.g., "5.1.3") or None if not found.
    """
    match = SECTION_NUMBER_RE.match(heading_text.strip())
    if match:
        return match.group(1)
    return None


def infer_level_from_number(section_number: str | None) -> int | None:
    """
    Infer hierarchy level from a section number.

    "1.0" → 1, "5.1" → 2, "5.1.3" → 3, "5.2.1.4" → 4
    """
    if section_number is None:
        return None
    parts = section_number.split(".")
    return len(parts)


def build_section_id(document_id: str, section_number: str | None, index: int) -> str:
    """Build a unique section ID for the graph."""
    if section_number:
        return f"sec:{document_id}:{section_number}"
    return f"sec:{document_id}:_s{index}"


def build_document_id(source_type: str, policy_number: str | None, slug: str) -> str:
    """Build a unique document ID for the graph."""
    identifier = policy_number or slug
    return f"doc:{source_type}:{identifier}"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/pipeline && .venv/bin/python -m pytest tests/test_post_process.py -v`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/parse/post_process.py packages/pipeline/tests/test_post_process.py
git commit -m "feat(pipeline): add section number extraction and hierarchy inference"
```

---

### Task 4: CLI — Parse Command

**Files:**
- Create: `packages/pipeline/src/pipeline/cli.py`

- [ ] **Step 1: Write the CLI with the parse command**

Write `packages/pipeline/src/pipeline/cli.py`:

```python
"""CLI entry point for the NC Medicaid document pipeline."""

import click
from pathlib import Path
from rich.console import Console

console = Console()


@click.group()
def cli():
    """NC Medicaid Document Pipeline — parse, load, embed, and inspect."""
    pass


@cli.command()
@click.option("--file", "file_path", type=click.Path(exists=True, path_type=Path), help="Parse a specific PDF file")
@click.option("--source", "source_type", type=str, help="Parse only this source type")
@click.option("--force", is_flag=True, help="Re-parse even if cached")
def parse(file_path: Path | None, source_type: str | None, force: bool):
    """Parse PDFs into structured JSON using Docling."""
    from pipeline.parse.converter import parse_all

    stats = parse_all(source_type=source_type, force=force, file_path=file_path)
    console.print(f"\n[bold]Parse complete:[/bold] {stats['parsed']} parsed, {stats['skipped']} skipped, {stats['errors']} errors")


if __name__ == "__main__":
    cli()
```

- [ ] **Step 2: Update package.json test script and add a run script**

The `package.json` in `packages/pipeline/` already has test/lint/setup scripts. No changes needed — the CLI is invoked via `.venv/bin/python -m pipeline.cli`.

- [ ] **Step 3: Verify CLI works**

Run: `cd packages/pipeline && .venv/bin/python -m pipeline.cli --help`
Expected: Shows the `parse` command.

Run: `cd packages/pipeline && .venv/bin/python -m pipeline.cli parse --help`
Expected: Shows `--file`, `--source`, `--force` options.

- [ ] **Step 4: Commit**

```bash
git add packages/pipeline/src/pipeline/cli.py
git commit -m "feat(pipeline): add CLI with parse command"
```

---

### Task 5: Parse Validation — Real PDF + Save Fixture

**Files:**
- Creates fixture files in `packages/pipeline/tests/fixtures/`

- [ ] **Step 1: Parse a single clinical policy PDF**

Pick a small clinical policy PDF from the crawler output. Parse it:

```bash
cd packages/pipeline && .venv/bin/python -m pipeline.cli parse --file ../crawler/data/documents/clinical-policies/1n-1_allergy-testing.pdf
```

Expected: Produces JSON, MD, and meta.json in `data/parsed/clinical-policies/`. Prints section and table counts.

- [ ] **Step 2: Inspect the parsed output**

Read the metadata sidecar to check section/table counts. Read the markdown file to verify it looks reasonable.

- [ ] **Step 3: Save a fixture**

Copy one parsed JSON as a test fixture:

```bash
cp packages/pipeline/data/parsed/clinical-policies/1n-1_allergy-testing.json packages/pipeline/tests/fixtures/
```

- [ ] **Step 4: Parse a batch (3-5 documents)**

```bash
cd packages/pipeline && .venv/bin/python -m pipeline.cli parse --source clinical_policy
```

Let it run for a few documents (Ctrl+C after 3-5 succeed). Verify the caching works by re-running — should skip already-parsed files.

- [ ] **Step 5: Run all tests**

Run: `cd packages/pipeline && .venv/bin/python -m pytest tests/ -v`
Expected: All pass.

- [ ] **Step 6: Commit fixtures**

```bash
git add packages/pipeline/tests/fixtures/
git commit -m "test(pipeline): save Docling JSON fixture for parser tests"
```

---

### Task 6: Neo4j Connection & Schema

**Files:**
- Create: `packages/pipeline/src/pipeline/graph/connection.py`
- Create: `packages/pipeline/src/pipeline/graph/schema.py`
- Create: `packages/pipeline/src/pipeline/graph/queries.py`

- [ ] **Step 1: Start Neo4j in Docker**

```bash
docker run -d \
  --name neo4j-medicaid \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/medicaid-dev \
  -v neo4j-medicaid-data:/data \
  neo4j:community
```

Wait for it to be ready: `docker logs neo4j-medicaid --tail 5` — look for "Started."

- [ ] **Step 2: Write the connection module**

Write `packages/pipeline/src/pipeline/graph/connection.py`:

```python
"""Neo4j driver setup and session management."""

from contextlib import contextmanager

from neo4j import GraphDatabase

from pipeline.config import NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE

_driver = None


def get_driver():
    """Get or create the Neo4j driver singleton."""
    global _driver
    if _driver is None:
        _driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    return _driver


def close_driver():
    """Close the Neo4j driver."""
    global _driver
    if _driver is not None:
        _driver.close()
        _driver = None


@contextmanager
def get_session():
    """Get a Neo4j session as a context manager."""
    driver = get_driver()
    session = driver.session(database=NEO4J_DATABASE)
    try:
        yield session
    finally:
        session.close()
```

- [ ] **Step 3: Write the schema module**

Write `packages/pipeline/src/pipeline/graph/schema.py`:

```python
"""Neo4j schema setup: constraints and indexes."""

from pipeline.graph.connection import get_session


CONSTRAINTS = [
    "CREATE CONSTRAINT doc_id IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE",
    "CREATE CONSTRAINT section_id IF NOT EXISTS FOR (s:Section) REQUIRE s.id IS UNIQUE",
    "CREATE CONSTRAINT concept_id IF NOT EXISTS FOR (c:PolicyConcept) REQUIRE c.id IS UNIQUE",
]


def ensure_schema():
    """Create constraints and indexes if they don't exist."""
    with get_session() as session:
        for constraint in CONSTRAINTS:
            session.run(constraint)


def reset_database():
    """Drop all nodes and relationships. Use with caution."""
    with get_session() as session:
        session.run("MATCH (n) DETACH DELETE n")
```

- [ ] **Step 4: Write the queries module**

Write `packages/pipeline/src/pipeline/graph/queries.py`:

```python
"""Reusable Cypher query templates."""

MERGE_DOCUMENT = """
MERGE (d:Document {id: $id})
SET d.title = $title,
    d.document_type = $document_type,
    d.policy_number = $policy_number,
    d.category = $category,
    d.status = $status,
    d.source_url = $source_url,
    d.local_path = $local_path,
    d.pdf_path = $pdf_path,
    d.page_count = $page_count,
    d.section_count = $section_count,
    d.last_indexed = datetime()
RETURN d
"""

MERGE_SECTION = """
MERGE (s:Section {id: $id})
SET s.document_id = $document_id,
    s.section_number = $section_number,
    s.title = $title,
    s.level = $level,
    s.content_text = $content_text,
    s.content_length = $content_length,
    s.has_tables = $has_tables,
    s.has_definitions = $has_definitions
RETURN s
"""

MERGE_HAS_SECTION = """
MATCH (d:Document {id: $doc_id})
MATCH (s:Section {id: $sec_id})
MERGE (d)-[:HAS_SECTION]->(s)
"""

MERGE_PARENT_OF = """
MATCH (parent:Section {id: $parent_id})
MATCH (child:Section {id: $child_id})
MERGE (parent)-[:PARENT_OF]->(child)
"""

MERGE_NEXT_SIBLING = """
MATCH (prev:Section {id: $prev_id})
MATCH (next:Section {id: $next_id})
MERGE (prev)-[:NEXT_SIBLING]->(next)
"""

MERGE_REFERENCES = """
MATCH (src:Section {id: $source_id})
MATCH (tgt:Section {id: $target_id})
MERGE (src)-[r:REFERENCES]->(tgt)
SET r.reference_text = $reference_text,
    r.reference_type = $reference_type
"""

MERGE_REFERENCES_DOCUMENT = """
MATCH (src:Section {id: $source_id})
MATCH (tgt:Document {id: $target_id})
MERGE (src)-[r:REFERENCES_DOCUMENT]->(tgt)
SET r.reference_text = $reference_text
"""

MERGE_CONCEPT = """
MERGE (c:PolicyConcept {id: $id})
SET c.name = $name,
    c.aliases = $aliases,
    c.category = $category
RETURN c
"""

# Note: Concept-section edges use dynamic Cypher in linker.py (relationship type varies)

# Stats queries
COUNT_NODES = """
MATCH (n)
WITH labels(n)[0] AS label, count(n) AS cnt
RETURN label, cnt ORDER BY label
"""

COUNT_EDGES = """
MATCH ()-[r]->()
WITH type(r) AS rel_type, count(r) AS cnt
RETURN rel_type, cnt ORDER BY rel_type
"""

FIND_DOCUMENT = """
MATCH (d:Document {policy_number: $policy_number})
RETURN d
"""

FIND_SECTIONS_BY_DOC = """
MATCH (d:Document {id: $doc_id})-[:HAS_SECTION]->(s:Section)
OPTIONAL MATCH (s)-[:PARENT_OF]->(child:Section)
RETURN s.id, s.section_number, s.title, s.level, s.content_length,
       collect(child.section_number) AS children
ORDER BY s.section_number
"""
```

- [ ] **Step 5: Verify Neo4j connection**

```bash
cd packages/pipeline && .venv/bin/python -c "
from pipeline.graph.connection import get_session
with get_session() as s:
    result = s.run('RETURN 1 AS n')
    print('Connected:', result.single()['n'])
"
```

Expected: Prints `Connected: 1`.

- [ ] **Step 6: Run schema setup**

```bash
cd packages/pipeline && .venv/bin/python -c "
from pipeline.graph.schema import ensure_schema
ensure_schema()
print('Schema created')
"
```

Expected: Prints `Schema created`.

- [ ] **Step 7: Commit**

```bash
git add packages/pipeline/src/pipeline/graph/
git commit -m "feat(pipeline): add Neo4j connection, schema, and query templates"
```

---

### Task 7: Graph Loader

**Files:**
- Create: `packages/pipeline/src/pipeline/graph/loader.py`
- Create: `packages/pipeline/tests/test_loader.py`

- [ ] **Step 1: Write the loader test**

Write `packages/pipeline/tests/test_loader.py`:

```python
"""Test graph loading from parsed Docling JSON."""

import json
import pytest
from pathlib import Path

from pipeline.graph.loader import (
    walk_docling_document,
    build_sections_from_items,
)


FIXTURES_DIR = Path(__file__).parent / "fixtures"


class TestWalkDoclingDocument:
    """Test section extraction from a real Docling JSON fixture."""

    @pytest.fixture
    def doc_dict(self):
        # Load a fixture — test skips if no fixture available
        fixtures = list(FIXTURES_DIR.glob("*.json"))
        if not fixtures:
            pytest.skip("No Docling JSON fixture available")
        return json.loads(fixtures[0].read_text())

    def test_extracts_sections(self, doc_dict):
        sections = build_sections_from_items(doc_dict, "doc:test:fixture")
        assert len(sections) > 0

    def test_sections_have_content(self, doc_dict):
        sections = build_sections_from_items(doc_dict, "doc:test:fixture")
        with_content = [s for s in sections if s["content_text"]]
        assert len(with_content) > 0

    def test_sections_have_ids(self, doc_dict):
        sections = build_sections_from_items(doc_dict, "doc:test:fixture")
        for s in sections:
            assert s["id"].startswith("sec:")

    def test_sections_have_levels(self, doc_dict):
        sections = build_sections_from_items(doc_dict, "doc:test:fixture")
        levels = {s["level"] for s in sections}
        assert len(levels) > 1  # Should have multiple hierarchy levels
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/pipeline && .venv/bin/python -m pytest tests/test_loader.py -v`
Expected: FAIL — cannot import.

- [ ] **Step 3: Write the loader**

Write `packages/pipeline/src/pipeline/graph/loader.py`:

```python
"""Load parsed Docling JSON into Neo4j as Document and Section nodes."""

import json
from pathlib import Path

from docling_core.types.doc import DoclingDocument, DocItemLabel
from rich.console import Console

from pipeline.config import PARSED_DATA_DIR, CRAWLER_DB_PATH, SOURCE_TYPE_DIRS
from pipeline.parse.post_process import (
    extract_section_number,
    infer_level_from_number,
    build_section_id,
    build_document_id,
)
from pipeline.graph.connection import get_session
from pipeline.graph import queries

console = Console()


def build_sections_from_items(doc_dict: dict, document_id: str) -> list[dict]:
    """
    Walk a Docling document dict and extract sections with content.

    Returns a list of section dicts suitable for Neo4j node creation.
    """
    doc = DoclingDocument.model_validate(doc_dict)
    sections: list[dict] = []
    current_section: dict | None = None
    section_index = 0

    for item, level in doc.iterate_items():
        label = getattr(item, "label", None)
        text = getattr(item, "text", "") or ""

        if label in (DocItemLabel.SECTION_HEADER, DocItemLabel.TITLE):
            # Save previous section
            if current_section and current_section["content_text"].strip():
                sections.append(current_section)

            section_number = extract_section_number(text)
            inferred_level = infer_level_from_number(section_number) or level
            sec_id = build_section_id(document_id, section_number, section_index)
            section_index += 1

            current_section = {
                "id": sec_id,
                "document_id": document_id,
                "section_number": section_number,
                "title": text.strip(),
                "level": inferred_level,
                "content_text": "",
                "content_length": 0,
                "has_tables": False,
                "has_definitions": False,
                "parent_id": None,
                "prev_sibling_id": None,
            }

            # Check if this is a definitions section
            title_lower = text.strip().lower()
            if "definition" in title_lower:
                current_section["has_definitions"] = True

        elif label == DocItemLabel.TABLE:
            if current_section:
                # Export table to markdown and append to section content
                try:
                    table_item = item
                    df = table_item.export_to_dataframe(doc=doc)
                    table_md = df.to_markdown(index=False)
                    current_section["content_text"] += f"\n\n{table_md}\n"
                    current_section["has_tables"] = True
                except Exception:
                    current_section["content_text"] += "\n\n[table extraction failed]\n"
                    current_section["has_tables"] = True

        elif label in (DocItemLabel.PARAGRAPH, DocItemLabel.LIST_ITEM):
            if current_section:
                current_section["content_text"] += f"\n{text}"
            elif text.strip():
                # Content before the first section heading — create an implicit section
                if not current_section:
                    sec_id = build_section_id(document_id, None, section_index)
                    section_index += 1
                    current_section = {
                        "id": sec_id,
                        "document_id": document_id,
                        "section_number": None,
                        "title": None,
                        "level": 0,
                        "content_text": text,
                        "content_length": 0,
                        "has_tables": False,
                        "has_definitions": False,
                        "parent_id": None,
                        "prev_sibling_id": None,
                    }

    # Don't forget the last section
    if current_section and current_section["content_text"].strip():
        sections.append(current_section)

    # Set content_length
    for s in sections:
        s["content_text"] = s["content_text"].strip()
        s["content_length"] = len(s["content_text"])

    # Build hierarchy (parent_id and prev_sibling_id)
    _assign_hierarchy(sections)

    return sections


def _assign_hierarchy(sections: list[dict]):
    """Assign parent_id and prev_sibling_id based on level."""
    stack: list[dict] = []  # Stack of ancestor sections
    prev_at_level: dict[int, str] = {}  # Last section ID at each level

    for section in sections:
        level = section["level"]

        # Pop stack until we find the parent
        while stack and stack[-1]["level"] >= level:
            stack.pop()

        if stack:
            section["parent_id"] = stack[-1]["id"]

        # Track siblings at this level
        if level in prev_at_level:
            section["prev_sibling_id"] = prev_at_level[level]
        prev_at_level[level] = section["id"]

        # Clear sibling tracking for deeper levels
        for deeper in list(prev_at_level.keys()):
            if deeper > level:
                del prev_at_level[deeper]

        stack.append(section)


def read_crawler_metadata(source_type: str, filename_stem: str) -> dict:
    """Read metadata from the crawler's SQLite registry."""
    import sqlite3

    if not CRAWLER_DB_PATH.exists():
        return {}

    conn = sqlite3.connect(str(CRAWLER_DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            "SELECT * FROM documents WHERE source_type = ? AND local_path LIKE ?",
            (source_type, f"%{filename_stem}%"),
        ).fetchone()
        return dict(row) if row else {}
    finally:
        conn.close()


def load_document(json_path: Path, source_type: str) -> dict:
    """Load a single parsed document into Neo4j. Returns stats."""
    meta_path = json_path.with_suffix("").with_suffix(".meta.json")
    doc_dict = json.loads(json_path.read_text())
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}

    # Read crawler metadata
    crawler_meta = read_crawler_metadata(source_type, json_path.stem)

    # Build document ID
    policy_number = crawler_meta.get("policy_number")
    doc_id = build_document_id(source_type, policy_number, json_path.stem)

    # Build sections
    sections = build_sections_from_items(doc_dict, doc_id)

    with get_session() as session:
        # MERGE document node
        session.run(queries.MERGE_DOCUMENT, {
            "id": doc_id,
            "title": crawler_meta.get("title", json_path.stem),
            "document_type": source_type,
            "policy_number": policy_number,
            "category": crawler_meta.get("category"),
            "status": "current",
            "source_url": crawler_meta.get("source_url", ""),
            "local_path": str(json_path),
            "pdf_path": meta.get("source_pdf", ""),
            "page_count": meta.get("page_count", 0),
            "section_count": len(sections),
        })

        # MERGE section nodes and edges
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

            # PARENT_OF edge
            if section["parent_id"]:
                session.run(queries.MERGE_PARENT_OF, {
                    "parent_id": section["parent_id"],
                    "child_id": section["id"],
                })

            # NEXT_SIBLING edge
            if section["prev_sibling_id"]:
                session.run(queries.MERGE_NEXT_SIBLING, {
                    "prev_id": section["prev_sibling_id"],
                    "next_id": section["id"],
                })

    return {
        "document_id": doc_id,
        "sections": len(sections),
    }


def load_all(source_type: str | None = None, reset: bool = False) -> dict:
    """Load all parsed documents into Neo4j."""
    from pipeline.graph.schema import ensure_schema, reset_database

    if reset:
        console.print("[yellow]Resetting database...[/yellow]")
        reset_database()

    ensure_schema()

    stats = {"loaded": 0, "sections_total": 0, "errors": 0}

    if source_type:
        dirs = [(source_type, SOURCE_TYPE_DIRS.get(source_type, source_type))]
    else:
        dirs = list(SOURCE_TYPE_DIRS.items())

    for st, dir_name in dirs:
        parsed_dir = PARSED_DATA_DIR / dir_name
        if not parsed_dir.exists():
            continue

        json_files = sorted(parsed_dir.glob("*.json"))
        # Exclude .meta.json files
        json_files = [f for f in json_files if not f.name.endswith(".meta.json")]

        for json_path in json_files:
            try:
                console.print(f"  Loading {json_path.name}...", end=" ")
                result = load_document(json_path, st)
                console.print(f"[green]OK[/green] ({result['sections']} sections)")
                stats["loaded"] += 1
                stats["sections_total"] += result["sections"]
            except Exception as e:
                console.print(f"[red]ERROR: {e}[/red]")
                stats["errors"] += 1

    return stats
```

- [ ] **Step 4: Run tests**

Run: `cd packages/pipeline && .venv/bin/python -m pytest tests/test_loader.py -v`
Expected: All PASS (if fixture exists; skip otherwise).

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/graph/loader.py packages/pipeline/tests/test_loader.py
git commit -m "feat(pipeline): add graph loader mapping Docling JSON to Neo4j nodes"
```

---

### Task 8: CLI — Load Command

**Files:**
- Modify: `packages/pipeline/src/pipeline/cli.py`

- [ ] **Step 1: Add the load command to cli.py**

Append to `packages/pipeline/src/pipeline/cli.py`:

```python
@cli.command()
@click.option("--source", "source_type", type=str, help="Load only this source type")
@click.option("--reset", is_flag=True, help="Drop all data and reload")
def load(source_type: str | None, reset: bool):
    """Load parsed documents into Neo4j."""
    from pipeline.graph.loader import load_all

    stats = load_all(source_type=source_type, reset=reset)
    console.print(f"\n[bold]Load complete:[/bold] {stats['loaded']} documents, {stats['sections_total']} sections, {stats['errors']} errors")
```

- [ ] **Step 2: Test the load command**

First, ensure at least one document is parsed (from Task 5). Then:

```bash
cd packages/pipeline && .venv/bin/python -m pipeline.cli load --source clinical_policy
```

Expected: Documents loaded into Neo4j with section counts printed.

- [ ] **Step 3: Verify in Neo4j Browser**

Open `http://localhost:7474` in a browser. Run:
```cypher
MATCH (d:Document) RETURN d.id, d.title, d.section_count LIMIT 10
```

Expected: Document nodes visible.

- [ ] **Step 4: Commit**

```bash
git add packages/pipeline/src/pipeline/cli.py
git commit -m "feat(pipeline): add CLI load command for Neo4j graph construction"
```

---

### Task 9: Cross-Reference Extractor & Resolver

**Files:**
- Create: `packages/pipeline/src/pipeline/references/extractor.py`
- Create: `packages/pipeline/src/pipeline/references/resolver.py`
- Create: `packages/pipeline/tests/test_extractor.py`
- Create: `packages/pipeline/tests/test_resolver.py`

- [ ] **Step 1: Write the extractor test**

Write `packages/pipeline/tests/test_extractor.py`:

```python
import pytest
from pipeline.references.extractor import extract_references, ReferenceMatch


class TestExtractReferences:
    def test_clinical_coverage_policy(self):
        text = "as defined in Clinical Coverage Policy 3K-2, Section 5.1"
        refs = extract_references(text)
        assert any(r.ref_type == "cross_document" and r.target_id == "3K-2" for r in refs)
        assert any(r.ref_type == "section" and r.target_id == "5.1" for r in refs)

    def test_section_reference(self):
        text = "See Section 5.1.3 for eligibility criteria"
        refs = extract_references(text)
        assert any(r.ref_type == "section" and r.target_id == "5.1.3" for r in refs)

    def test_subsection_reference(self):
        text = "as outlined in Subsection 5.3.3"
        refs = extract_references(text)
        assert any(r.ref_type == "section" and r.target_id == "5.3.3" for r in refs)

    def test_attachment_reference(self):
        text = "per the procedure detailed in Attachment B"
        refs = extract_references(text)
        assert any(r.ref_type == "attachment" and r.target_id == "B" for r in refs)

    def test_cfr_reference(self):
        text = "in accordance with 42 CFR 484.65"
        refs = extract_references(text)
        assert any(r.ref_type == "federal_regulation" for r in refs)

    def test_spa_reference(self):
        text = "State Plan Amendment SPA 24-0001"
        refs = extract_references(text)
        assert any(r.ref_type == "spa" and r.target_id == "24-0001" for r in refs)

    def test_waiver_reference(self):
        text = "under the 1915(c) waiver program"
        refs = extract_references(text)
        assert any(r.ref_type == "waiver" for r in refs)

    def test_no_references(self):
        text = "This is a plain sentence with no policy references."
        refs = extract_references(text)
        assert len(refs) == 0

    def test_multiple_references(self):
        text = "See Clinical Coverage Policy 10A and Section 2.2 for details."
        refs = extract_references(text)
        assert len(refs) >= 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/pipeline && .venv/bin/python -m pytest tests/test_extractor.py -v`
Expected: FAIL.

- [ ] **Step 3: Write the extractor**

Write `packages/pipeline/src/pipeline/references/extractor.py`:

```python
"""Regex-based cross-reference extraction from section text."""

import re
from dataclasses import dataclass


@dataclass
class ReferenceMatch:
    ref_type: str       # cross_document, section, attachment, federal_regulation, spa, waiver
    target_id: str      # The extracted identifier
    matched_text: str   # The full matched text from the source
    start: int          # Character offset in source text
    end: int


PATTERNS: list[tuple[str, re.Pattern]] = [
    (
        "cross_document",
        re.compile(
            r"Clinical Coverage Policy(?:\s+No\.?)?\s*:?\s*([A-Z0-9]+(?:-[A-Z0-9]+)*)",
            re.IGNORECASE,
        ),
    ),
    (
        "section",
        re.compile(r"(?:Section|Subsection)\s+([\d]+(?:\.[\d]+)*)"),
    ),
    (
        "attachment",
        re.compile(r"Attachment\s+([A-Z])"),
    ),
    (
        "federal_regulation",
        re.compile(r"(\d+)\s*CFR\s*§?\s*([\d]+(?:\.[\d]+)*)"),
    ),
    (
        "spa",
        re.compile(r"SPA\s+([\d]+-[\d]+)"),
    ),
    (
        "waiver",
        re.compile(r"1915\s*\([a-z]\)"),
    ),
]


def extract_references(text: str) -> list[ReferenceMatch]:
    """Extract all cross-references from a block of text."""
    refs: list[ReferenceMatch] = []

    for ref_type, pattern in PATTERNS:
        for match in pattern.finditer(text):
            if ref_type == "federal_regulation":
                target_id = f"{match.group(1)} CFR {match.group(2)}"
            elif ref_type == "waiver":
                target_id = match.group(0)
            else:
                target_id = match.group(1)

            refs.append(ReferenceMatch(
                ref_type=ref_type,
                target_id=target_id,
                matched_text=match.group(0),
                start=match.start(),
                end=match.end(),
            ))

    return refs
```

- [ ] **Step 4: Run extractor tests**

Run: `cd packages/pipeline && .venv/bin/python -m pytest tests/test_extractor.py -v`
Expected: All PASS.

- [ ] **Step 5: Write the resolver**

Write `packages/pipeline/src/pipeline/references/resolver.py`:

```python
"""Resolve extracted references to Neo4j graph nodes."""

import json
from pathlib import Path

from pipeline.graph.connection import get_session
from pipeline.graph import queries
from pipeline.references.extractor import ReferenceMatch
from pipeline.config import PARSED_DATA_DIR


def resolve_reference(
    ref: ReferenceMatch,
    source_section_id: str,
    source_document_id: str,
) -> dict:
    """
    Attempt to resolve a reference to a graph node.

    Returns a dict with resolution result:
    {
        "resolved": bool,
        "target_node_id": str | None,
        "target_type": "section" | "document" | None,
        "edge_type": str,
    }
    """
    with get_session() as session:
        if ref.ref_type == "cross_document":
            # Look up document by policy number
            result = session.run(
                "MATCH (d:Document {policy_number: $pn}) RETURN d.id",
                {"pn": ref.target_id},
            )
            record = result.single()
            if record:
                return {
                    "resolved": True,
                    "target_node_id": record["d.id"],
                    "target_type": "document",
                    "edge_type": "REFERENCES_DOCUMENT",
                }

        elif ref.ref_type == "section":
            # Look for section within the same document first
            result = session.run(
                "MATCH (s:Section {document_id: $doc_id, section_number: $sn}) RETURN s.id",
                {"doc_id": source_document_id, "sn": ref.target_id},
            )
            record = result.single()
            if record:
                return {
                    "resolved": True,
                    "target_node_id": record["s.id"],
                    "target_type": "section",
                    "edge_type": "REFERENCES",
                }

    return {
        "resolved": False,
        "target_node_id": None,
        "target_type": None,
        "edge_type": None,
    }


def extract_and_resolve_all() -> dict:
    """Run cross-reference extraction and resolution across all loaded sections."""
    stats = {"extracted": 0, "resolved": 0, "unresolved": 0}
    unresolved: list[dict] = []

    from pipeline.references.extractor import extract_references

    with get_session() as session:
        # Get all sections
        result = session.run(
            "MATCH (s:Section) RETURN s.id, s.document_id, s.content_text"
        )
        sections = list(result)

    for record in sections:
        section_id = record["s.id"]
        document_id = record["s.document_id"]
        content = record["s.content_text"] or ""

        refs = extract_references(content)
        stats["extracted"] += len(refs)

        for ref in refs:
            resolution = resolve_reference(ref, section_id, document_id)

            if resolution["resolved"]:
                stats["resolved"] += 1
                with get_session() as session:
                    if resolution["edge_type"] == "REFERENCES":
                        session.run(queries.MERGE_REFERENCES, {
                            "source_id": section_id,
                            "target_id": resolution["target_node_id"],
                            "reference_text": ref.matched_text,
                            "reference_type": ref.ref_type,
                        })
                    elif resolution["edge_type"] == "REFERENCES_DOCUMENT":
                        session.run(queries.MERGE_REFERENCES_DOCUMENT, {
                            "source_id": section_id,
                            "target_id": resolution["target_node_id"],
                            "reference_text": ref.matched_text,
                        })
            else:
                stats["unresolved"] += 1
                unresolved.append({
                    "source_section": section_id,
                    "ref_type": ref.ref_type,
                    "target_id": ref.target_id,
                    "matched_text": ref.matched_text,
                })

    # Save unresolved references
    unresolved_path = PARSED_DATA_DIR.parent / "unresolved-references.json"
    unresolved_path.write_text(json.dumps(unresolved, indent=2))

    return stats
```

- [ ] **Step 6: Run all tests**

Run: `cd packages/pipeline && .venv/bin/python -m pytest tests/ -v`
Expected: All PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/pipeline/src/pipeline/references/ packages/pipeline/tests/test_extractor.py
git commit -m "feat(pipeline): add cross-reference extraction and resolution"
```

---

### Task 10: CLI — Extract-Refs Command

**Files:**
- Modify: `packages/pipeline/src/pipeline/cli.py`

- [ ] **Step 1: Add extract-refs and unresolved-refs commands**

Append to `packages/pipeline/src/pipeline/cli.py`:

```python
@cli.command("extract-refs")
@click.option("--llm-assist", is_flag=True, help="Use LLM for ambiguous references")
def extract_refs(llm_assist: bool):
    """Extract and resolve cross-references between documents."""
    from pipeline.references.resolver import extract_and_resolve_all

    stats = extract_and_resolve_all()
    console.print(f"\n[bold]Cross-references:[/bold] {stats['extracted']} extracted, {stats['resolved']} resolved, {stats['unresolved']} unresolved")

    if llm_assist:
        console.print("[yellow]LLM-assisted extraction not yet implemented[/yellow]")


@cli.command("unresolved-refs")
def unresolved_refs():
    """Show unresolved cross-references."""
    import json
    from pipeline.config import PARSED_DATA_DIR

    path = PARSED_DATA_DIR.parent / "unresolved-references.json"
    if not path.exists():
        console.print("No unresolved references file found. Run extract-refs first.")
        return

    data = json.loads(path.read_text())
    console.print(f"[bold]{len(data)} unresolved references:[/bold]")
    for ref in data[:20]:
        console.print(f"  [{ref['ref_type']}] {ref['matched_text']} → {ref['target_id']} (from {ref['source_section']})")
    if len(data) > 20:
        console.print(f"  ... and {len(data) - 20} more")
```

- [ ] **Step 2: Commit**

```bash
git add packages/pipeline/src/pipeline/cli.py
git commit -m "feat(pipeline): add CLI extract-refs and unresolved-refs commands"
```

---

### Task 11: Embedding Generator & Indexer

**Files:**
- Create: `packages/pipeline/src/pipeline/embeddings/generator.py`
- Create: `packages/pipeline/src/pipeline/embeddings/indexer.py`

- [ ] **Step 1: Write the embedding generator**

Write `packages/pipeline/src/pipeline/embeddings/generator.py`:

```python
"""Generate vector embeddings for Section nodes using Voyage AI."""

import voyageai
from rich.console import Console
from rich.progress import track

from pipeline.config import VOYAGE_API_KEY, EMBEDDING_MODEL, EMBED_BATCH_SIZE
from pipeline.graph.connection import get_session

console = Console()


def build_embedding_text(section_id: str) -> tuple[str, str]:
    """
    Build contextualized embedding text for a section.

    Prepends the heading hierarchy (ancestors) to the section content.
    Returns (section_id, embedding_text).
    """
    with get_session() as session:
        # Get section and its ancestor chain
        result = session.run("""
            MATCH (s:Section {id: $sid})
            OPTIONAL MATCH path = (ancestor:Section)-[:PARENT_OF*]->(s)
            WITH s, collect(ancestor) AS ancestors
            MATCH (d:Document)-[:HAS_SECTION]->(s)
            RETURN d.title AS doc_title, s.title AS sec_title,
                   s.content_text AS content,
                   [a IN ancestors | a.title] AS ancestor_titles
        """, {"sid": section_id})

        record = result.single()
        if not record:
            return section_id, ""

        # Build heading chain: doc title > ancestor titles > section title
        chain_parts = [record["doc_title"]] if record["doc_title"] else []
        if record["ancestor_titles"]:
            chain_parts.extend([t for t in record["ancestor_titles"] if t])
        if record["sec_title"]:
            chain_parts.append(record["sec_title"])

        heading_chain = " > ".join(chain_parts)
        content = record["content"] or ""

        return section_id, f"{heading_chain}\n{content}"


def embed_all(model: str | None = None) -> dict:
    """Generate embeddings for all sections without embeddings."""
    model = model or EMBEDDING_MODEL
    if not VOYAGE_API_KEY:
        console.print("[red]VOYAGE_API_KEY not set. Export it as an environment variable.[/red]")
        return {"embedded": 0, "errors": 0}

    client = voyageai.Client(api_key=VOYAGE_API_KEY)

    # Find sections without embeddings
    with get_session() as session:
        result = session.run(
            "MATCH (s:Section) WHERE s.embedding IS NULL RETURN s.id"
        )
        section_ids = [r["s.id"] for r in result]

    if not section_ids:
        console.print("All sections already have embeddings.")
        return {"embedded": 0, "errors": 0}

    console.print(f"Generating embeddings for {len(section_ids)} sections using {model}...")

    stats = {"embedded": 0, "errors": 0}

    # Build texts in batches
    batch_ids: list[str] = []
    batch_texts: list[str] = []

    for sid in track(section_ids, description="Building texts..."):
        _, text = build_embedding_text(sid)
        if text.strip():
            batch_ids.append(sid)
            batch_texts.append(text)

        # Process batch when full
        if len(batch_texts) >= EMBED_BATCH_SIZE:
            try:
                result = client.embed(batch_texts, model=model, input_type="document")
                _store_embeddings(batch_ids, result.embeddings)
                stats["embedded"] += len(batch_ids)
            except Exception as e:
                console.print(f"[red]Batch error: {e}[/red]")
                stats["errors"] += len(batch_ids)
            batch_ids = []
            batch_texts = []

    # Process remaining batch
    if batch_texts:
        try:
            result = client.embed(batch_texts, model=model, input_type="document")
            _store_embeddings(batch_ids, result.embeddings)
            stats["embedded"] += len(batch_ids)
        except Exception as e:
            console.print(f"[red]Batch error: {e}[/red]")
            stats["errors"] += len(batch_ids)

    return stats


def _store_embeddings(section_ids: list[str], embeddings: list[list[float]]):
    """Write embeddings back to Neo4j Section nodes."""
    with get_session() as session:
        for sid, emb in zip(section_ids, embeddings):
            session.run(
                "MATCH (s:Section {id: $sid}) SET s.embedding = $embedding",
                {"sid": sid, "embedding": emb},
            )
```

- [ ] **Step 2: Write the indexer**

Write `packages/pipeline/src/pipeline/embeddings/indexer.py`:

```python
"""Neo4j vector index creation for section embeddings."""

from pipeline.config import EMBEDDING_DIMENSIONS
from pipeline.graph.connection import get_session


def ensure_vector_index():
    """Create the vector index on Section.embedding if it doesn't exist."""
    with get_session() as session:
        session.run(f"""
            CREATE VECTOR INDEX section_embeddings IF NOT EXISTS
            FOR (s:Section) ON (s.embedding)
            OPTIONS {{
                indexConfig: {{
                    `vector.dimensions`: {EMBEDDING_DIMENSIONS},
                    `vector.similarity_function`: 'cosine'
                }}
            }}
        """)


def vector_search(query_embedding: list[float], top_k: int = 10) -> list[dict]:
    """Search for sections similar to a query embedding."""
    with get_session() as session:
        result = session.run("""
            CALL db.index.vector.queryNodes('section_embeddings', $k, $embedding)
            YIELD node AS section, score
            MATCH (section)<-[:HAS_SECTION]-(doc:Document)
            RETURN doc.title AS doc_title, doc.policy_number AS policy_number,
                   section.section_number AS section_number,
                   section.title AS section_title,
                   section.content_text AS content,
                   score
            ORDER BY score DESC
        """, {"k": top_k, "embedding": query_embedding})
        return [dict(r) for r in result]
```

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/pipeline/embeddings/
git commit -m "feat(pipeline): add Voyage AI embedding generator and Neo4j vector index"
```

---

### Task 12: CLI — Embed Command

**Files:**
- Modify: `packages/pipeline/src/pipeline/cli.py`

- [ ] **Step 1: Add embed command**

Append to `packages/pipeline/src/pipeline/cli.py`:

```python
@cli.command()
@click.option("--model", type=str, help="Embedding model to use")
def embed(model: str | None):
    """Generate vector embeddings for all sections."""
    from pipeline.embeddings.generator import embed_all
    from pipeline.embeddings.indexer import ensure_vector_index

    stats = embed_all(model=model)
    ensure_vector_index()
    console.print(f"\n[bold]Embedding complete:[/bold] {stats['embedded']} embedded, {stats['errors']} errors")
```

- [ ] **Step 2: Commit**

```bash
git add packages/pipeline/src/pipeline/cli.py
git commit -m "feat(pipeline): add CLI embed command"
```

---

### Task 13: Concept Seeding & Linking

**Files:**
- Create: `packages/pipeline/src/pipeline/concepts/seed.py`
- Create: `packages/pipeline/src/pipeline/concepts/linker.py`

- [ ] **Step 1: Write the seed module**

Write `packages/pipeline/src/pipeline/concepts/seed.py`:

```python
"""Seed PolicyConcept nodes into Neo4j."""

from pipeline.graph.connection import get_session
from pipeline.graph import queries


def slugify(name: str) -> str:
    """Convert a concept name to a slug for the ID."""
    return name.lower().replace("/", "-").replace(" ", "-").replace("(", "").replace(")", "")


SEED_CONCEPTS = [
    # Programs
    {"name": "CAP/DA", "aliases": ["Community Alternatives Program for Disabled Adults", "CAP DA", "CAPDA"], "category": "program"},
    {"name": "CAP/C", "aliases": ["Community Alternatives Program for Children"], "category": "program"},
    {"name": "NC Innovations Waiver", "aliases": ["Innovations", "1915(c) Innovations"], "category": "program"},
    {"name": "TBI Waiver", "aliases": ["Traumatic Brain Injury Waiver"], "category": "program"},
    {"name": "PACE", "aliases": ["Program of All-Inclusive Care for the Elderly"], "category": "program"},

    # Services
    {"name": "Personal Care Services", "aliases": ["PCS"], "category": "service"},
    {"name": "Private Duty Nursing", "aliases": ["PDN"], "category": "service"},
    {"name": "Home Health Services", "aliases": ["HHS"], "category": "service"},
    {"name": "Durable Medical Equipment", "aliases": ["DME"], "category": "service"},
    {"name": "Home Modifications", "aliases": [], "category": "service"},
    {"name": "Assistive Technology", "aliases": ["AT"], "category": "service"},
    {"name": "Respite Care", "aliases": ["respite"], "category": "service"},
    {"name": "Community Living and Supports", "aliases": ["CLS"], "category": "service"},

    # Processes
    {"name": "Prior Authorization", "aliases": ["prior approval", "PA", "pre-authorization"], "category": "process"},
    {"name": "Medical Necessity", "aliases": ["medically necessary"], "category": "process"},
    {"name": "Level of Care Determination", "aliases": ["LOC", "level of care"], "category": "process"},
    {"name": "Individual Support Plan", "aliases": ["ISP", "plan of care", "POC", "service plan"], "category": "process"},
    {"name": "EPSDT", "aliases": ["Early and Periodic Screening, Diagnostic and Treatment", "Health Check"], "category": "process"},
    {"name": "Fair Hearing", "aliases": ["appeal", "due process"], "category": "process"},

    # Eligibility
    {"name": "Institutional Level of Care", "aliases": ["nursing facility level of care", "ICF/IID level of care"], "category": "eligibility"},
    {"name": "Financial Eligibility", "aliases": ["income limits", "resource limits"], "category": "eligibility"},
    {"name": "Functional Eligibility", "aliases": ["functional criteria", "ADL limitations"], "category": "eligibility"},

    # Entities
    {"name": "LME-MCO", "aliases": ["Local Management Entity-Managed Care Organization"], "category": "entity"},
    {"name": "MCO", "aliases": ["Managed Care Organization"], "category": "entity"},
    {"name": "DHHS", "aliases": ["Department of Health and Human Services", "NC DHHS"], "category": "entity"},
    {"name": "CMS", "aliases": ["Centers for Medicare and Medicaid Services"], "category": "entity"},
]


def seed_concepts() -> int:
    """Load seed concepts into Neo4j. Returns count of concepts created."""
    count = 0
    with get_session() as session:
        for concept in SEED_CONCEPTS:
            concept_id = f"concept:{slugify(concept['name'])}"
            session.run(queries.MERGE_CONCEPT, {
                "id": concept_id,
                "name": concept["name"],
                "aliases": concept["aliases"],
                "category": concept["category"],
            })
            count += 1
    return count
```

- [ ] **Step 2: Write the linker**

Write `packages/pipeline/src/pipeline/concepts/linker.py`:

```python
"""Link PolicyConcept nodes to Section nodes based on content matching."""

import re

from rich.console import Console
from rich.progress import track

from pipeline.graph.connection import get_session
from pipeline.concepts.seed import SEED_CONCEPTS, slugify

console = Console()


def _determine_relationship(section_title: str | None) -> str:
    """Determine the relationship type based on section heading context."""
    if not section_title:
        return "COVERS"
    title_lower = section_title.lower()
    if "definition" in title_lower:
        return "DEFINES"
    if any(w in title_lower for w in ("coverage", "service", "covered")):
        return "COVERS"
    if any(w in title_lower for w in ("limitation", "exclusion", "restriction", "not covered")):
        return "RESTRICTS"
    return "COVERS"


def link_concepts() -> dict:
    """Link concepts to sections based on keyword matching."""
    stats = {"edges_created": 0}

    # Build search terms: concept_id → list of terms to search for
    search_map: list[tuple[str, str, list[str]]] = []
    for concept in SEED_CONCEPTS:
        concept_id = f"concept:{slugify(concept['name'])}"
        terms = [concept["name"]] + concept["aliases"]
        search_map.append((concept_id, concept["name"], terms))

    # Get all sections
    with get_session() as session:
        result = session.run(
            "MATCH (s:Section) RETURN s.id, s.title, s.content_text"
        )
        sections = list(result)

    console.print(f"Linking {len(search_map)} concepts to {len(sections)} sections...")

    # Collect all edges to create, then batch-write in a single session
    edges_to_create: list[tuple[str, str, str]] = []  # (section_id, concept_id, rel_type)

    for record in track(sections, description="Scanning sections..."):
        section_id = record["s.id"]
        section_title = record["s.title"]
        content = (record["s.content_text"] or "").lower()

        if not content:
            continue

        rel_type = _determine_relationship(section_title)

        for concept_id, concept_name, terms in search_map:
            found = any(
                re.search(r"\b" + re.escape(term.lower()) + r"\b", content)
                for term in terms
            )
            if found:
                edges_to_create.append((section_id, concept_id, rel_type))

    # Batch write all edges
    with get_session() as session:
        for sid, cid, rel_type in edges_to_create:
            session.run(f"""
                MATCH (s:Section {{id: $sid}})
                MATCH (c:PolicyConcept {{id: $cid}})
                MERGE (s)-[:{rel_type}]->(c)
            """, {"sid": sid, "cid": cid})
            stats["edges_created"] += 1

    return stats
```

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/pipeline/concepts/
git commit -m "feat(pipeline): add policy concept seeding and section linking"
```

---

### Task 14: CLI — Concept, Inspection & Run-All Commands

**Files:**
- Modify: `packages/pipeline/src/pipeline/cli.py`

- [ ] **Step 1: Add remaining CLI commands**

Append to `packages/pipeline/src/pipeline/cli.py`:

```python
@cli.command("seed-concepts")
def seed_concepts_cmd():
    """Seed initial policy concepts into Neo4j."""
    from pipeline.concepts.seed import seed_concepts

    count = seed_concepts()
    console.print(f"[bold]Seeded {count} policy concepts[/bold]")


@cli.command("link-concepts")
def link_concepts_cmd():
    """Link policy concepts to sections based on content matching."""
    from pipeline.concepts.linker import link_concepts

    stats = link_concepts()
    console.print(f"[bold]Created {stats['edges_created']} concept-section edges[/bold]")


@cli.command()
def stats():
    """Show graph statistics."""
    from pipeline.graph.connection import get_session
    from pipeline.graph import queries

    with get_session() as session:
        nodes = session.run(queries.COUNT_NODES)
        console.print("\n[bold]Nodes:[/bold]")
        for r in nodes:
            console.print(f"  {r['label']}: {r['cnt']}")

        edges = session.run(queries.COUNT_EDGES)
        console.print("\n[bold]Edges:[/bold]")
        for r in edges:
            console.print(f"  {r['rel_type']}: {r['cnt']}")

        # Check embedding coverage
        result = session.run("""
            MATCH (s:Section)
            WITH count(s) AS total,
                 count(CASE WHEN s.embedding IS NOT NULL THEN 1 END) AS with_emb
            RETURN total, with_emb
        """)
        r = result.single()
        if r:
            console.print(f"\n[bold]Embeddings:[/bold] {r['with_emb']}/{r['total']} sections")


@cli.command()
@click.argument("doc_id")
def inspect(doc_id: str):
    """Browse a document's section tree."""
    from pipeline.graph.connection import get_session

    with get_session() as session:
        result = session.run("""
            MATCH (d:Document {id: $doc_id})-[:HAS_SECTION]->(s:Section)
            OPTIONAL MATCH (s)-[:PARENT_OF]->(child:Section)
            RETURN s.section_number, s.title, s.level, s.content_length,
                   collect(child.section_number) AS children
            ORDER BY s.section_number
        """, {"doc_id": doc_id})

        for r in result:
            indent = "  " * (r["s.level"] or 0)
            num = r["s.section_number"] or "—"
            title = r["s.title"] or "(untitled)"
            length = r["s.content_length"] or 0
            console.print(f"{indent}{num} {title} ({length} chars)")


@cli.command()
@click.argument("query_text")
@click.option("-k", "top_k", type=int, default=10, help="Number of results")
def search(query_text: str, top_k: int):
    """Search sections by text using vector similarity."""
    import voyageai
    from pipeline.config import VOYAGE_API_KEY, EMBEDDING_MODEL
    from pipeline.embeddings.indexer import vector_search

    if not VOYAGE_API_KEY:
        console.print("[red]VOYAGE_API_KEY not set[/red]")
        return

    client = voyageai.Client(api_key=VOYAGE_API_KEY)
    result = client.embed([query_text], model=EMBEDDING_MODEL, input_type="query")
    query_embedding = result.embeddings[0]

    results = vector_search(query_embedding, top_k=top_k)
    for r in results:
        console.print(
            f"[bold]{r['policy_number'] or ''}[/bold] "
            f"{r['section_number'] or ''} {r['section_title'] or '(untitled)'} "
            f"[dim](score: {r['score']:.3f})[/dim]"
        )
        # Show first 200 chars of content
        content = (r["content"] or "")[:200]
        if content:
            console.print(f"  {content}...")
        console.print()


@cli.command("run-all")
@click.option("--source", "source_type", type=str, help="Process only this source type")
def run_all(source_type: str | None):
    """Run the full pipeline: parse → load → extract-refs → embed → seed → link."""
    from pipeline.parse.converter import parse_all
    from pipeline.graph.loader import load_all
    from pipeline.references.resolver import extract_and_resolve_all
    from pipeline.embeddings.generator import embed_all
    from pipeline.embeddings.indexer import ensure_vector_index
    from pipeline.concepts.seed import seed_concepts
    from pipeline.concepts.linker import link_concepts

    console.print("[bold]Stage 1: Parse[/bold]")
    parse_stats = parse_all(source_type=source_type)
    console.print(f"  {parse_stats['parsed']} parsed, {parse_stats['skipped']} skipped\n")

    console.print("[bold]Stage 2: Load[/bold]")
    load_stats = load_all(source_type=source_type)
    console.print(f"  {load_stats['loaded']} documents, {load_stats['sections_total']} sections\n")

    console.print("[bold]Stage 3: Cross-references[/bold]")
    ref_stats = extract_and_resolve_all()
    console.print(f"  {ref_stats['resolved']} resolved, {ref_stats['unresolved']} unresolved\n")

    console.print("[bold]Stage 4: Embeddings[/bold]")
    embed_stats = embed_all()
    ensure_vector_index()
    console.print(f"  {embed_stats['embedded']} embedded\n")

    console.print("[bold]Stage 5: Concepts[/bold]")
    seed_count = seed_concepts()
    link_stats = link_concepts()
    console.print(f"  {seed_count} concepts, {link_stats['edges_created']} links\n")

    console.print("[bold green]Pipeline complete![/bold green]")
```

- [ ] **Step 2: Verify CLI shows all commands**

Run: `cd packages/pipeline && .venv/bin/python -m pipeline.cli --help`
Expected: Shows all commands: parse, load, extract-refs, unresolved-refs, embed, seed-concepts, link-concepts, stats, inspect, search, run-all.

- [ ] **Step 3: Run all tests**

Run: `cd packages/pipeline && .venv/bin/python -m pytest tests/ -v`
Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/pipeline/src/pipeline/cli.py
git commit -m "feat(pipeline): add CLI commands for concepts, inspection, search, and run-all"
```

---

### Task 15: End-to-End Validation

This task validates the full pipeline by running it against real documents.

- [ ] **Step 1: Parse a batch of clinical policies**

```bash
cd packages/pipeline && .venv/bin/python -m pipeline.cli parse --source clinical_policy
```

Let it process at least 5-10 documents. Check `data/parsed/clinical-policies/` for JSON and MD output.

- [ ] **Step 2: Load into Neo4j**

```bash
cd packages/pipeline && .venv/bin/python -m pipeline.cli load --source clinical_policy
```

- [ ] **Step 3: Verify in Neo4j Browser**

Open `http://localhost:7474`. Run:

```cypher
MATCH (d:Document)-[:HAS_SECTION]->(s:Section)
RETURN d.title, count(s) AS sections ORDER BY sections DESC LIMIT 10
```

Verify section counts look reasonable (10-60 sections per document).

```cypher
MATCH (s:Section)-[:PARENT_OF]->(child:Section)
RETURN s.document_id, s.section_number, child.section_number LIMIT 20
```

Verify hierarchy looks correct (e.g., 5.0 → 5.1, 5.1 → 5.1.1).

- [ ] **Step 4: Extract cross-references**

```bash
cd packages/pipeline && .venv/bin/python -m pipeline.cli extract-refs
```

Check output: should find some resolved references (especially internal section references).

- [ ] **Step 5: Seed concepts and link**

```bash
cd packages/pipeline && .venv/bin/python -m pipeline.cli seed-concepts
cd packages/pipeline && .venv/bin/python -m pipeline.cli link-concepts
```

- [ ] **Step 6: Check stats**

```bash
cd packages/pipeline && .venv/bin/python -m pipeline.cli stats
```

Expected: Shows Document, Section, PolicyConcept node counts plus edge counts.

- [ ] **Step 7: Run all tests one final time**

```bash
cd packages/pipeline && .venv/bin/python -m pytest tests/ -v
```

- [ ] **Step 8: Commit any remaining changes**

```bash
git add packages/pipeline/
git commit -m "feat(pipeline): complete pipeline with all stages validated end-to-end"
```
