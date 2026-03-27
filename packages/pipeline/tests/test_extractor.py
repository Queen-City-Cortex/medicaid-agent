import pytest
from pipeline.references.extractor import extract_references, ReferenceMatch


class TestExtractReferences:
    def test_clinical_coverage_policy(self):
        text = "as defined in Clinical Coverage Policy 3K-2, Section 5.1"
        refs = extract_references(text)
        assert any(r.ref_type == "cross_document" and r.target_id == "3K-2" for r in refs)
        assert any(r.ref_type == "section" and r.target_id == "5.1" for r in refs)

    def test_section_reference(self):
        text = "See Section 5.1.3 for eligibility criteria"
        refs = extract_references(text)
        assert any(r.ref_type == "section" and r.target_id == "5.1.3" for r in refs)

    def test_subsection_reference(self):
        text = "as outlined in Subsection 5.3.3"
        refs = extract_references(text)
        assert any(r.ref_type == "section" and r.target_id == "5.3.3" for r in refs)

    def test_attachment_reference(self):
        text = "per the procedure detailed in Attachment B"
        refs = extract_references(text)
        assert any(r.ref_type == "attachment" and r.target_id == "B" for r in refs)

    def test_cfr_reference(self):
        text = "in accordance with 42 CFR 484.65"
        refs = extract_references(text)
        assert any(r.ref_type == "federal_regulation" for r in refs)

    def test_spa_reference(self):
        text = "State Plan Amendment SPA 24-0001"
        refs = extract_references(text)
        assert any(r.ref_type == "spa" and r.target_id == "24-0001" for r in refs)

    def test_waiver_reference(self):
        text = "under the 1915(c) waiver program"
        refs = extract_references(text)
        assert any(r.ref_type == "waiver" for r in refs)

    def test_no_references(self):
        text = "This is a plain sentence with no policy references."
        refs = extract_references(text)
        assert len(refs) == 0

    def test_multiple_references(self):
        text = "See Clinical Coverage Policy 10A and Section 2.2 for details."
        refs = extract_references(text)
        assert len(refs) >= 2
