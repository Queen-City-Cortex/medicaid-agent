"""Convert supported source files into structured parsed JSON."""

from __future__ import annotations

import hashlib
import json
import os
import time
from datetime import datetime, timezone
from multiprocessing import get_context
from pathlib import Path
from queue import Empty

import docling
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import (
    PdfPipelineOptions,
    TableStructureOptions,
)
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling_core.types.doc import DocItemLabel
from docx import Document as WordDocument
from openpyxl import load_workbook
from rich.console import Console

from pipeline.config import (
    CRAWLER_DATA_DIR,
    PARSED_DATA_DIR,
    PARSE_SUPPORTED_FILE_FORMATS,
    SOURCE_TYPE_DIRS,
)
from pipeline.parse.post_process import extract_section_number

console = Console()
PARSE_CACHE_VERSION = 2
DEFAULT_PARSE_TIMEOUT_SECONDS = 600


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


def artifact_stem_for_source_path(source_path: Path) -> str:
    """Build a parsed artifact stem that is stable across supported formats."""
    suffix = source_path.suffix.lower()
    if suffix == ".pdf":
        return source_path.stem
    return f"{source_path.stem}__{suffix.lstrip('.')}"


def parsed_output_paths(source_path: Path, source_type: str) -> tuple[Path, Path, Path]:
    out_dir = PARSED_DATA_DIR / SOURCE_TYPE_DIRS.get(source_type, source_type)
    out_dir.mkdir(parents=True, exist_ok=True)

    stem = artifact_stem_for_source_path(source_path)
    return (
        out_dir / f"{stem}.json",
        out_dir / f"{stem}.md",
        out_dir / f"{stem}.meta.json",
    )


def get_parse_timeout_seconds() -> int:
    raw_value = os.getenv("PIPELINE_PARSE_TIMEOUT_SECONDS")
    if raw_value is None:
        return DEFAULT_PARSE_TIMEOUT_SECONDS

    try:
        return max(0, int(raw_value))
    except ValueError:
        return DEFAULT_PARSE_TIMEOUT_SECONDS


def should_parse(source_path: Path, meta_path: Path) -> bool:
    """Check if a source file needs (re-)parsing by comparing file hashes."""
    if not meta_path.exists():
        return True
    try:
        meta = json.loads(meta_path.read_text())
        if meta.get("parse_cache_version") != PARSE_CACHE_VERSION:
            return True
        stored_hash = meta.get("source_file_hash") or meta.get("source_pdf_hash") or ""
        current_hash = f"sha256:{file_sha256(source_path)}"
        return stored_hash != current_hash
    except (json.JSONDecodeError, KeyError):
        return True


def _new_synthetic_section(title: str | None, level: int) -> dict:
    normalized_title = title.strip() if title else None
    return {
        "section_number": extract_section_number(normalized_title) if normalized_title else None,
        "title": normalized_title,
        "level": level,
        "content_text": "",
        "has_tables": False,
        "has_definitions": bool(
            normalized_title and "definition" in normalized_title.lower()
        ),
    }


def _append_section_content(section: dict, text: str) -> None:
    if not text.strip():
        return
    prefix = "\n" if section["content_text"] else ""
    section["content_text"] += f"{prefix}{text.strip()}"


def _render_docling_table(table_entry: dict | None) -> str:
    if not isinstance(table_entry, dict):
        return ""

    table_cells = (((table_entry.get("data") or {}).get("table_cells")) or [])
    if not isinstance(table_cells, list):
        return ""

    rows: dict[int, dict[int, str]] = {}
    max_col = -1
    for cell in table_cells:
        if not isinstance(cell, dict):
            continue
        row_idx = cell.get("start_row_offset_idx")
        col_idx = cell.get("start_col_offset_idx")
        if not isinstance(row_idx, int) or not isinstance(col_idx, int):
            continue

        cell_text = " ".join(str(cell.get("text") or "").split())
        if not cell_text:
            continue

        rows.setdefault(row_idx, {})[col_idx] = cell_text
        end_col = cell.get("end_col_offset_idx")
        if isinstance(end_col, int):
            max_col = max(max_col, end_col - 1)
        else:
            max_col = max(max_col, col_idx)

    if not rows or max_col < 0:
        return ""

    rendered_rows: list[str] = []
    for row_idx in sorted(rows):
        row = rows[row_idx]
        columns = [row.get(col_idx, "") for col_idx in range(max_col + 1)]
        if any(column.strip() for column in columns):
            rendered_rows.append(" | ".join(columns).strip())

    return "\n".join(rendered_rows).strip()


def _compute_quality_flags(
    sections: list[dict],
    *,
    reported_section_count: int | None = None,
) -> list[str]:
    quality_flags: list[str] = []
    section_count = reported_section_count if reported_section_count is not None else len(sections)
    if section_count == 0:
        quality_flags.append("zero_section_parse")

    content_char_count = sum(len((section.get("content_text") or "").strip()) for section in sections)
    if content_char_count == 0:
        quality_flags.append("title_only_or_blank_body")

    return quality_flags


def _render_synthetic_markdown(sections: list[dict]) -> str:
    parts: list[str] = []
    for index, section in enumerate(sections):
        title = section.get("title")
        content = (section.get("content_text") or "").strip()
        level = max(1, min(int(section.get("level", 1) or 1), 6))

        if title:
            block = f"{'#' * level} {title}"
            if content:
                block += f"\n\n{content}"
            parts.append(block)
        elif content:
            parts.append(content)
        else:
            parts.append(f"Section {index + 1}")

    return "\n\n".join(part for part in parts if part).strip()


def parse_pdf(pdf_path: Path, converter: DocumentConverter) -> dict:
    """Parse a single PDF and return the parsed payload plus metadata."""
    start = time.time()
    result = converter.convert(str(pdf_path))
    elapsed = time.time() - start

    doc = result.document
    doc_dict = doc.export_to_dict()
    md_text = doc.export_to_markdown()
    table_entries = iter(doc_dict.get("tables", [])) if isinstance(doc_dict.get("tables"), list) else iter(())

    section_count = 0
    table_count = 0
    content_char_count = 0
    synthetic_sections: list[dict] = []
    current_section: dict | None = None

    for item, level in doc.iterate_items():
        label = getattr(item, "label", None)
        text = (getattr(item, "text", "") or "").strip()

        if label in (DocItemLabel.SECTION_HEADER, DocItemLabel.TITLE):
            if current_section is not None:
                synthetic_sections.append(current_section)
            current_section = _new_synthetic_section(text or None, level or 1)
            section_count += 1
        elif label == DocItemLabel.TABLE:
            table_count += 1
            if current_section is None:
                current_section = _new_synthetic_section(None, 0)
            current_section["has_tables"] = True
            table_text = _render_docling_table(next(table_entries, None))
            if table_text:
                _append_section_content(current_section, table_text)
                content_char_count += len(table_text)
        elif label in (DocItemLabel.PARAGRAPH, DocItemLabel.LIST_ITEM):
            if current_section is None:
                current_section = _new_synthetic_section(None, 0)
            _append_section_content(current_section, text)
            content_char_count += len(text)

    if current_section is not None:
        synthetic_sections.append(current_section)

    _num_pages = getattr(doc, "num_pages", None)
    if callable(_num_pages):
        page_count = _num_pages()
    elif _num_pages is not None:
        page_count = _num_pages
    else:
        page_count = len(getattr(doc, "pages", []))

    reported_section_count = section_count if section_count > 0 else len(synthetic_sections)
    quality_flags = _compute_quality_flags(
        synthetic_sections,
        reported_section_count=reported_section_count,
    )

    return {
        "payload": doc_dict,
        "markdown": md_text,
        "section_count": reported_section_count,
        "table_count": table_count,
        "page_count": page_count,
        "content_char_count": content_char_count,
        "parse_time_seconds": round(elapsed, 2),
        "source_format": "pdf",
        "parse_backend": "docling",
        "parse_status": "parsed",
        "quality_flags": quality_flags,
        "answer_ready": len(quality_flags) == 0,
    }


def _docx_heading_level(style_name: str | None) -> int | None:
    if not style_name:
        return None
    normalized = style_name.strip().lower()
    if not normalized.startswith("heading "):
        return None
    suffix = normalized.removeprefix("heading ").strip()
    if not suffix.isdigit():
        return None
    return max(1, min(int(suffix), 6))


def parse_docx(docx_path: Path) -> dict:
    """Extract headings and paragraphs from a DOCX into synthetic sections."""
    start = time.time()
    document = WordDocument(str(docx_path))
    sections: list[dict] = []
    current_section: dict | None = None

    for paragraph in document.paragraphs:
        text = paragraph.text.strip()
        if not text:
            continue

        level = _docx_heading_level(getattr(paragraph.style, "name", None))
        if level is not None:
            if current_section is not None:
                sections.append(current_section)
            current_section = _new_synthetic_section(text, level)
            continue

        if current_section is None:
            current_section = _new_synthetic_section(None, 0)
        _append_section_content(current_section, text)

    for table in document.tables:
        table_lines: list[str] = []
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells]
            if any(cells):
                table_lines.append(" | ".join(cells))

        if not table_lines:
            continue

        if current_section is None:
            current_section = _new_synthetic_section(None, 0)
        _append_section_content(current_section, "\n".join(table_lines))
        current_section["has_tables"] = True

    if current_section is not None:
        sections.append(current_section)

    quality_flags = _compute_quality_flags(sections, reported_section_count=len(sections))
    content_char_count = sum(len((section.get("content_text") or "").strip()) for section in sections)

    return {
        "payload": {
            "synthetic_sections": sections,
            "source_format": "docx",
        },
        "markdown": _render_synthetic_markdown(sections),
        "section_count": len(sections),
        "table_count": sum(1 for section in sections if section.get("has_tables")),
        "page_count": 0,
        "content_char_count": content_char_count,
        "parse_time_seconds": round(time.time() - start, 2),
        "source_format": "docx",
        "parse_backend": "python-docx",
        "parse_status": "parsed",
        "quality_flags": quality_flags,
        "answer_ready": len(quality_flags) == 0,
    }


def parse_xlsx(xlsx_path: Path) -> dict:
    """Extract spreadsheet sheets into synthetic sections with preserved table text."""
    start = time.time()
    workbook = load_workbook(filename=str(xlsx_path), read_only=True, data_only=True)
    sections: list[dict] = []

    try:
        for sheet in workbook.worksheets:
            rows: list[list[str]] = []
            for row in sheet.iter_rows(values_only=True):
                values = [str(value).strip() if value is not None else "" for value in row]
                if any(values):
                    rows.append(values)

            if not rows:
                continue

            table_text = "\n".join(" | ".join(values) for values in rows)
            section = _new_synthetic_section(sheet.title, 1)
            section["content_text"] = table_text
            section["has_tables"] = True
            sections.append(section)
    finally:
        workbook.close()

    quality_flags = _compute_quality_flags(sections, reported_section_count=len(sections))
    content_char_count = sum(len((section.get("content_text") or "").strip()) for section in sections)

    return {
        "payload": {
            "synthetic_sections": sections,
            "source_format": "xlsx",
        },
        "markdown": _render_synthetic_markdown(sections),
        "section_count": len(sections),
        "table_count": len(sections),
        "page_count": len(sections),
        "content_char_count": content_char_count,
        "parse_time_seconds": round(time.time() - start, 2),
        "source_format": "xlsx",
        "parse_backend": "openpyxl",
        "parse_status": "parsed",
        "quality_flags": quality_flags,
        "answer_ready": len(quality_flags) == 0,
    }


def save_parsed(
    source_path: Path,
    parsed: dict,
    source_type: str,
) -> Path:
    """Save parsed JSON, markdown, and metadata sidecar."""
    json_path, md_path, meta_path = parsed_output_paths(source_path, source_type)

    json_path.write_text(json.dumps(parsed["payload"], indent=2, default=str))
    md_path.write_text(parsed["markdown"])

    source_hash = f"sha256:{file_sha256(source_path)}"
    meta = {
        "source_file": str(source_path),
        "source_file_hash": source_hash,
        "source_pdf": str(source_path),
        "source_pdf_hash": source_hash,
        "parsed_at": datetime.now(timezone.utc).isoformat(),
        "docling_version": getattr(docling, "__version__", "unknown"),
        "parse_cache_version": PARSE_CACHE_VERSION,
        "source_format": parsed["source_format"],
        "parse_backend": parsed["parse_backend"],
        "parse_status": parsed["parse_status"],
        "quality_flags": parsed["quality_flags"],
        "answer_ready": parsed["answer_ready"],
        "section_count": parsed["section_count"],
        "table_count": parsed["table_count"],
        "page_count": parsed["page_count"],
        "content_char_count": parsed["content_char_count"],
        "parse_time_seconds": parsed["parse_time_seconds"],
        "warnings": parsed["quality_flags"],
    }
    meta_path.write_text(json.dumps(meta, indent=2))

    return json_path


def save_parse_error(source_path: Path, source_type: str, error: Exception) -> None:
    """Persist parse failure metadata so audit-corpus can classify exceptions explicitly."""
    _, _, meta_path = parsed_output_paths(source_path, source_type)
    source_hash = f"sha256:{file_sha256(source_path)}"
    meta = {
        "source_file": str(source_path),
        "source_file_hash": source_hash,
        "source_pdf": str(source_path),
        "source_pdf_hash": source_hash,
        "parsed_at": datetime.now(timezone.utc).isoformat(),
        "docling_version": getattr(docling, "__version__", "unknown"),
        "source_format": source_path.suffix.lower().lstrip("."),
        "parse_backend": {
            ".pdf": "docling",
            ".docx": "python-docx",
            ".xlsx": "openpyxl",
        }.get(source_path.suffix.lower(), "unknown"),
        "parse_status": "parse_exception",
        "quality_flags": ["parse_exception"],
        "answer_ready": False,
        "error_message": str(error),
        "section_count": 0,
        "table_count": 0,
        "page_count": 0,
        "content_char_count": 0,
        "parse_time_seconds": 0,
        "warnings": ["parse_exception"],
    }
    meta_path.write_text(json.dumps(meta, indent=2))


def discover_source_files(source_type: str | None = None) -> list[Path]:
    """Find all supported source files in the crawler's data directory."""
    source_files: list[Path] = []

    def collect_from_directory(dir_name: str) -> None:
        source_dir = CRAWLER_DATA_DIR / dir_name
        if not source_dir.exists():
            return
        for suffix in PARSE_SUPPORTED_FILE_FORMATS:
            source_files.extend(sorted(source_dir.glob(f"*{suffix}")))

    if source_type:
        collect_from_directory(SOURCE_TYPE_DIRS.get(source_type, source_type))
    else:
        for dir_name in SOURCE_TYPE_DIRS.values():
            collect_from_directory(dir_name)

    return source_files


def source_type_for_file(source_path: Path) -> str:
    """Infer source_type from the source file's parent directory name."""
    dir_name = source_path.parent.name
    for source_type, configured_dir_name in SOURCE_TYPE_DIRS.items():
        if configured_dir_name == dir_name:
            return source_type
    return "unknown"


def parse_supported_file(
    source_path: Path,
    converter: DocumentConverter | None,
) -> dict:
    suffix = source_path.suffix.lower()
    if suffix == ".pdf":
        if converter is None:
            raise ValueError("PDF parsing requires a DocumentConverter")
        return parse_pdf(source_path, converter)
    if suffix == ".docx":
        return parse_docx(source_path)
    if suffix == ".xlsx":
        return parse_xlsx(source_path)
    raise ValueError(f"Unsupported parse format: {source_path.suffix}")


def summarize_parsed_output(parsed: dict) -> dict:
    return {
        "section_count": parsed["section_count"],
        "table_count": parsed["table_count"],
        "parse_time_seconds": parsed["parse_time_seconds"],
    }


def parse_and_save_supported_file(
    source_path: Path,
    source_type: str,
    converter: DocumentConverter | None,
) -> dict:
    parsed = parse_supported_file(source_path, converter)
    save_parsed(source_path, parsed, source_type)
    return summarize_parsed_output(parsed)


def _parse_supported_file_worker(
    source_path_str: str,
    source_type: str,
    result_queue,
) -> None:
    source_path = Path(source_path_str)
    try:
        converter = create_converter() if source_path.suffix.lower() == ".pdf" else None
        parsed = parse_supported_file(source_path, converter)
        save_parsed(source_path, parsed, source_type)
        result_queue.put({"ok": True, "summary": summarize_parsed_output(parsed)})
    except Exception as error:  # pragma: no cover - exercised via parent wrapper
        result_queue.put(
            {
                "ok": False,
                "error_message": f"{type(error).__name__}: {error}",
            }
        )


def parse_and_save_supported_file_with_timeout(
    source_path: Path,
    source_type: str,
    timeout_seconds: int,
) -> dict:
    ctx = get_context("spawn")
    result_queue = ctx.Queue()
    process = ctx.Process(
        target=_parse_supported_file_worker,
        args=(str(source_path), source_type, result_queue),
    )
    process.start()
    process.join(timeout_seconds)

    if process.is_alive():
        process.terminate()
        process.join(5)
        if process.is_alive():
            process.kill()
            process.join()
        raise TimeoutError(
            f"parse timed out after {timeout_seconds} seconds"
        )

    try:
        result = result_queue.get(timeout=1)
    except Empty as error:
        exit_code = process.exitcode
        raise RuntimeError(
            f"parse worker exited without result (exit code {exit_code})"
        ) from error
    finally:
        result_queue.close()
        result_queue.join_thread()

    if not result.get("ok"):
        raise RuntimeError(result.get("error_message") or "parse worker failed")

    return result["summary"]


def parse_all(
    source_type: str | None = None,
    force: bool = False,
    file_path: Path | None = None,
) -> dict:
    """Parse all supported source files. Returns stats dict."""
    converter: DocumentConverter | None = None
    parse_timeout_seconds = get_parse_timeout_seconds()
    stats = {"parsed": 0, "skipped": 0, "errors": 0, "timed_out": 0}

    if file_path:
        source_files = [file_path]
    else:
        source_files = discover_source_files(source_type)

    console.print(f"[bold]Found {len(source_files)} supported source files to process[/bold]")

    total_files = len(source_files)
    for index, source_path in enumerate(source_files, start=1):
        source_type_name = source_type_for_file(source_path)
        _, _, meta_path = parsed_output_paths(source_path, source_type_name)

        if not force and not should_parse(source_path, meta_path):
            stats["skipped"] += 1
            console.print(f"  [{index}/{total_files}] Skipping {source_path.name} (cached)")
            continue

        try:
            console.print(f"  [{index}/{total_files}] Parsing {source_path.name}...", end=" ")
            if source_path.suffix.lower() == ".pdf" and parse_timeout_seconds > 0:
                parsed_summary = parse_and_save_supported_file_with_timeout(
                    source_path,
                    source_type_name,
                    parse_timeout_seconds,
                )
            else:
                converter_to_use: DocumentConverter | None = None
                if source_path.suffix.lower() == ".pdf":
                    if converter is None:
                        converter = create_converter()
                    converter_to_use = converter
                parsed_summary = parse_and_save_supported_file(
                    source_path,
                    source_type_name,
                    converter_to_use,
                )
            console.print(
                f"[green]OK[/green] "
                f"({parsed_summary['section_count']} sections, "
                f"{parsed_summary['table_count']} tables, "
                f"{parsed_summary['parse_time_seconds']}s)"
            )
            stats["parsed"] += 1
        except Exception as e:
            save_parse_error(source_path, source_type_name, e)
            console.print(f"[red]ERROR: {e}[/red]")
            stats["errors"] += 1
            if isinstance(e, TimeoutError):
                stats["timed_out"] += 1

    return stats
