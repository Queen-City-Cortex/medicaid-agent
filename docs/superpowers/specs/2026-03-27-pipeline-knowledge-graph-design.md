# NC Medicaid Navigator — Layer 0: Document Pipeline + Knowledge Graph

**Project:** NC Medicaid Navigator
**Author:** Jeff Hoffman / Queen City Cortex LLC
**Date:** March 27, 2026
**Depends on:** Crawler (complete, at `packages/crawler/`)
**Location:** `packages/pipeline/` (existing monorepo package, docling already installed)

---

## 1. Purpose

Transform the raw PDFs downloaded by the crawler into a navigable knowledge graph. This is the foundation that everything downstream depends on: the agent tools, the retrieval system, and the evaluation harness all query this graph.

The pipeline takes a directory of PDFs with metadata (the crawler's output) and produces:
1. A structured JSON representation of each document (sections, hierarchy, tables)
2. A Neo4j graph with documents, sections, cross-references, and policy concepts as nodes and edges
3. Vector embeddings on section nodes for semantic search

### What This Pipeline Does NOT Do

- Answer questions (that's the agent in Layer 3)
- Evaluate answer quality (that's the eval harness in Layer 1)
- Serve a web UI
- Re-crawl or download documents (that's the crawler)
- Make coverage determinations or clinical decisions

---

## 2. Architecture Overview

```
packages/crawler/data/documents/     Docling        packages/pipeline/data/parsed/
  ├── clinical-policies/           ─────────────>   ├── clinical-policies/
  │     ├── 3K-2_*.pdf                PDF→JSON      │     ├── 3K-2_*.json
  │     └── ...                                     │     └── ...
  ├── bulletins/                                    ├── bulletins/
  ├── state-plan-amendments/                        ├── state-plan-amendments/
  └── waivers/                                      └── waivers/
                                                              │
                                                    Graph Loader (Cypher)
                                                              │
                                                              v
                                                    Neo4j (Community Edition, Docker)
                                                    ├── (:Document) nodes
                                                    ├── (:Section) nodes + hierarchy
                                                    ├── (:PolicyConcept) nodes
                                                    ├── Cross-reference edges
                                                    └── Vector index on Section embeddings
```

**Three stages, run independently:**

1. **Parse** — Docling converts PDFs to structured JSON. CPU-intensive, slow, but only runs once per document (or when a document changes). Caches by file hash.
2. **Load** — Read parsed JSON + crawler metadata, construct graph nodes and edges in Neo4j. Fast. Idempotent (MERGE-based, safe to re-run). Cross-reference extraction happens here.
3. **Embed** — Generate vector embeddings for section text using Voyage AI, store on Neo4j Section nodes. API-bound. Run after load.

---

## 3. Stage 1: Parsing (Docling)

### 3.1 Configuration

```python
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions, TableStructureOptions

pipeline_options = PdfPipelineOptions()
pipeline_options.do_ocr = True
pipeline_options.do_table_structure = True
pipeline_options.table_structure_options = TableStructureOptions(
    do_cell_matching=True
)

converter = DocumentConverter(
    format_options={
        InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
    }
)
```

OCR enabled (auto-detects scanned pages). Table structure enabled (coverage criteria tables are critical).

### 3.2 Parsing Workflow

```
For each PDF in packages/crawler/data/documents/:
  1. Check if parsed JSON already exists with matching file hash → skip if so
  2. Run DocumentConverter.convert(pdf_path)
  3. Export to JSON: result.document.export_to_dict()
  4. Save JSON to packages/pipeline/data/parsed/{source_type}/{filename}.json
  5. Save Markdown to packages/pipeline/data/parsed/{source_type}/{filename}.md
  6. Write metadata sidecar: source_pdf_hash, section_count, table_count, parse_time
  7. Log: document title, section count, table count, parse time, any warnings
```

### 3.3 Metadata Sidecar

Each parsed document gets a `{filename}.meta.json`:

```json
{
  "source_pdf": "../../crawler/data/documents/clinical-policies/3K-2_capda.pdf",
  "source_pdf_hash": "sha256:abc123...",
  "parsed_at": "2026-03-27T14:32:00Z",
  "docling_version": "2.82.0",
  "section_count": 47,
  "table_count": 12,
  "page_count": 34,
  "parse_time_seconds": 8.2,
  "warnings": []
}
```

---

## 4. Stage 2: Graph Construction (Neo4j)

### 4.1 Neo4j Setup

Neo4j Community Edition via Docker:

```bash
docker run -d \
  --name neo4j-medicaid \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/medicaid-dev \
  -v neo4j-medicaid-data:/data \
  neo4j:community
```

Port 7474: browser UI. Port 7687: Bolt protocol for the Python driver.

### 4.2 Graph Schema

```cypher
// Constraints
CREATE CONSTRAINT doc_id IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE;
CREATE CONSTRAINT section_id IF NOT EXISTS FOR (s:Section) REQUIRE s.id IS UNIQUE;
CREATE CONSTRAINT concept_id IF NOT EXISTS FOR (c:PolicyConcept) REQUIRE c.id IS UNIQUE;
```

**Document nodes** — `id` format: `doc:{source_type}:{policy_number_or_slug}`

```
(:Document {
  id, title, document_type, policy_number, category,
  effective_date, status, applicable_programs, applicable_waivers,
  source_url, local_path, pdf_path, page_count, section_count, last_indexed
})
```

**Section nodes** — `id` format: `sec:{document_id}:{section_path}`

```
(:Section {
  id, document_id, section_number, title, level,
  content_text, content_length, has_tables, has_definitions,
  page_start, page_end
})
```

**PolicyConcept nodes** — `id` format: `concept:{slugified-name}`

```
(:PolicyConcept {
  id, name, aliases, category
})
```

**Relationships:**

| Relationship | From | To | Properties |
|---|---|---|---|
| `HAS_SECTION` | Document | Section | — |
| `PARENT_OF` | Section | Section | — |
| `NEXT_SIBLING` | Section | Section | — |
| `REFERENCES` | Section | Section | reference_text, reference_type |
| `REFERENCES_DOCUMENT` | Section | Document | reference_text |
| `AMENDS` | Document | Document | — |
| `SUPERSEDES` | Document | Document | — |
| `RELATED_TO` | Document | Document | — |
| `DEFINES` | Section | PolicyConcept | — |
| `COVERS` | Section | PolicyConcept | — |
| `RESTRICTS` | Section | PolicyConcept | — |
| `REQUIRES` | Section | PolicyConcept | — |

### 4.3 Loading Workflow

```
For each parsed JSON in packages/pipeline/data/parsed/:
  1. Read the JSON + metadata sidecar
  2. Read crawler registry entry (for source_url, category, etc.) from crawler's SQLite DB
  3. MERGE Document node
  4. Walk the DoclingDocument body tree via iterate_items():
     a. Section headings → MERGE Section nodes with HAS_SECTION, PARENT_OF, NEXT_SIBLING edges
     b. Paragraphs/list items → append to current section's content_text
     c. Tables → attach to containing section (has_tables = true, table content in content_text as markdown)
  5. Extract section numbers from headings (regex: "1.0", "5.1.3", "Section 5.2.2")
  6. Run cross-reference extraction (Section 5)
  7. Log: document ID, sections created, edges created, cross-references found
```

Idempotent via `MERGE` on `id` properties.

### 4.4 Mapping DoclingDocument to Graph

```python
from docling_core.types.doc import TextItem, TableItem, DocItemLabel

for item, level in doc.iterate_items():
    if isinstance(item, TextItem):
        if item.label in (DocItemLabel.SECTION_HEADER, DocItemLabel.TITLE):
            # New section — create Section node, set hierarchy edges
        elif item.label == DocItemLabel.PARAGRAPH:
            # Append to current section's content_text
        elif item.label == DocItemLabel.LIST_ITEM:
            # Append to current section's content_text
    elif isinstance(item, TableItem):
        # Export table to markdown, append to current section
```

If Docling's hierarchy detection needs correction, a post-processing step re-infers hierarchy from section numbering patterns (e.g., "5.0" → level 1, "5.1" → level 2, "5.1.3" → level 3).

---

## 5. Cross-Reference Extraction

### 5.1 Reference Patterns

```python
REFERENCE_PATTERNS = [
    # Cross-document: "Clinical Coverage Policy 3K-2"
    r'Clinical Coverage Policy(?:\s+No\.?)?\s*:?\s*([A-Z0-9]+(?:-[A-Z0-9]+)*)',

    # Section references: "Section 5.1.3" or "Subsection 5.3.3"
    r'(?:Section|Subsection)\s+([\d]+(?:\.[\d]+)*)',

    # Attachment references: "Attachment A"
    r'Attachment\s+([A-Z])',

    # Federal regulation: "42 CFR 484.65"
    r'(\d+)\s*CFR\s*§?\s*([\d]+(?:\.[\d]+)*)',

    # SPA references: "SPA 24-0001"
    r'SPA\s+([\d]+-[\d]+)',

    # Waiver references: "1915(c)"
    r'1915\s*\([a-z]\)',
]
```

### 5.2 Two-Pass Strategy

**Pass 1 (regex, deterministic):** Run patterns against every section's content_text. For each match, attempt to resolve to a graph node. Resolved → create edge. Unresolved → store in `data/unresolved-references.json`.

**Pass 2 (LLM-assisted, optional):** For sections with low reference density or known ambiguity, use Claude Haiku for structured extraction. Build-time cost only (~$5-10 for full corpus).

### 5.3 Reference Resolution

```
1. Parse target identifier (e.g., "3K-2" → policy_number)
2. MATCH (d:Document {policy_number: $policyNumber}) RETURN d
3. If section also specified: MATCH section within that document
4. Create REFERENCES or REFERENCES_DOCUMENT edge with raw reference text
```

Unresolved references stored for review — they indicate corpus gaps or parsing errors.

---

## 6. Stage 3: Embedding Generation

### 6.1 Model

Primary: `voyage-law-2` (1024 dims, 16K context, tops legal retrieval benchmarks, $0.12/MTok).
Benchmark against: `voyage-4-large`, `text-embedding-3-small`.

### 6.2 Contextualized Embedding Text

Prepend heading hierarchy to section content before embedding:

```python
def build_embedding_text(section, ancestors):
    heading_chain = " > ".join([a.title for a in ancestors if a.title])
    return f"{heading_chain}\n{section.content_text}"
```

Example: `"CAP/DA > 5.0 Requirements for Coverage > 5.1 Eligibility\n[content]"`

### 6.3 Workflow

1. Query Neo4j for Section nodes without embeddings
2. Build contextualized text, batch per Voyage API limits (128 inputs, 120K tokens)
3. Call Voyage API
4. Write embeddings back to Section nodes
5. Create vector index:

```cypher
CREATE VECTOR INDEX section_embeddings IF NOT EXISTS
FOR (s:Section) ON (s.embedding)
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 1024,
    `vector.similarity_function`: 'cosine'
  }
};
```

### 6.4 Cost

~9,000 sections × ~500 tokens = ~4.5M tokens. voyage-law-2 at $0.12/MTok = **~$0.54** for the full corpus.

---

## 7. Policy Concept Seeding

### 7.1 Seed List

~30 initial concepts across categories: programs (CAP/DA, Innovations, TBI, PACE), services (PCS, PDN, DME, respite, CLS), processes (prior auth, medical necessity, LOC, ISP, EPSDT, fair hearing), eligibility (institutional LOC, financial, functional), entities (LME-MCO, MCO, DHHS, CMS).

### 7.2 Concept-Section Linking

Keyword/regex pass: if concept name or alias appears in section content_text, create edge based on context:
- "Definitions" heading → DEFINES
- "Coverage"/"Services" heading → COVERS
- "Limitations"/"Exclusions" heading → RESTRICTS
- "requires [concept]" pattern → REQUIRES
- Default → COVERS

---

## 8. Project Structure

```
packages/pipeline/
├── src/pipeline/
│   ├── __init__.py
│   ├── cli.py                        # CLI entry point (click)
│   ├── config.py                     # Paths, Neo4j connection, API keys (env vars)
│   ├── parse/
│   │   ├── __init__.py
│   │   ├── converter.py              # Docling DocumentConverter setup and PDF→JSON
│   │   └── post_process.py           # Section number extraction, hierarchy repair
│   ├── graph/
│   │   ├── __init__.py
│   │   ├── connection.py             # Neo4j driver setup, session management
│   │   ├── schema.py                 # Constraint creation, index setup
│   │   ├── loader.py                 # JSON → Neo4j node/edge creation
│   │   └── queries.py                # Reusable Cypher query templates
│   ├── references/
│   │   ├── __init__.py
│   │   ├── extractor.py              # Regex-based cross-reference extraction
│   │   ├── resolver.py               # Reference → graph node resolution
│   │   └── llm_extractor.py          # LLM-assisted extraction (optional pass 2)
│   ├── embeddings/
│   │   ├── __init__.py
│   │   ├── generator.py              # Embedding generation (Voyage API)
│   │   └── indexer.py                # Neo4j vector index creation and population
│   └── concepts/
│       ├── __init__.py
│       ├── seed.py                   # Initial PolicyConcept loading
│       └── linker.py                 # Concept-Section relationship creation
├── data/
│   ├── parsed/                       # Docling JSON output (mirrors crawler structure)
│   └── unresolved-references.json
├── tests/
│   ├── test_converter.py
│   ├── test_loader.py
│   ├── test_extractor.py
│   ├── test_resolver.py
│   ├── test_post_process.py
│   └── fixtures/                     # Sample Docling JSON outputs
├── pyproject.toml
└── README.md
```

### 8.1 Dependencies

```toml
dependencies = [
    "docling>=2.0",
    "docling-core>=2.8",
    "neo4j>=5.25",
    "voyageai>=0.3",
    "click>=8.0",
    "pydantic>=2.0",
    "rich>=13.0",
]
```

---

## 9. CLI Interface

```bash
# Parse
python -m pipeline.cli parse
python -m pipeline.cli parse --file path/to/specific.pdf
python -m pipeline.cli parse --force

# Load
python -m pipeline.cli load
python -m pipeline.cli load --source clinical_policy
python -m pipeline.cli load --reset

# Cross-references
python -m pipeline.cli extract-refs
python -m pipeline.cli extract-refs --llm-assist
python -m pipeline.cli unresolved-refs

# Embed
python -m pipeline.cli embed
python -m pipeline.cli embed --model voyage-law-2

# Concepts
python -m pipeline.cli seed-concepts
python -m pipeline.cli link-concepts

# Inspection
python -m pipeline.cli stats
python -m pipeline.cli inspect doc:clinical_policy:3K-2
python -m pipeline.cli refs sec:doc:clinical_policy:3K-2:5.1
python -m pipeline.cli search "CAP/DA eligibility for home modifications"

# Full pipeline
python -m pipeline.cli run-all
```

---

## 10. Configuration

```python
# packages/pipeline/src/pipeline/config.py
from pathlib import Path
import os

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CRAWLER_DATA_DIR = PROJECT_ROOT.parent / "crawler" / "data" / "documents"
CRAWLER_DB_PATH = PROJECT_ROOT.parent / "crawler" / "data" / "crawler.db"
PARSED_DATA_DIR = PROJECT_ROOT / "data" / "parsed"

NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "medicaid-dev")
NEO4J_DATABASE = os.environ.get("NEO4J_DATABASE", "neo4j")

EMBEDDING_MODEL = "voyage-law-2"
EMBEDDING_DIMENSIONS = 1024
VOYAGE_API_KEY = os.environ.get("VOYAGE_API_KEY", "")

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
LLM_MODEL = "claude-haiku-4-5-20251001"

PARSE_BATCH_SIZE = 10
EMBED_BATCH_SIZE = 128
```

All secrets from environment variables.

---

## 11. Testing Strategy

### Unit Tests
- Cross-reference regex patterns against known reference strings
- Section number parsing from heading text
- Graph loader against synthetic DoclingDocument (in-memory)
- Reference resolver against known graph state

### Integration Tests
- End-to-end parse+load for one document (3K-2 CAP/DA): verify section count, hierarchy, tables
- Cross-reference resolution across 5-10 related policies
- Vector search sanity check

### Fixtures
Save Docling JSON output for 3-5 representative documents. Tests run against fixtures without Docling dependency.

---

## 12. Known Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Docling misidentifies section hierarchy | Post-processing step re-infers from section numbering patterns |
| Cross-reference regex misses non-standard phrasing | Two-pass: regex first, LLM second. Review unresolved references. |
| Docling slow on large PDFs | One-time cost per document. Cache parsed JSON by file hash. |
| Embedding model quality unclear | Benchmark voyage-law-2 vs alternatives. Defer final choice to eval harness. |
| Section text too long for embedding context | voyage-law-2 handles 16K tokens. Split at paragraph boundaries for rare long sections. |

---

## 13. Success Criteria

1. Every PDF in crawler output has a corresponding parsed JSON with correct section hierarchy.
2. Neo4j contains Document and Section nodes for all parsed documents with correct PARENT_OF relationships.
3. Cross-references between known related documents (e.g., 3A↔10A, 3K-2↔3L) are graph edges.
4. Vector search for "CAP/DA eligibility for personal care services" returns 3K-2 sections in top 5.
5. `stats` command shows: ~300 documents, ~8,000-10,000 sections, ~500+ cross-reference edges, ~30 concepts, ~2,000+ concept-section edges, 100% sections with embeddings, <20% unresolved references.
6. Graph explorable in Neo4j Browser matching source PDF structure.

---

## 14. Implementation Order

1. Parse pipeline (converter + CLI parse command + caching)
2. Neo4j setup + schema + loader (Docker + CLI load command)
3. Cross-reference extraction (regex patterns + resolver + CLI extract-refs)
4. Embeddings (Voyage API + vector index + CLI embed)
5. Concept seeding + linking (CLI seed-concepts + link-concepts)
6. Inspection tools (CLI stats, inspect, search)
