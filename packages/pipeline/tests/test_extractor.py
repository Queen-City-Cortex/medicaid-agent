from pipeline.references.extractor import extract_references


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

    def test_ssa_section_classified_separately(self):
        text = "as required by Section 1902 of the Social Security Act"
        refs = extract_references(text)
        assert any(r.ref_type == "ssa_section" and r.target_id == "1902" for r in refs)
        assert not any(r.ref_type == "section" for r in refs)

    def test_internal_section_still_works(self):
        text = "See Section 5.1.3 for eligibility criteria"
        refs = extract_references(text)
        assert any(r.ref_type == "section" and r.target_id == "5.1.3" for r in refs)

    def test_no_references(self):
        text = "This is a plain sentence with no policy references."
        refs = extract_references(text)
        assert len(refs) == 0

    def test_multiple_references(self):
        text = "See Clinical Coverage Policy 10A and Section 2.2 for details."
        refs = extract_references(text)
        assert len(refs) >= 2

    # --- cross_document false-positive rejection ---

    def test_rejects_english_word_may(self):
        text = "clinical coverage policy may change at any time"
        refs = extract_references(text)
        assert not any(r.ref_type == "cross_document" for r in refs)

    def test_rejects_english_word_has(self):
        text = "Clinical Coverage Policy has been updated"
        refs = extract_references(text)
        assert not any(r.ref_type == "cross_document" for r in refs)

    def test_rejects_english_word_at(self):
        text = "clinical coverage policy at the state level"
        refs = extract_references(text)
        assert not any(r.ref_type == "cross_document" for r in refs)

    def test_rejects_english_word_found(self):
        text = "Clinical Coverage Policy found in the manual"
        refs = extract_references(text)
        assert not any(r.ref_type == "cross_document" for r in refs)

    # --- cross_document edge-case policy numbers ---

    def test_policy_number_1_H(self):
        text = "Clinical Coverage Policy 1-H covers home health services"
        refs = extract_references(text)
        assert any(r.ref_type == "cross_document" and r.target_id == "1-H" for r in refs)

    def test_policy_number_1_O_5(self):
        text = "as defined in Clinical Coverage Policy 1-O-5"
        refs = extract_references(text)
        assert any(r.ref_type == "cross_document" and r.target_id == "1-O-5" for r in refs)

    def test_policy_number_8_D2(self):
        text = "Clinical Coverage Policy No. 8-D2 addresses dental"
        refs = extract_references(text)
        assert any(r.ref_type == "cross_document" and r.target_id == "8-D2" for r in refs)

    def test_policy_number_2B_1(self):
        text = "refer to Clinical Coverage Policy 2B-1"
        refs = extract_references(text)
        assert any(r.ref_type == "cross_document" and r.target_id == "2B-1" for r in refs)

    def test_policy_number_simple_digit_letter(self):
        text = "Clinical Coverage Policy 5A provides guidance"
        refs = extract_references(text)
        assert any(r.ref_type == "cross_document" and r.target_id == "5A" for r in refs)


class TestCfrCitationForms:
    """The dotted C.F.R. form appears ~10K times in the corpus and the Part
    form is common in bulletins — both were previously never extracted."""

    def test_dotted_cfr_form(self):
        refs = extract_references("See 42 C.F.R. § 441.301(c) for details.")
        federal = [r for r in refs if r.ref_type == "federal_regulation"]
        assert len(federal) == 1
        assert federal[0].target_id == "42 CFR 441.301"

    def test_cfr_part_form(self):
        refs = extract_references("as required by 42 CFR Part 438")
        federal = [r for r in refs if r.ref_type == "federal_regulation"]
        assert len(federal) == 1
        assert federal[0].target_id == "42 CFR 438"

    def test_plain_cfr_form_still_works(self):
        refs = extract_references("Per 42 CFR 440.70 home health is covered.")
        federal = [r for r in refs if r.ref_type == "federal_regulation"]
        assert federal[0].target_id == "42 CFR 440.70"

    def test_double_section_symbol(self):
        refs = extract_references("See 42 C.F.R. §§ 438.14 and others.")
        federal = [r for r in refs if r.ref_type == "federal_regulation"]
        assert federal[0].target_id == "42 CFR 438.14"


class TestSsaSectionRanges:
    def test_letter_suffix_sections_extracted(self):
        refs = extract_references("Under Section 1916A premiums apply.")
        ssa = [r for r in refs if r.ref_type == "ssa_section"]
        assert [r.target_id for r in ssa] == ["1916A"]

    def test_medicare_sections_not_extracted(self):
        # 18xx is Medicare (Title XVIII) — not in the corpus, never resolvable.
        refs = extract_references("See Section 1861 of the Act.")
        assert [r for r in refs if r.ref_type == "ssa_section"] == []
