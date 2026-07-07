"""Test graph loading from parsed Docling JSON."""

import json
import sqlite3
from pathlib import Path

import pytest

from pipeline.graph.loader import (
    _build_document_bundle,
    build_sections_from_items,
    build_sections_from_synthetic_items,
    _extract_dhhs_policy_number,
    load_document,
    read_crawler_metadata_by_local_path,
)
from pipeline.source_selection import build_source_selection_index
from docling_core.types.doc import DocItemLabel
from pipeline.parse.post_process import build_document_id
from tests.fakes import RecordingGraphWriter


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

    def test_duplicate_section_numbers_get_distinct_ids(self, monkeypatch):
        class FakeItem:
            def __init__(self, label, text):
                self.label = label
                self.text = text

        class FakeDoc:
            def iterate_items(self):
                yield FakeItem(DocItemLabel.SECTION_HEADER, "Attachment B"), 1
                yield FakeItem(DocItemLabel.PARAGRAPH, "First body"), 1
                yield FakeItem(DocItemLabel.SECTION_HEADER, "Attachment B"), 1
                yield FakeItem(DocItemLabel.PARAGRAPH, "Second body"), 1

        monkeypatch.setattr(
            "pipeline.graph.loader.DoclingDocument.model_validate",
            lambda doc_dict: FakeDoc(),
        )

        sections = build_sections_from_items({}, "doc:test:fixture")

        assert [section["id"] for section in sections] == [
            "sec:doc:test:fixture:Attachment B",
            "sec:doc:test:fixture:Attachment B:dup1",
        ]

    def test_text_labeled_items_contribute_to_section_content(self, monkeypatch):
        """Docling often tags body paragraphs as TEXT (not PARAGRAPH). Historical
        code only read PARAGRAPH/LIST_ITEM, silently dropping most change-notice
        bodies and ~26M chars across the corpus. This test pins the fix."""

        class FakeItem:
            def __init__(self, label, text):
                self.label = label
                self.text = text

        class FakeDoc:
            def iterate_items(self):
                yield FakeItem(DocItemLabel.SECTION_HEADER, "I. BACKGROUND"), 1
                yield FakeItem(DocItemLabel.TEXT, "DHB has updated MA-2910 charts."), 1
                yield FakeItem(DocItemLabel.FOOTNOTE, "See attachment A."), 1
                yield FakeItem(DocItemLabel.CAPTION, "Table 1: Transport rates."), 1

        monkeypatch.setattr(
            "pipeline.graph.loader.DoclingDocument.model_validate",
            lambda doc_dict: FakeDoc(),
        )

        sections = build_sections_from_items({}, "doc:test:fixture")

        assert len(sections) == 1
        body = sections[0]["content_text"]
        assert "MA-2910" in body
        assert "attachment A" in body
        assert "Transport rates" in body

    def test_table_only_document_creates_implicit_section(self, monkeypatch):
        class FakeDataFrame:
            def to_markdown(self, index=False):
                assert index is False
                return "| PHP Name | Contract Name |\n| Healthy Blue | Provider Payment Appendix |"

        class FakeTableItem:
            def __init__(self):
                self.label = DocItemLabel.TABLE
                self.text = ""

            def export_to_dataframe(self, doc):
                return FakeDataFrame()

        class FakeDoc:
            def iterate_items(self):
                yield FakeTableItem(), 0

        monkeypatch.setattr(
            "pipeline.graph.loader.DoclingDocument.model_validate",
            lambda doc_dict: FakeDoc(),
        )

        sections = build_sections_from_items({}, "doc:test:fixture")

        assert len(sections) == 1
        assert sections[0]["has_tables"] is True
        assert "Healthy Blue" in sections[0]["content_text"]


def test_build_sections_from_synthetic_items_preserves_duplicate_attachment_ids():
    sections = build_sections_from_synthetic_items(
        {
            "synthetic_sections": [
                {
                    "section_number": "Attachment B",
                    "title": "Attachment B",
                    "level": 1,
                    "content_text": "First body",
                    "has_tables": False,
                    "has_definitions": False,
                },
                {
                    "section_number": "Attachment B",
                    "title": "Attachment B",
                    "level": 1,
                    "content_text": "Second body",
                    "has_tables": False,
                    "has_definitions": False,
                },
            ]
        },
        "doc:test:fixture",
    )

    assert [section["id"] for section in sections] == [
        "sec:doc:test:fixture:Attachment B",
        "sec:doc:test:fixture:Attachment B:dup1",
    ]


class TestExtractDhhsPolicyNumber:
    def test_ma_prefix(self):
        assert _extract_dhhs_policy_number("MA-2270 LONG TERM CARE NEED AND BUDGETING") == "MA-2270"

    def test_dma_prefix(self):
        assert _extract_dhhs_policy_number("DMA-5097 Some Policy Title") == "DMA-5097"

    def test_dhb_prefix(self):
        assert _extract_dhhs_policy_number("DHB-5097 Another Policy") == "DHB-5097"

    def test_dss_prefix(self):
        assert _extract_dhhs_policy_number("DSS-8110 Guidance Document") == "DSS-8110"

    def test_change_notice_with_ma(self):
        assert _extract_dhhs_policy_number(
            "CHANGE NOTICE FOR MANUAL NO. 01-24, MA-3200, Application"
        ) == "MA-3200"

    def test_change_notice_with_ma_different_format(self):
        assert _extract_dhhs_policy_number(
            "CHANGE NOTICE FOR MANUAL NO. 04-24, MA-2420, Notice And Hearings Process"
        ) == "MA-2420"

    def test_no_policy_number(self):
        assert _extract_dhhs_policy_number("2025 Basic Medicaid Eligibility Requirements") is None

    def test_plain_title(self):
        assert _extract_dhhs_policy_number("ADULT MEDICAID TABLE OF CONTENTS") is None


class TestBuildDocumentId:
    def test_dhhs_policy_uses_source_url_as_unique_discriminator(self):
        doc_id = build_document_id(
            "dhhs_policy",
            "MA-3200",
            "ma-3200-application",
            "https://example.com/MA-3200.pdf",
        )

        assert doc_id.startswith("doc:dhhs_policy:MA-3200:url-")

    def test_dhhs_policy_same_policy_number_but_different_urls_get_distinct_ids(self):
        first = build_document_id(
            "dhhs_policy",
            "MA-3200",
            "ma-3200-application",
            "https://example.com/MA-3200.pdf",
        )
        second = build_document_id(
            "dhhs_policy",
            "MA-3200",
            "change-notice-for-manual-no-01-24-ma-3200-application",
            "https://example.com/CN-01-24.pdf",
        )

        assert first != second

    def test_other_source_types_still_key_on_policy_number(self):
        assert build_document_id(
            "clinical_policy",
            "1A",
            "home-health-services",
            "https://example.com/1A.pdf",
        ) == "doc:clinical_policy:1A"


def test_load_document_emits_document_bundle_through_graph_writer(monkeypatch, tmp_path):
    json_path = tmp_path / "sample.json"
    json_path.write_text("{}")
    meta_path = tmp_path / "sample.meta.json"
    meta_path.write_text(json.dumps({"source_pdf": "sample.pdf", "page_count": 12}))

    monkeypatch.setattr(
        "pipeline.graph.loader.read_crawler_metadata",
        lambda source_type, filename_stem: {
            "title": "Policy 8C",
            "policy_number": "8C",
            "category": "eligibility",
            "source_url": "https://example.com/8C",
        },
    )
    monkeypatch.setattr(
        "pipeline.graph.loader.build_sections_from_items",
        lambda doc_dict, document_id: [
            {
                "id": f"{document_id}:sec:1",
                "document_id": document_id,
                "section_number": "1",
                "title": "Introduction",
                "level": 1,
                "content_text": "Intro text",
                "content_length": 10,
                "has_tables": False,
                "has_definitions": False,
                "parent_id": None,
                "prev_sibling_id": None,
            }
        ],
    )
    monkeypatch.setattr(
        "pipeline.graph.loader.build_document_id",
        lambda source_type, policy_number, filename_stem, source_url: "doc:test:8c",
    )
    monkeypatch.setattr(
        "pipeline.graph.loader._extract_effective_date",
        lambda source_type, title, sections: "2025-01-01",
    )

    writer = RecordingGraphWriter()
    monkeypatch.setattr("pipeline.graph.loader.graph_writer", writer)

    result = load_document(json_path, "dhhs_policy")

    (bundle,) = writer.received("upsert_document_bundle")
    assert result == {"document_id": "doc:test:8c", "sections": 1}
    assert bundle.document.id == "doc:test:8c"
    assert bundle.document.title == "Policy 8C"
    assert bundle.document.policy_number == "8C"
    assert bundle.document.effective_date == "2025-01-01"
    assert bundle.sections[0].id == "doc:test:8c:sec:1"
    assert bundle.sections[0].title == "Introduction"


def test_load_document_does_not_infer_policy_number_for_change_notice(monkeypatch, tmp_path):
    json_path = tmp_path / "change-notice.json"
    json_path.write_text("{}")
    meta_path = tmp_path / "change-notice.meta.json"
    meta_path.write_text(json.dumps({"source_pdf": "change-notice.pdf", "page_count": 2}))

    monkeypatch.setattr(
        "pipeline.graph.loader.read_crawler_metadata",
        lambda source_type, filename_stem: {
            "title": "CHANGE NOTICE FOR MANUAL NO. 01-24, MA-3200, Application",
            "policy_number": None,
            "category": "eligibility",
            "source_url": "https://example.com/CN-01-24.pdf",
        },
    )
    monkeypatch.setattr(
        "pipeline.graph.loader.build_sections_from_items",
        lambda doc_dict, document_id: [],
    )
    monkeypatch.setattr(
        "pipeline.graph.loader._extract_effective_date",
        lambda source_type, title, sections: None,
    )

    captured: dict[str, object] = {}

    def fake_build_document_id(source_type, policy_number, filename_stem, source_url):
        captured["policy_number"] = policy_number
        return "doc:test:change-notice"

    writer = RecordingGraphWriter()
    monkeypatch.setattr("pipeline.graph.loader.build_document_id", fake_build_document_id)
    monkeypatch.setattr("pipeline.graph.loader.graph_writer", writer)

    result = load_document(json_path, "dhhs_policy")

    (bundle,) = writer.received("upsert_document_bundle")
    assert result == {"document_id": "doc:test:change-notice", "sections": 0}
    assert captured["policy_number"] is None
    assert bundle.document.policy_number is None


def test_read_crawler_metadata_by_local_path_normalizes_absolute_paths(monkeypatch, tmp_path):
    db_path = tmp_path / "crawler.db"
    documents_root = tmp_path / "documents"
    documents_root.mkdir()

    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            CREATE TABLE documents (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              source_url TEXT NOT NULL UNIQUE,
              discovered_from TEXT NOT NULL,
              source_type TEXT NOT NULL,
              title TEXT,
              policy_number TEXT,
              category TEXT,
              local_path TEXT,
              file_hash TEXT,
              file_size INTEGER,
              mime_type TEXT,
              detected_content_type TEXT,
              content_disposition_filename TEXT,
              etag TEXT,
              last_modified TEXT,
              first_seen_at TEXT,
              last_checked_at TEXT,
              last_downloaded_at TEXT,
              last_changed_at TEXT,
              status TEXT NOT NULL DEFAULT 'discovered',
              error_message TEXT,
              download_attempts INTEGER DEFAULT 0,
              consecutive_errors INTEGER DEFAULT 0
            )
            """
        )
        conn.execute(
            """
            INSERT INTO documents (
              source_url, discovered_from, source_type, title, local_path, status
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                "https://example.test/rates.xlsx",
                "https://example.test/listing",
                "fee_schedule",
                "Rate Sheet XLSX",
                "fee-schedules/rate-sheet.xlsx",
                "downloaded",
            ),
        )
        conn.execute(
            """
            INSERT INTO documents (
              source_url, discovered_from, source_type, title, local_path, status
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                "https://example.test/rates.pdf",
                "https://example.test/listing",
                "fee_schedule",
                "Rate Sheet PDF",
                "fee-schedules/rate-sheet.pdf",
                "downloaded",
            ),
        )
        conn.commit()
    finally:
        conn.close()

    monkeypatch.setattr("pipeline.graph.loader.CRAWLER_DB_PATH", db_path)
    monkeypatch.setattr("pipeline.graph.loader.CRAWLER_DATA_DIR", documents_root)

    metadata = read_crawler_metadata_by_local_path(
        "fee_schedule",
        str(documents_root / "fee-schedules" / "rate-sheet.pdf"),
    )

    assert metadata["source_url"] == "https://example.test/rates.pdf"
    assert metadata["title"] == "Rate Sheet PDF"
    assert metadata["local_path"] == "fee-schedules/rate-sheet.pdf"


def test_build_document_bundle_applies_fee_schedule_selection(monkeypatch, tmp_path):
    source_file = tmp_path / "fee-schedules" / "ambulance-2022.xlsx"
    source_file.parent.mkdir(parents=True)
    source_file.write_text("xlsx")
    parsed_json = tmp_path / "ambulance-2022.json"
    parsed_json.write_text("{}")

    selection_index = build_source_selection_index([
        {
            "source_type": "fee_schedule",
            "title": "Ambulance Fee Schedule - Jan. 1, 2022 - EXCEL",
            "source_url": "https://example.test/ambulance-2022.xlsx",
            "local_path": "fee-schedules/ambulance-2022.xlsx",
            "source_format": ".xlsx",
            "status": "downloaded",
        },
        {
            "source_type": "fee_schedule",
            "title": "Ambulance Fee Schedule - Jan. 1, 2022 - PDF",
            "source_url": "https://example.test/ambulance-2022.pdf",
            "local_path": "fee-schedules/ambulance-2022.pdf",
            "source_format": ".pdf",
            "status": "downloaded",
        },
    ])
    monkeypatch.setattr("pipeline.graph.loader._source_selection_index", lambda: selection_index)

    bundle = _build_document_bundle(
        json_path=parsed_json,
        source_type="fee_schedule",
        title="Ambulance Fee Schedule - Jan. 1, 2022 - EXCEL",
        policy_number=None,
        waiver_id=None,
        crawler_meta={
            "source_url": "https://example.test/ambulance-2022.xlsx",
            "local_path": "fee-schedules/ambulance-2022.xlsx",
            "status": "downloaded",
        },
        meta={
            "source_file": str(source_file),
            "source_format": "xlsx",
            "answer_ready": True,
            "page_count": 1,
        },
        sections=[],
        effective_date=None,
        document_id="doc:fee:ambulance-2022",
    )

    assert bundle.document.corpus_bucket == "primary"
    assert bundle.document.variant_group == "ambulance fee schedule"
    assert bundle.document.variant_date == "2022-01-01"
    assert bundle.document.retrieval_ready is True
