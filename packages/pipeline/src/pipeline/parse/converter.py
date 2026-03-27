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
