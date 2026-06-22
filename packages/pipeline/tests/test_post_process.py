from pipeline.parse.post_process import extract_section_number, infer_level_from_number


class TestExtractSectionNumber:
    def test_simple_number(self):
        assert extract_section_number("5.0 Coverage Requirements") == "5.0"

    def test_nested_number(self):
        assert extract_section_number("5.1.3 Eligibility Criteria") == "5.1.3"

    def test_with_section_prefix(self):
        assert extract_section_number("Section 2.2 Special Provisions") == "2.2"

    def test_single_digit(self):
        assert extract_section_number("1.0 Description of the Service") == "1.0"

    def test_attachment_label(self):
        assert extract_section_number("Attachment A: Claims Information") == "Attachment A"

    def test_attachment_label_lowercase(self):
        assert extract_section_number("attachment b: Billing Codes") == "Attachment B"

    def test_no_number(self):
        assert extract_section_number("Introduction") is None

    def test_number_not_at_start(self):
        # Numbers in the middle of text are not section numbers
        assert extract_section_number("There are 42 CFR requirements") is None

    def test_deep_nesting(self):
        assert extract_section_number("5.2.1.4 Specific Conditions") == "5.2.1.4"


class TestInferLevelFromNumber:
    def test_top_level(self):
        assert infer_level_from_number("1.0") == 1

    def test_second_level(self):
        assert infer_level_from_number("5.1") == 2

    def test_third_level(self):
        assert infer_level_from_number("5.1.3") == 3

    def test_fourth_level(self):
        assert infer_level_from_number("5.2.1.4") == 4

    def test_none_input(self):
        assert infer_level_from_number(None) is None
