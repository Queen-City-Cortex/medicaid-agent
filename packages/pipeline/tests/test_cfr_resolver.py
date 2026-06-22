"""Test CFR citation parsing and normalization."""

from pipeline.references.resolver import parse_cfr_citation


class TestParseCfrCitation:
    def test_standard_format(self):
        result = parse_cfr_citation("42 CFR 440.70")
        assert result == {"title": 42, "section": "440.70", "part": 440}

    def test_with_section_symbol(self):
        result = parse_cfr_citation("42 CFR §440.70")
        assert result == {"title": 42, "section": "440.70", "part": 440}

    def test_with_spaced_section_symbol(self):
        result = parse_cfr_citation("42 CFR § 440.70")
        assert result == {"title": 42, "section": "440.70", "part": 440}

    def test_no_space_before_cfr(self):
        result = parse_cfr_citation("42CFR § 440.70")
        assert result == {"title": 42, "section": "440.70", "part": 440}

    def test_with_subsection(self):
        # Subsection (b)(3) should be stripped — resolve to parent section
        result = parse_cfr_citation("42 CFR 440.70(b)(3)")
        assert result == {"title": 42, "section": "440.70", "part": 440}

    def test_three_digit_part(self):
        result = parse_cfr_citation("42 CFR 438.10")
        assert result == {"title": 42, "section": "438.10", "part": 438}

    def test_deep_section(self):
        result = parse_cfr_citation("42 CFR 484.4")
        assert result == {"title": 42, "section": "484.4", "part": 484}

    def test_title_45(self):
        result = parse_cfr_citation("45 CFR 92.42")
        assert result == {"title": 45, "section": "92.42", "part": 92}

    def test_invalid_format(self):
        result = parse_cfr_citation("not a cfr citation")
        assert result is None

    def test_from_target_id_format(self):
        # The extractor produces target_ids like "42 CFR 440.70"
        result = parse_cfr_citation("42 CFR 440.70")
        assert result is not None

    def test_embedded_in_sentence(self):
        result = parse_cfr_citation("requirements under 42 CFR 440.70 apply here")
        assert result == {"title": 42, "section": "440.70", "part": 440}

    def test_single_digit_section_suffix(self):
        result = parse_cfr_citation("42 CFR 440.1")
        assert result == {"title": 42, "section": "440.1", "part": 440}

    def test_superseded_part_74_redirects_to_2_cfr_200_part_level(self):
        # 45 CFR Part 74 was superseded by Part 75 in 2014; HHS then rescinded
        # Part 75 in late 2025 in favor of 2 CFR Part 200. The redirect is
        # PART-level only: replacement parts do not share section numbering
        # (45 CFR 75.326 is procurement; 2 CFR 200.326 is bonding), so the old
        # behavior of rewriting "74.x" to "200.x" fabricated citations.
        result = parse_cfr_citation("45 CFR 74.1")
        assert result == {
            "title": 2,
            "section": "200",
            "part": 200,
            "redirected_from": {"title": 45, "section": "74.1", "part": 74},
        }

    def test_superseded_part_75_redirects_to_2_cfr_200_part_level(self):
        result = parse_cfr_citation("45 CFR 75.326")
        assert result == {
            "title": 2,
            "section": "200",
            "part": 200,
            "redirected_from": {"title": 45, "section": "75.326", "part": 75},
        }

    def test_non_superseded_part_unchanged(self):
        # 42 CFR 440 is not superseded — should pass through unchanged
        result = parse_cfr_citation("42 CFR 440.70")
        assert result == {"title": 42, "section": "440.70", "part": 440}
