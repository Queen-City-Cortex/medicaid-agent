"""Test graph loading from parsed Docling JSON."""

import json
import pytest
from pathlib import Path

from pipeline.graph.loader import (
    walk_docling_document,
    build_sections_from_items,
    _extract_dhhs_policy_number,
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
