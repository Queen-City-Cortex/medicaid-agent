"""Tests for LLM-based cross-reference extraction."""

import json
from unittest.mock import patch


from pipeline.references.llm_extractor import (
    _build_document_catalog,
    _build_sections_message,
    _parse_response,
    _raw_to_reference_matches,
    extract_references_llm,
)


SAMPLE_CATALOG = [
    {"id": "doc:clinical_policy:1-H", "policy_number": "1-H", "title": "Home Health Services", "document_type": "clinical_policy"},
    {"id": "doc:clinical_policy:5A", "policy_number": "5A", "title": "Durable Medical Equipment", "document_type": "clinical_policy"},
    {"id": "doc:clinical_policy:10A", "policy_number": "10A", "title": "Outpatient Behavioral Health", "document_type": "clinical_policy"},
]

SAMPLE_SECTIONS = [
    {
        "id": "sec:doc:clinical_policy:3K-2:2.0",
        "document_id": "doc:clinical_policy:3K-2",
        "title": "General Provisions",
        "content_text": "Home health services as described in the home health policy are covered when medically necessary.",
    },
    {
        "id": "sec:doc:clinical_policy:3K-2:3.0",
        "document_id": "doc:clinical_policy:3K-2",
        "title": "Covered Criteria",
        "content_text": "DME may be authorized per the durable medical equipment policy guidelines.",
    },
]


class TestBuildDocumentCatalog:
    def test_formats_catalog(self):
        result = _build_document_catalog(SAMPLE_CATALOG)
        assert "1-H: Home Health Services [clinical_policy]" in result
        assert "5A: Durable Medical Equipment [clinical_policy]" in result

    def test_empty_catalog(self):
        result = _build_document_catalog([])
        assert result == ""

    def test_missing_fields(self):
        docs = [{"id": "doc:x", "policy_number": None, "title": None, "document_type": None}]
        result = _build_document_catalog(docs)
        assert "(none)" in result


class TestBuildSectionsMessage:
    def test_formats_sections(self):
        result = _build_sections_message(SAMPLE_SECTIONS)
        assert "sec:doc:clinical_policy:3K-2:2.0" in result
        assert "General Provisions" in result
        assert "home health policy" in result

    def test_truncates_long_content(self):
        sections = [{"id": "sec:x", "document_id": "doc:x", "title": "T", "content_text": "x" * 5000}]
        result = _build_sections_message(sections)
        # Content should be capped at 2000 chars
        assert len(result) < 2500


class TestParseResponse:
    def test_valid_json_array(self):
        text = json.dumps([
            {"section_id": "sec:a", "ref_type": "cross_document", "target_id": "1-H",
             "matched_text": "home health policy", "confidence": "high"},
        ])
        result = _parse_response(text)
        assert len(result) == 1
        assert result[0]["target_id"] == "1-H"

    def test_empty_array(self):
        result = _parse_response("[]")
        assert result == []

    def test_strips_markdown_fences(self):
        text = "```json\n[{\"ref_type\": \"cross_document\", \"target_id\": \"5A\"}]\n```"
        result = _parse_response(text)
        assert len(result) == 1

    def test_invalid_json_returns_empty(self):
        result = _parse_response("not json at all")
        assert result == []

    def test_non_list_returns_empty(self):
        result = _parse_response('{"key": "value"}')
        assert result == []


class TestRawToReferenceMatches:
    def test_converts_high_confidence(self):
        raw = [{"ref_type": "cross_document", "target_id": "1-H",
                "matched_text": "home health policy", "confidence": "high"}]
        matches = _raw_to_reference_matches(raw)
        assert len(matches) == 1
        assert matches[0].ref_type == "cross_document"
        assert matches[0].target_id == "1-H"
        assert matches[0].extraction_method == "llm"
        assert matches[0].confidence == "high"

    def test_converts_medium_confidence(self):
        raw = [{"ref_type": "federal_regulation", "target_id": "42 CFR 484",
                "matched_text": "federal home health regs", "confidence": "medium"}]
        matches = _raw_to_reference_matches(raw)
        assert len(matches) == 1

    def test_filters_low_confidence(self):
        raw = [{"ref_type": "cross_document", "target_id": "maybe-1A",
                "matched_text": "some policy", "confidence": "low"}]
        matches = _raw_to_reference_matches(raw)
        assert len(matches) == 0

    def test_skips_missing_fields(self):
        raw = [
            {"ref_type": "cross_document"},  # missing target_id
            {"target_id": "1-H"},            # missing ref_type
            {},                               # empty
        ]
        matches = _raw_to_reference_matches(raw)
        assert len(matches) == 0


class TestExtractReferencesLlm:
    @patch("pipeline.references.llm_extractor._call_llm")
    def test_batches_sections(self, mock_call):
        mock_call.return_value = []  # structured tool_use returns list directly
        sections = [{"id": f"sec:{i}", "document_id": "doc:x", "content_text": "text"} for i in range(25)]

        result = extract_references_llm(sections, SAMPLE_CATALOG, batch_size=10)

        assert mock_call.call_count == 3  # 25 sections / 10 per batch = 3 batches
        assert isinstance(result, dict)

    @patch("pipeline.references.llm_extractor._call_llm")
    def test_returns_parsed_refs(self, mock_call):
        mock_call.return_value = [
            {"section_id": "sec:doc:clinical_policy:3K-2:2.0", "ref_type": "cross_document",
             "target_id": "1-H", "matched_text": "home health policy", "confidence": "high"},
        ]

        result = extract_references_llm(SAMPLE_SECTIONS[:1], SAMPLE_CATALOG, batch_size=10)

        assert "sec:doc:clinical_policy:3K-2:2.0" in result
        assert len(result["sec:doc:clinical_policy:3K-2:2.0"]) == 1
        assert result["sec:doc:clinical_policy:3K-2:2.0"][0].target_id == "1-H"

    @patch("pipeline.references.llm_extractor._call_llm")
    def test_handles_api_error_gracefully(self, mock_call):
        import httpx
        mock_call.side_effect = httpx.HTTPError("API down")

        result = extract_references_llm(SAMPLE_SECTIONS, SAMPLE_CATALOG, batch_size=10)
        assert result == {}

    @patch("pipeline.references.llm_extractor._call_llm")
    def test_handles_empty_result(self, mock_call):
        mock_call.return_value = []  # no references found

        result = extract_references_llm(SAMPLE_SECTIONS, SAMPLE_CATALOG, batch_size=10)
        assert result == {}
