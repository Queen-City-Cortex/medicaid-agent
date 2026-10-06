"""The USLM adapter takes statute text, and only statute text, from GovInfo's
compilations: numbers from num/@value, children from direct subsection
elements, footnotes and editorial notes dropped. The HTML parser it replaced
stored editorial notes as statute text and fabricated children such as
1917(i) and 1903(dd) from nested clauses and amendment notes."""

import re
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

from pipeline.federal.uslm_parser import (
    SECTION,
    SUBSECTION,
    NUM,
    compilation_metadata,
    parse_statute_compilation,
)
from pipeline.references.citations import federal_statute_doc_id

FIXTURES = Path(__file__).parent / "fixtures" / "uslm"
TITLE_XIX = (FIXTURES / "COMPS-8765.trimmed.xml").read_text()
TITLE_XXI = (FIXTURES / "COMPS-8770.trimmed.xml").read_text()
FABRICATED_BY_THE_HTML_PARSER = {"1917(i)", "2105(i)", "1903(cc)", "1903(dd)"}


def parents(sections):
    return [s for s in sections if s["level"] == 1]


def children(sections):
    return [s for s in sections if s["level"] == 2]


def by_number(sections, number):
    return next(s for s in sections if s["section_number"] == number)


@pytest.fixture(scope="module")
def xix():
    return parse_statute_compilation(TITLE_XIX, 19)


@pytest.fixture(scope="module")
def xxi():
    return parse_statute_compilation(TITLE_XXI, 21)


def test_section_numbers_come_from_num_value_including_lettered_suffixes(xix):
    assert [s["section_number"] for s in parents(xix)] == [
        "1901", "1902", "1903", "1905", "1906A", "1915", "1917", "1923",
    ]


def test_ids_and_document_ids_are_unchanged_from_the_html_parser(xix):
    doc_id = federal_statute_doc_id(19)
    section = by_number(xix, "1902")
    assert section["id"] == f"sec:{doc_id}:1902"
    assert section["document_id"] == doc_id
    assert section["title"] == "Section 1902. State plans for medical assistance"
    assert by_number(xix, "1917")["title"] == (
        "Section 1917. Liens, adjustments and recoveries, and transfers of assets"
    )
    child = by_number(xix, "1902(a)")
    assert child["id"] == f"sec:{doc_id}:1902-a"
    assert child["parent_id"] == section["id"]
    assert child["level"] == 2


@pytest.mark.parametrize(
    "fixture,title_num,number,letters",
    [
        (TITLE_XIX, 19, "1917", list("abcdefgh")),
        (TITLE_XIX, 19, "1903", list("abcdefgijklmopqrstuvwxyz") + ["aa", "bb"]),
        (TITLE_XXI, 21, "2105", list("abcdefgh")),
    ],
)
def test_children_are_the_direct_subsections_and_nothing_else(fixture, title_num, number, letters):
    sections = parse_statute_compilation(fixture, title_num)
    assert [c["section_number"] for c in children(sections) if c["parent_id"].endswith(f":{number}")] == [
        f"{number}({letter})" for letter in letters
    ]


def test_no_child_fabricated_by_the_html_parser_survives(xix, xxi):
    numbers = {s["section_number"] for s in xix + xxi}
    assert not numbers & FABRICATED_BY_THE_HTML_PARSER


@pytest.mark.parametrize("fixture,title_num", [(TITLE_XIX, 19), (TITLE_XXI, 21)])
def test_every_child_exists_as_a_direct_subsection_in_the_xml(fixture, title_num):
    root = ET.fromstring(fixture)
    direct = {
        (section.find(NUM).get("value"), subsection.find(NUM).get("value"))
        for section in root.iter(SECTION)
        for subsection in section.findall(SUBSECTION)
    }
    emitted = {
        (child["parent_id"].rsplit(":", 1)[1], re.fullmatch(r"\w+\((\w+)\)", child["section_number"]).group(1))
        for child in children(parse_statute_compilation(fixture, title_num))
    }
    assert emitted == direct


def test_duplicate_subsection_letters_keep_one_child(xxi):
    # 2108 carries two subsections (e); the compiler's footnote says so.
    assert [c["section_number"] for c in children(xxi) if c["parent_id"].endswith(":2108")] == [
        "2108(a)", "2108(b)", "2108(c)", "2108(d)", "2108(e)",
    ]
    # The parent keeps both texts.
    assert by_number(xxi, "2108")["content_text"].count("\n(e) ") == 2


def test_footnotes_and_their_markers_are_dropped(xix):
    text = "\n".join(s["content_text"] for s in xix)
    assert "So in law" not in text
    assert "Section 6101(b)(1) of division J" not in text
    # The superscript marker "8" after "screening," goes with its footnote.
    paragraph_77 = by_number(xix, "1902(a)")["content_text"]
    assert "provider and supplier screening, oversight, and reporting requirements" in paragraph_77
    assert "screening,8" not in paragraph_77
    assert by_number(xix, "1902(kk)")["title"] == (
        "Section 1902(kk). Provider and Supplier Screening, Oversight, and Reporting Requirements"
    )


def test_editorial_notes_and_source_references_are_not_statute_text(xix):
    text = "\n".join(s["content_text"] for s in xix)
    assert "[42 U.S.C." not in text
    assert "U.S.C. 1396a" not in text
    assert "Repealed by sec." not in text
    assert "provides for an amendme" not in text


def test_subsection_text_keeps_paragraph_structure(xix):
    child = by_number(xix, "1902(a)")
    lines = child["content_text"].split("\n")
    assert lines[0] == "(a) A State plan for medical assistance must—"
    assert lines[1].startswith("(1) ")
    paragraph_34 = next(line for line in lines if line.startswith("(34) "))
    assert paragraph_34.endswith("eligible for medical assistance under the plan and—")
    assert any(line.startswith("(A) is enrolled under paragraph (10)(A)(i)(VIII)") for line in lines)
    assert child["content_text"] in by_number(xix, "1902")["content_text"]


def test_section_1902_a_34_is_the_compilations_text(xix):
    # Recorded for the DATA-1 spot check: the compilation carries the
    # P.L. 119-21 wording (applications on or after 1 January 2027) as the
    # section text, with no note; the earlier "third month" rule is absent.
    text = by_number(xix, "1902(a)")["content_text"]
    assert "furnished in or after the month before the month in which the individual made application" in text
    assert "third month" not in text


def test_section_without_subsections_has_only_its_own_text(xix):
    section = by_number(xix, "1901")
    assert section["content_text"].startswith("For the purpose of enabling each State")
    assert not [c for c in children(xix) if c["parent_id"] == section["id"]]


def test_metadata_reports_the_currency_statement():
    assert compilation_metadata(TITLE_XIX) == {
        "current_through_public_law": "119–75",
        "processed_date": "2026-09-11",
    }
    assert compilation_metadata(TITLE_XXI)["processed_date"] == "2026-02-20"
