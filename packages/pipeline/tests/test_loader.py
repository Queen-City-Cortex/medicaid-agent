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
    _extract_effective_date,
    load_all,
    load_document,
    read_crawler_metadata_by_local_path,
)
from pipeline.source_selection import build_source_selection_index
from docling_core.types.doc import DocItemLabel
from pipeline.identity import build_document_id, canonicalize_source_url
from tests.fakes import RecordingGraphWriter


FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.mark.parametrize("source_type", ["dhhs_policy", "waiver"])
def test_null_registry_title_uses_source_filename_without_changing_identity(monkeypatch, tmp_path, source_type):
    path = tmp_path / "original-policy.json"
    path.write_text(json.dumps({"synthetic_sections": [{"title": "Procedure", "content_text": "Retained procedure text."}]}))
    writer = RecordingGraphWriter()
    monkeypatch.setattr("pipeline.graph.loader.graph_writer", writer)
    context = {"meta": {}, "source_file_path": Path("original-policy.pdf"),
               "crawler_meta": {"title": None, "source_url": "https://example.org/original-policy.pdf", "status": "downloaded"},
               "document_id": "doc:original-source", "exclusion_reason": None}
    result = load_document(path, source_type, load_context=context)
    bundle, = writer.received("upsert_document_bundle")
    assert result["document_id"] == "doc:original-source"
    assert bundle.document.title == "original-policy"
    assert bundle.document.source_url == context["crawler_meta"]["source_url"]


def test_beneficiary_guidance_does_not_invent_document_effective_date():
    sections = [
        {
            "title": "Upcoming changes",
            "content_text": (
                "One provision begins October 1, 2026. "
                "A different requirement begins January 1, 2027."
            ),
        }
    ]

    assert (
        _extract_effective_date(
            "beneficiary_guidance",
            "Medicaid is Changing",
            sections,
        )
        is None
    )


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
            def iterate_items(self, **_kwargs):
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
            def iterate_items(self, **_kwargs):
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
            def iterate_items(self, **_kwargs):
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
    def test_canonical_url_matches_the_cross_runtime_contract(self):
        assert canonicalize_source_url(
            "https://EXAMPLE.com:443/policy.pdf?note=one two&b=!'()*~#page=3"
        ) == (
            "https://example.com/policy.pdf?"
            "b=%21%27%28%29%2A~&note=one%20two"
        )

    def test_source_url_is_the_only_document_identity_input(self):
        doc_id = build_document_id(
            "dhhs_policy",
            "https://EXAMPLE.com/policies/MA-3200.pdf#page=2",
        )

        assert doc_id == build_document_id(
            "dhhs_policy",
            "https://example.com/policies/MA-3200.pdf",
        )
        assert doc_id.startswith("doc:dhhs_policy:")

    def test_every_source_family_distinguishes_different_urls(self):
        first = build_document_id(
            "state_plan_amendment",
            "https://example.com/MA-3200.pdf",
        )
        second = build_document_id(
            "state_plan_amendment",
            "https://example.com/CN-01-24.pdf",
        )

        assert first != second

    def test_normalized_registry_path_is_used_only_without_a_url(self):
        from_path = build_document_id(
            "clinical_policy",
            None,
            "clinical-policies/../clinical-policies/home-health.pdf",
        )
        assert from_path == build_document_id(
            "clinical_policy",
            None,
            "clinical-policies/home-health.pdf",
        )

    def test_registry_path_cannot_escape_the_crawler_root(self):
        with pytest.raises(ValueError, match="must stay within"):
            build_document_id(
                "clinical_policy",
                None,
                "../outside/home-health.pdf",
            )

    def test_document_identity_requires_a_url_or_registry_path(self):
        with pytest.raises(ValueError, match="source URL or registry path"):
            build_document_id("clinical_policy", None, None)


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
            "status": "downloaded",
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
        lambda source_type, source_url, registry_path: "doc:test:8c",
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
            "status": "downloaded",
        },
    )
    monkeypatch.setattr(
        "pipeline.graph.loader.build_sections_from_items",
        lambda doc_dict, document_id: [
            {
                "id": f"sec:{document_id}:1.0",
                "document_id": document_id,
                "section_number": "1.0",
                "title": "Change",
                "level": 1,
                "content_text": "Changed text",
                "content_length": 12,
                "has_tables": False,
                "has_definitions": False,
                "parent_id": None,
                "prev_sibling_id": None,
            }
        ],
    )
    monkeypatch.setattr(
        "pipeline.graph.loader._extract_effective_date",
        lambda source_type, title, sections: None,
    )

    captured: dict[str, object] = {}

    def fake_build_document_id(source_type, source_url, registry_path):
        captured["source_url"] = source_url
        return "doc:test:change-notice"

    writer = RecordingGraphWriter()
    monkeypatch.setattr("pipeline.graph.loader.build_document_id", fake_build_document_id)
    monkeypatch.setattr("pipeline.graph.loader.graph_writer", writer)

    result = load_document(json_path, "dhhs_policy")

    (bundle,) = writer.received("upsert_document_bundle")
    assert result == {"document_id": "doc:test:change-notice", "sections": 1}
    assert captured["source_url"] == "https://example.com/CN-01-24.pdf"
    assert bundle.document.policy_number is None


def test_load_document_removes_a_registry_document_marked_removed(
    monkeypatch,
    tmp_path,
):
    json_path = tmp_path / "removed.json"
    json_path.write_text("{}")
    json_path.with_suffix(".meta.json").write_text(
        json.dumps(
            {
                "source_file": "removed.pdf",
                "parse_status": "parsed",
                "answer_ready": True,
                "section_count": 1,
            }
        )
    )
    monkeypatch.setattr(
        "pipeline.graph.loader.read_crawler_metadata",
        lambda source_type, filename_stem: {
            "title": "Removed policy",
            "source_url": "https://example.com/removed.pdf",
            "local_path": "state-plan-amendments/removed.pdf",
            "status": "removed",
        },
    )
    writer = RecordingGraphWriter()
    monkeypatch.setattr("pipeline.graph.loader.graph_writer", writer)

    result = load_document(json_path, "state_plan_amendment")

    assert result["skipped"] == "inactive_registry_status:removed"
    assert writer.received("upsert_document_bundle") == []
    assert writer.received("delete_document") == [result["document_id"]]


def _listing_registry(tmp_path, source_url, *, listed_run, checked_run, tags="[]"):
    db_path = tmp_path / "crawler.db"
    index_url = "https://policies.ncdhhs.gov/index/"
    with sqlite3.connect(db_path) as db:
        db.executescript(
            """
            CREATE TABLE documents (id INTEGER PRIMARY KEY, source_url TEXT UNIQUE,
              discovered_from TEXT, source_type TEXT, title TEXT, local_path TEXT,
              status TEXT);
            CREATE TABLE source_listings (source_url TEXT PRIMARY KEY, index_url TEXT,
              last_listed_at TEXT, last_listed_run_id INTEGER, tags TEXT);
            CREATE TABLE source_index_checks (index_url TEXT PRIMARY KEY, source_type TEXT,
              last_complete_at TEXT, last_complete_run_id INTEGER);
            """
        )
        db.execute(
            "INSERT INTO documents"
            " (source_url, discovered_from, source_type, title, local_path, status)"
            " VALUES (?, ?, 'dhhs_policy', ?, ?, 'unchanged')",
            (
                source_url,
                index_url,
                source_url.rsplit("/", 1)[-1],
                "dhhs-policies/" + source_url.rsplit("/", 1)[-1],
            ),
        )
        db.execute(
            "INSERT INTO source_listings VALUES (?, ?, 'then', ?, ?)",
            (source_url, index_url, listed_run, tags),
        )
        if checked_run is not None:
            db.execute(
                "INSERT INTO source_index_checks VALUES (?, 'dhhs_policy', 'now', ?)",
                (index_url, checked_run),
            )
    return db_path


@pytest.mark.parametrize(
    ("checked_run", "skipped"),
    [(2, "delisted_from_index"), (1, None), (None, None)],
)
def test_load_document_excludes_a_dhhs_policy_dropped_from_its_index(
    monkeypatch,
    tmp_path,
    checked_run,
    skipped,
):
    """Only a complete listing newer than the row's own proves it was dropped."""
    source_url = "https://policies.ncdhhs.gov/wp-content/uploads/MA-2240-2.pdf"
    json_path = tmp_path / "ma-2240-2.json"
    json_path.write_text("{}")
    json_path.with_suffix(".meta.json").write_text(
        json.dumps(
            {
                "source_file": "dhhs-policies/MA-2240-2.pdf",
                "parse_status": "parsed",
                "answer_ready": True,
                "section_count": 1,
            }
        )
    )
    db_path = _listing_registry(
        tmp_path, source_url, listed_run=1, checked_run=checked_run
    )
    monkeypatch.setattr("pipeline.graph.loader.CRAWLER_DB_PATH", db_path)
    monkeypatch.setattr(
        "pipeline.graph.loader.build_sections_from_items",
        lambda doc_dict, document_id: [
            {"id": f"{document_id}:sec:1", "title": "Penalty period", "content_text": "x"}
        ],
    )
    writer = RecordingGraphWriter()
    monkeypatch.setattr("pipeline.graph.loader.graph_writer", writer)

    result = load_document(json_path, "dhhs_policy")

    assert result.get("skipped") == skipped
    if skipped:
        assert writer.received("upsert_document_bundle") == []
        assert writer.received("delete_document") == [result["document_id"]]
    else:
        assert len(writer.received("upsert_document_bundle")) == 1
    with sqlite3.connect(db_path) as db:
        assert db.execute("SELECT status FROM documents").fetchone() == ("unchanged",)


@pytest.mark.parametrize(
    ("tags", "archived", "status"),
    [('["archived", "manual"]', True, "archived"), ('["manual"]', False, "current")],
)
def test_load_document_marks_a_document_the_agency_tagged_archived(
    monkeypatch,
    tmp_path,
    tags,
    archived,
    status,
):
    """An archived table still loads and stays answer-ready; retrieval skips it."""
    source_url = "https://policies.ncdhhs.gov/wp-content/uploads/2025-NON-MAGI.pdf"
    json_path = tmp_path / "2025-non-magi.json"
    json_path.write_text("{}")
    json_path.with_suffix(".meta.json").write_text(
        json.dumps(
            {
                "source_file": "dhhs-policies/2025-NON-MAGI.pdf",
                "parse_status": "parsed",
                "answer_ready": True,
                "section_count": 1,
            }
        )
    )
    db_path = _listing_registry(
        tmp_path, source_url, listed_run=2, checked_run=2, tags=tags
    )
    monkeypatch.setattr("pipeline.graph.loader.CRAWLER_DB_PATH", db_path)
    monkeypatch.setattr(
        "pipeline.graph.loader.build_sections_from_items",
        lambda doc_dict, document_id: [
            {"id": f"{document_id}:sec:1", "title": "Income limits", "content_text": "x"}
        ],
    )
    writer = RecordingGraphWriter()
    monkeypatch.setattr("pipeline.graph.loader.graph_writer", writer)

    load_document(json_path, "dhhs_policy")

    (bundle,) = writer.received("upsert_document_bundle")
    assert bundle.document.archived is archived
    assert bundle.document.status == status
    assert bundle.document.answer_ready is True
    assert bundle.document.retrieval_ready is True


@pytest.mark.parametrize(
    ("meta_overrides", "reason"),
    [
        ({"parse_status": "parse_exception"}, "parse_status:parse_exception"),
        ({"answer_ready": False}, "not_answer_ready"),
        ({"quality_flags": ["title_only_or_blank_body"]}, "not_answer_ready"),
        ({"section_count": 0}, "zero_section_parse"),
    ],
)
def test_load_document_rejects_parses_that_are_not_answer_ready(
    monkeypatch,
    tmp_path,
    meta_overrides,
    reason,
):
    json_path = tmp_path / "quarantined.json"
    json_path.write_text("{}")
    json_path.with_suffix(".meta.json").write_text(
        json.dumps(
            {
                "source_file": "quarantined.pdf",
                "parse_status": "parsed",
                "answer_ready": True,
                "section_count": 1,
                **meta_overrides,
            }
        )
    )
    monkeypatch.setattr(
        "pipeline.graph.loader.read_crawler_metadata",
        lambda source_type, filename_stem: {
            "title": "Quarantined policy",
            "source_url": "https://example.com/quarantined.pdf",
            "local_path": "state-plan-amendments/quarantined.pdf",
            "status": "unchanged",
        },
    )
    writer = RecordingGraphWriter()
    monkeypatch.setattr("pipeline.graph.loader.graph_writer", writer)

    result = load_document(json_path, "state_plan_amendment")

    assert result["skipped"] == reason
    assert writer.received("upsert_document_bundle") == []
    assert writer.received("delete_document") == [result["document_id"]]


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


def test_load_all_counts_duplicate_parsed_artifacts_as_one_document(
    monkeypatch,
    tmp_path,
):
    parsed_dir = tmp_path / "state-plan-amendments"
    parsed_dir.mkdir()
    for name in ("attachment.json", "attachment-copy.json"):
        (parsed_dir / name).write_text("{}")

    monkeypatch.setattr("pipeline.graph.loader.PARSED_DATA_DIR", tmp_path)
    monkeypatch.setattr(
        "pipeline.graph.loader.SOURCE_TYPE_DIRS",
        {"state_plan_amendment": "state-plan-amendments"},
    )
    monkeypatch.setattr("pipeline.graph.schema.ensure_schema", lambda: None)
    monkeypatch.setattr(
        "pipeline.graph.loader._resolve_document_load_context",
        lambda json_path, source_type: {
            "document_id": "doc:state_plan_amendment:same",
            "exclusion_reason": None,
        },
    )
    monkeypatch.setattr(
        "pipeline.graph.loader.load_document",
        lambda json_path, source_type, load_context: {
            "document_id": "doc:state_plan_amendment:same",
            "sections": 2,
        },
    )

    assert load_all(source_type="state_plan_amendment") == {
        "loaded": 1,
        "sections_total": 2,
        "skipped": 1,
        "errors": 0,
    }


def test_load_all_deduplicates_before_an_ineligible_artifact_can_delete(
    monkeypatch,
    tmp_path,
):
    parsed_dir = tmp_path / "state-plan-amendments"
    parsed_dir.mkdir()
    valid_path = parsed_dir / "a-valid.json"
    quarantined_path = parsed_dir / "z-quarantined.json"
    valid_path.write_text("{}")
    quarantined_path.write_text("{}")
    valid_path.with_suffix(".meta.json").write_text(
        json.dumps(
            {
                "source_file": "valid.pdf",
                "parse_status": "parsed",
                "answer_ready": True,
                "section_count": 1,
            }
        )
    )
    quarantined_path.with_suffix(".meta.json").write_text(
        json.dumps(
            {
                "source_file": "quarantined.pdf",
                "parse_status": "parsed",
                "answer_ready": False,
                "section_count": 1,
            }
        )
    )

    monkeypatch.setattr("pipeline.graph.loader.PARSED_DATA_DIR", tmp_path)
    monkeypatch.setattr(
        "pipeline.graph.loader.SOURCE_TYPE_DIRS",
        {"state_plan_amendment": "state-plan-amendments"},
    )
    monkeypatch.setattr("pipeline.graph.schema.ensure_schema", lambda: None)
    monkeypatch.setattr(
        "pipeline.graph.loader.read_crawler_metadata_by_local_path",
        lambda source_type, local_path: {
            "title": "One registry document",
            "source_url": "https://example.com/attachment.pdf",
            "local_path": "state-plan-amendments/attachment.pdf",
            "status": "unchanged",
        },
    )
    monkeypatch.setattr(
        "pipeline.graph.loader.build_sections_from_items",
        lambda doc_dict, document_id: [
            {
                "id": f"sec:{document_id}:1",
                "document_id": document_id,
                "section_number": "1",
                "title": "Section 1",
                "level": 1,
                "content_text": "Answer-ready content",
                "content_length": 20,
                "has_tables": False,
                "has_definitions": False,
                "parent_id": None,
                "prev_sibling_id": None,
            }
        ],
    )
    writer = RecordingGraphWriter()
    monkeypatch.setattr("pipeline.graph.loader.graph_writer", writer)

    assert load_all(source_type="state_plan_amendment") == {
        "loaded": 1,
        "sections_total": 1,
        "skipped": 1,
        "errors": 0,
    }
    assert len(writer.received("upsert_document_bundle")) == 1
    assert writer.received("delete_document") == []


def test_load_all_prefers_the_parse_matching_the_current_registry_hash(
    monkeypatch,
    tmp_path,
):
    parsed_dir = tmp_path / "state-plan-amendments"
    parsed_dir.mkdir()
    old_path = parsed_dir / "a-old.json"
    current_path = parsed_dir / "z-current.json"
    old_path.write_text(json.dumps({"content": "Stale content"}))
    current_path.write_text(json.dumps({"content": "Current content"}))
    old_path.with_suffix(".meta.json").write_text(
        json.dumps(
            {
                "source_file": "old.pdf",
                "source_file_hash": "sha256:old-hash",
                "parsed_at": "2026-01-01T00:00:00+00:00",
                "parse_status": "parsed",
                "answer_ready": True,
                "section_count": 1,
            }
        )
    )
    current_path.with_suffix(".meta.json").write_text(
        json.dumps(
            {
                "source_file": "current.pdf",
                "source_file_hash": "sha256:current-hash",
                "parsed_at": "2026-07-01T00:00:00+00:00",
                "parse_status": "parsed",
                "answer_ready": True,
                "section_count": 1,
            }
        )
    )

    monkeypatch.setattr("pipeline.graph.loader.PARSED_DATA_DIR", tmp_path)
    monkeypatch.setattr(
        "pipeline.graph.loader.SOURCE_TYPE_DIRS",
        {"state_plan_amendment": "state-plan-amendments"},
    )
    monkeypatch.setattr("pipeline.graph.schema.ensure_schema", lambda: None)
    monkeypatch.setattr(
        "pipeline.graph.loader.read_crawler_metadata_by_local_path",
        lambda source_type, local_path: {
            "title": "Current registry document",
            "source_url": "https://example.com/attachment.pdf",
            "local_path": "state-plan-amendments/attachment.pdf",
            "file_hash": "current-hash",
            "status": "unchanged",
        },
    )
    monkeypatch.setattr(
        "pipeline.graph.loader.build_sections_from_items",
        lambda doc_dict, document_id: [
            {
                "id": f"sec:{document_id}:1",
                "document_id": document_id,
                "section_number": "1",
                "title": "Section 1",
                "level": 1,
                "content_text": doc_dict["content"],
                "content_length": len(doc_dict["content"]),
                "has_tables": False,
                "has_definitions": False,
                "parent_id": None,
                "prev_sibling_id": None,
            }
        ],
    )
    writer = RecordingGraphWriter()
    monkeypatch.setattr("pipeline.graph.loader.graph_writer", writer)

    assert load_all(source_type="state_plan_amendment") == {
        "loaded": 1,
        "sections_total": 1,
        "skipped": 1,
        "errors": 0,
    }
    (bundle,) = writer.received("upsert_document_bundle")
    assert bundle.sections[0].content_text == "Current content"


def test_load_all_refuses_ambiguous_duplicate_parse_content(
    monkeypatch,
    tmp_path,
):
    parsed_dir = tmp_path / "state-plan-amendments"
    parsed_dir.mkdir()
    (parsed_dir / "a-current.json").write_text('{"content": "Current content"}')
    (parsed_dir / "z-stale.json").write_text('{"content": "Stale content"}')

    monkeypatch.setattr("pipeline.graph.loader.PARSED_DATA_DIR", tmp_path)
    monkeypatch.setattr(
        "pipeline.graph.loader.SOURCE_TYPE_DIRS",
        {"state_plan_amendment": "state-plan-amendments"},
    )
    monkeypatch.setattr("pipeline.graph.schema.ensure_schema", lambda: None)
    monkeypatch.setattr(
        "pipeline.graph.loader._resolve_document_load_context",
        lambda json_path, source_type: {
            "document_id": "doc:state_plan_amendment:same",
            "exclusion_reason": None,
            "meta": {},
            "crawler_meta": {},
        },
    )
    loaded_paths = []
    monkeypatch.setattr(
        "pipeline.graph.loader.load_document",
        lambda json_path, source_type, load_context: loaded_paths.append(json_path),
    )
    writer = RecordingGraphWriter()
    monkeypatch.setattr("pipeline.graph.loader.graph_writer", writer)

    assert load_all(source_type="state_plan_amendment") == {
        "loaded": 0,
        "sections_total": 0,
        "skipped": 1,
        "errors": 1,
    }
    assert loaded_paths == []
    assert writer.received("delete_document") == [
        "doc:state_plan_amendment:same"
    ]
