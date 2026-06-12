"""SSA ingestion tests — this area shipped four corpus-corrupting bugs with
zero coverage: a shifted SSA→USC mapping, headings lost to inner <i> tags,
a base-number fallback that aliased sections onto their parents, and a 50K
truncation that dropped most of the longest statutes."""

from pipeline.federal.ssa_client import SSA_TO_USC, USC_TO_SSA
from pipeline.federal.ssa_parser import parse_usc_subchapter


def _h3(num_html: str, title: str) -> str:
    return f'<h3 class="section-head">&sect;{num_html}. {title}</h3>'


def _section(num_html: str, title: str, body: str = "Body text.") -> str:
    return _h3(num_html, title) + f"<p>{body}</p>"


class TestSsaToUscMapping:
    def test_mapping_matches_usc_source_credits(self):
        # Verified against the source-credit lines in the USC HTML
        # ("...ch. 531, title XIX, §1944, as added..."). The suffix sequence
        # is NOT contiguous: 1944 is w-3a and there is no current w-7.
        assert SSA_TO_USC["1900"] == "1396"
        assert SSA_TO_USC["1901"] == "1396-1"
        assert SSA_TO_USC["1943"] == "1396w-3"
        assert SSA_TO_USC["1944"] == "1396w-3a"   # PDMP requirements
        assert SSA_TO_USC["1945"] == "1396w-4"    # health homes
        assert SSA_TO_USC["1945A"] == "1396w-4a"
        assert SSA_TO_USC["1946"] == "1396w-5"
        assert SSA_TO_USC["1947"] == "1396w-6"
        assert SSA_TO_USC["1948"] == "1396w-8"
        assert "1396w-7" not in USC_TO_SSA  # freestanding provision, not SSA

    def test_reverse_mapping_has_no_collisions(self):
        assert len(USC_TO_SSA) == len(SSA_TO_USC)


class TestParseUscSubchapter:
    def test_parses_italicized_section_numbers(self):
        # uscode.house.gov italicizes l and o to distinguish them from 1/0:
        # these headings were invisible to the old [^<]+ regex, silently
        # dropping SSA 1913, 1916, 1916A (and 2112 in CHIP).
        html = (
            _section("1396<i>l</i>", "Payment for home health services")
            + _section("1396<i>o</i>", "Use of enrollment fees, premiums…")
            + _section("1396<i>o</i>&ndash;1", "Premiums and cost sharing")
        )
        sections = parse_usc_subchapter(html, 19)
        numbers = [s["section_number"] for s in sections]
        assert numbers == ["1913", "1916", "1916A"]

    def test_unmapped_sections_are_skipped_not_aliased(self):
        # 1396b-1 is a freestanding ACA provision with no SSA number. The old
        # base-number fallback aliased it onto 1396b (SSA 1903), overwriting
        # the real SSA 1903 text in Neo4j.
        html = (
            _section("1396b", "Payment to States", "Real 1903 text.")
            + _section("1396b&ndash;1", "Payment adjustment", "Freestanding text.")
        )
        sections = parse_usc_subchapter(html, 19)
        numbers = [s["section_number"] for s in sections]
        assert numbers == ["1903"]
        assert sections[0]["content_text"] == "Real 1903 text."

    def test_long_sections_are_not_truncated(self):
        body = "word " * 30000  # ~150K chars — SSA 1902 is ~800K in reality
        html = _section("1396a", "State plans for medical assistance", body)
        sections = parse_usc_subchapter(html, 19)
        assert len(sections) == 1
        assert sections[0]["content_length"] > 100_000
        assert "[Section truncated" not in sections[0]["content_text"]

    def test_skips_non_section_headings(self):
        html = (
            '<h3 class="section-head">&sect;&sect;1396 to 1396d. Transferred</h3>'
            + _section("1396a", "State plans")
        )
        sections = parse_usc_subchapter(html, 19)
        assert [s["section_number"] for s in sections] == ["1902"]

    def test_section_ids_and_titles_use_ssa_numbers(self):
        html = _section("1396n", "Compliance with State plan requirements")
        sections = parse_usc_subchapter(html, 19)
        assert sections[0]["id"] == "sec:doc:federal_statute:ssa-title-19:1915"
        assert sections[0]["title"].startswith("Section 1915.")
