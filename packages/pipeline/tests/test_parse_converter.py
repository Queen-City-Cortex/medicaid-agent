"""Tests for supported source-file parsing beyond PDFs."""

import json
import subprocess
import sys
import textwrap
from pathlib import Path

from docling_core.types.doc import DocItemLabel
from docx import Document as WordDocument
from openpyxl import Workbook
from pptx import Presentation

from pipeline.parse.converter import (
    PARSE_CACHE_VERSION,
    artifact_stem_for_source_path,
    parse_all,
    parse_doc,
    parse_docx,
    parse_pdf,
    parse_pptx,
    parse_xls,
    parse_xlsx,
    should_parse,
)


def test_converter_preloads_stdlib_typing_before_docling_imports():
    script = textwrap.dedent(
        """
        import builtins
        import sys

        real_import = builtins.__import__
        sys.modules.pop("typing", None)

        def guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
            if (name == "docling" or name.startswith("docling.")) and "typing" not in sys.modules:
                raise RuntimeError("docling imported before standard-library typing")
            return real_import(name, globals, locals, fromlist, level)

        builtins.__import__ = guarded_import
        import pipeline.parse.converter

        typing_path = getattr(sys.modules["typing"], "__file__", "")
        assert "site-packages/cv2/typing" not in typing_path
        """
    )

    result = subprocess.run(
        [sys.executable, "-c", script],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr


def test_artifact_stem_adds_format_suffix_for_non_pdf_sources():
    assert artifact_stem_for_source_path(Path("/tmp/example.pdf")) == "example"
    assert artifact_stem_for_source_path(Path("/tmp/example.docx")) == "example__docx"
    assert artifact_stem_for_source_path(Path("/tmp/example.xlsx")) == "example__xlsx"


def test_parse_docx_extracts_headings_and_paragraph_content(tmp_path):
    source_path = tmp_path / "billing-guide.docx"

    document = WordDocument()
    document.add_heading("1.0 Overview", level=1)
    document.add_paragraph("This document explains the billing workflow.")
    document.save(source_path)

    parsed = parse_docx(source_path)

    assert parsed["source_format"] == "docx"
    assert parsed["section_count"] == 1
    assert parsed["answer_ready"] is True
    assert parsed["payload"]["synthetic_sections"][0]["title"] == "1.0 Overview"
    assert "billing workflow" in parsed["payload"]["synthetic_sections"][0]["content_text"]


def test_parse_xlsx_extracts_sheets_into_synthetic_sections(tmp_path):
    source_path = tmp_path / "fee-schedule.xlsx"

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Rates"
    sheet.append(["Code", "Rate"])
    sheet.append(["T1001", "125.00"])
    workbook.save(source_path)

    parsed = parse_xlsx(source_path)

    assert parsed["source_format"] == "xlsx"
    assert parsed["section_count"] == 1
    assert parsed["answer_ready"] is True
    assert parsed["payload"]["synthetic_sections"][0]["title"] == "Rates"
    assert "T1001" in parsed["payload"]["synthetic_sections"][0]["content_text"]


def test_parse_xls_extracts_legacy_workbook_rows(monkeypatch, tmp_path):
    source_path = tmp_path / "legacy-rates.xls"
    source_path.write_bytes(b"legacy workbook")

    class FakeSheet:
        name = "Rates"
        nrows = 2
        ncols = 2

        def cell_value(self, row, column):
            return [["Code", "Rate"], ["T1001", 125.0]][row][column]

    class FakeWorkbook:
        def sheets(self):
            return [FakeSheet()]

        def release_resources(self):
            return None

    monkeypatch.setattr(
        "pipeline.parse.converter.xlrd.open_workbook",
        lambda *_args, **_kwargs: FakeWorkbook(),
    )

    parsed = parse_xls(source_path)

    assert parsed["source_format"] == "xls"
    assert parsed["parse_backend"] == "xlrd"
    assert parsed["answer_ready"] is True
    assert "T1001" in parsed["payload"]["synthetic_sections"][0]["content_text"]


def test_parse_pptx_extracts_slide_text_and_tables(tmp_path):
    source_path = tmp_path / "managed-care.pptx"
    presentation = Presentation()
    slide = presentation.slides.add_slide(presentation.slide_layouts[5])
    slide.shapes.title.text = "Provider Requirements"
    text_box = slide.shapes.add_textbox(0, 0, 100, 100)
    text_box.text = "Plans must publish current guidance."
    table = slide.shapes.add_table(2, 2, 0, 0, 100, 100).table
    table.cell(0, 0).text = "Plan"
    table.cell(0, 1).text = "Requirement"
    table.cell(1, 0).text = "PHP"
    table.cell(1, 1).text = "Notice"
    presentation.save(source_path)

    parsed = parse_pptx(source_path)

    assert parsed["source_format"] == "pptx"
    assert parsed["parse_backend"] == "python-pptx"
    assert parsed["table_count"] == 1
    content = parsed["payload"]["synthetic_sections"][0]["content_text"]
    assert "publish current guidance" in content
    assert "PHP | Notice" in content


def test_parse_doc_uses_headless_libreoffice_conversion(monkeypatch, tmp_path):
    source_path = tmp_path / "legacy-manual.doc"
    source_path.write_bytes(b"legacy doc")

    def fake_run(args, **_kwargs):
        output_dir = Path(args[args.index("--outdir") + 1])
        document = WordDocument()
        document.add_heading("Overview", level=1)
        document.add_paragraph("Converted legacy content.")
        document.save(output_dir / "legacy-manual.docx")

        class Completed:
            returncode = 0
            stdout = ""
            stderr = ""

        return Completed()

    monkeypatch.setattr(
        "pipeline.parse.converter.subprocess.run",
        fake_run,
    )

    parsed = parse_doc(source_path)

    assert parsed["source_format"] == "doc"
    assert parsed["parse_backend"] == "libreoffice+python-docx"
    assert "Converted legacy content" in parsed["markdown"]


class _FakeDocItem:
    def __init__(self, label, text=""):
        self.label = label
        self.text = text


class _FakeDoc:
    def __init__(self):
        self.pages = [object()]

    def export_to_dict(self):
        return {
            "tables": [
                {
                    "data": {
                        "table_cells": [
                            {"start_row_offset_idx": 0, "start_col_offset_idx": 0, "end_col_offset_idx": 1, "text": "PHP Name"},
                            {"start_row_offset_idx": 0, "start_col_offset_idx": 1, "end_col_offset_idx": 2, "text": "Contract Name"},
                            {"start_row_offset_idx": 1, "start_col_offset_idx": 0, "end_col_offset_idx": 1, "text": "Healthy Blue"},
                            {
                                "start_row_offset_idx": 1,
                                "start_col_offset_idx": 1,
                                "end_col_offset_idx": 2,
                                "text": "Provider Payment Appendix",
                            },
                        ]
                    }
                }
            ]
        }

    def export_to_markdown(self):
        return "| PHP Name | Contract Name |\n| Healthy Blue | Provider Payment Appendix |"

    def iterate_items(self):
        yield _FakeDocItem(DocItemLabel.TABLE), 0


class _FakeConversionResult:
    def __init__(self):
        self.document = _FakeDoc()


class _FakeConverter:
    def convert(self, _path: str):
        return _FakeConversionResult()


def test_parse_pdf_promotes_table_only_content_into_synthetic_sections(tmp_path):
    source_path = tmp_path / "managed-care-contracts.pdf"
    source_path.write_bytes(b"%PDF-1.4 fake")

    parsed = parse_pdf(source_path, _FakeConverter())

    assert parsed["source_format"] == "pdf"
    assert parsed["table_count"] == 1
    assert parsed["section_count"] == 1
    assert parsed["answer_ready"] is True
    assert parsed["quality_flags"] == []
    assert parsed["content_char_count"] > 0
    assert "Healthy Blue" in parsed["markdown"]


def test_should_parse_reprocesses_when_cache_version_changes(tmp_path):
    source_path = tmp_path / "managed-care-contracts.pdf"
    source_path.write_bytes(b"%PDF-1.4 fake")
    meta_path = tmp_path / "managed-care-contracts.meta.json"
    meta_path.write_text(
        json.dumps(
            {
                "source_file_hash": "sha256:not-the-current-hash",
                "parse_cache_version": PARSE_CACHE_VERSION - 1,
            }
        )
    )

    assert should_parse(source_path, meta_path) is True


def test_parse_all_records_timeout_failures(monkeypatch, tmp_path):
    source_path = tmp_path / "contract.pdf"
    source_path.write_bytes(b"%PDF-1.4 fake")
    meta_path = tmp_path / "contract.meta.json"

    monkeypatch.setattr(
        "pipeline.parse.converter.discover_source_files",
        lambda _source_type=None: [source_path],
    )
    monkeypatch.setattr(
        "pipeline.parse.converter.source_type_for_file",
        lambda _source_path: "managed_care_contract",
    )
    monkeypatch.setattr(
        "pipeline.parse.converter.parsed_output_paths",
        lambda _source_path, _source_type: (
            tmp_path / "contract.json",
            tmp_path / "contract.md",
            meta_path,
        ),
    )
    monkeypatch.setattr(
        "pipeline.parse.converter.parse_and_save_supported_file_with_timeout",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            TimeoutError("parse timed out after 1 seconds")
        ),
    )

    stats = parse_all(source_type="managed_care_contract")
    meta = json.loads(meta_path.read_text())

    assert stats == {
        "parsed": 0,
        "skipped": 0,
        "errors": 1,
        "timed_out": 1,
        "quarantined": 0,
    }
    assert meta["parse_status"] == "parse_exception"
    assert meta["answer_ready"] is False
    assert "timed out after 1 seconds" in meta["error_message"]


def test_parse_all_quarantines_unsupported_formats(monkeypatch, tmp_path):
    source_path = tmp_path / "legacy-slides.ppt"
    source_path.write_bytes(b"legacy presentation")
    meta_path = tmp_path / "legacy-slides__ppt.meta.json"

    monkeypatch.setattr(
        "pipeline.parse.converter.discover_source_files",
        lambda _source_type=None: [],
    )
    monkeypatch.setattr(
        "pipeline.parse.converter.discover_unsupported_files",
        lambda _source_type=None: [source_path],
    )
    monkeypatch.setattr(
        "pipeline.parse.converter.source_type_for_file",
        lambda _source_path: "managed_care_guidance",
    )
    monkeypatch.setattr(
        "pipeline.parse.converter.parsed_output_paths",
        lambda _source_path, _source_type: (
            tmp_path / "legacy-slides__ppt.json",
            tmp_path / "legacy-slides__ppt.md",
            meta_path,
        ),
    )

    stats = parse_all(source_type="managed_care_guidance")
    meta = json.loads(meta_path.read_text())

    assert stats["quarantined"] == 1
    assert stats["errors"] == 0
    assert meta["parse_status"] == "unsupported_format"
    assert meta["answer_ready"] is False
    assert "artifact quarantined" in meta["error_message"]
