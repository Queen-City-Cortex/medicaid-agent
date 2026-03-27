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

    def test_extracts_three_sections(self, sample_xml):
        sections = parse_part_xml(sample_xml, 42, 440)
        assert len(sections) == 3

    def test_sections_have_numbers(self, sample_xml):
        sections = parse_part_xml(sample_xml, 42, 440)
        for s in sections:
            assert s["section_number"] is not None
            assert "." in s["section_number"]  # e.g., "440.1"

    def test_section_numbers_correct(self, sample_xml):
        sections = parse_part_xml(sample_xml, 42, 440)
        numbers = {s["section_number"] for s in sections}
        assert numbers == {"440.1", "440.70", "440.130"}

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

    def test_section_440_70_id(self, sample_xml):
        sections = parse_part_xml(sample_xml, 42, 440)
        by_num = {s["section_number"]: s for s in sections}
        assert by_num["440.70"]["id"] == "sec:doc:federal_regulation:42-CFR-440:440.70"

    def test_heading_markers_stripped(self, sample_xml):
        sections = parse_part_xml(sample_xml, 42, 440)
        for s in sections:
            # Title should not start with "§" — that should be stripped
            assert not s["title"].startswith("§")

    def test_440_70_title(self, sample_xml):
        sections = parse_part_xml(sample_xml, 42, 440)
        by_num = {s["section_number"]: s for s in sections}
        assert by_num["440.70"]["title"] == "Home health services"

    def test_440_130_title(self, sample_xml):
        sections = parse_part_xml(sample_xml, 42, 440)
        by_num = {s["section_number"]: s for s in sections}
        assert by_num["440.130"]["title"] == "Diagnostic, screening, preventive, and rehabilitative services"

    def test_content_length_positive(self, sample_xml):
        sections = parse_part_xml(sample_xml, 42, 440)
        by_num = {s["section_number"]: s for s in sections}
        # 440.70 is a long section with lots of content
        assert by_num["440.70"]["content_length"] > 100

    def test_document_id_on_sections(self, sample_xml):
        sections = parse_part_xml(sample_xml, 42, 440)
        for s in sections:
            assert s["document_id"] == "doc:federal_regulation:42-CFR-440"

    def test_level_is_one(self, sample_xml):
        sections = parse_part_xml(sample_xml, 42, 440)
        for s in sections:
            assert s["level"] == 1

    def test_has_tables_is_bool(self, sample_xml):
        sections = parse_part_xml(sample_xml, 42, 440)
        for s in sections:
            assert isinstance(s["has_tables"], bool)

    def test_has_definitions_is_bool(self, sample_xml):
        sections = parse_part_xml(sample_xml, 42, 440)
        for s in sections:
            assert isinstance(s["has_definitions"], bool)
