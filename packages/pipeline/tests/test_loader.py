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
