"""Tracing golden quotes to the sections that hold them after a document moves."""

from pipeline.eval.relocate import family_of, relocate_golden_sections


def section(section_id, text, **extra):
    return {
        "section_id": section_id,
        "document_id": section_id.rsplit(":", 1)[0].removeprefix("sec:"),
        "section_number": None,
        "section_title": "B. Rights",
        "document_title": "MA-3430",
        "source_url": "https://example.test/ma-3430-new.pdf",
        "content_text": text,
        **extra,
    }


def entry(**changes):
    return {
        "id": "q-056",
        "status": "validated",
        "evidence": {
            "primary_sections": [
                {"document_id": "doc:dhhs_policy:old", "section_id": "sec:doc:dhhs_policy:old:_s35",
                 "relevance": "hearing request deadline"},
            ],
            "supporting_sections": [
                {"document_id": "doc:federal_regulation:431", "section_id": "sec:doc:federal_regulation:431:431.221",
                 "relevance": "federal maximum"},
            ],
        },
        "supporting_quotes": [
            {"section_id": "sec:doc:dhhs_policy:old:_s35", "quote": "within 60 calendar days"},
            {"section_id": "sec:doc:federal_regulation:431:431.221", "quote": "not to exceed 90 days"},
        ],
        **changes,
    }


def test_family_is_read_from_a_section_or_document_id():
    assert family_of("sec:doc:dhhs_policy:abc:_s3") == "dhhs_policy"
    assert family_of("doc:managed_care_contract:abc") == "managed_care_contract"


def test_a_quote_is_traced_to_the_republished_document():
    report = relocate_golden_sections(
        [entry()],
        [
            section("sec:doc:dhhs_policy:new:_s33", "A request must be made within  60 calendar\ndays of the notice."),
            section("sec:doc:dhhs_policy:new:_s34", "Unrelated text."),
        ],
    )

    assert [moved["section_id"] for moved in report["moved"]] == ["sec:doc:dhhs_policy:old:_s35"]
    found = report["moved"][0]["quotes"][0]["found_in"]
    assert [row["section_id"] for row in found] == ["sec:doc:dhhs_policy:new:_s33"]
    assert found[0]["source_url"] == "https://example.test/ma-3430-new.pdf"
    # Federal sections are read from caches, not from the parsed corpus scanned here.
    assert report["families_scanned"] == ["dhhs_policy"]


def test_a_section_still_in_the_corpus_is_not_reported():
    report = relocate_golden_sections(
        [entry()], [section("sec:doc:dhhs_policy:old:_s35", "within 60 calendar days")]
    )

    assert report["moved"] == []


def test_a_quote_found_nowhere_and_a_section_with_no_quote_are_reported_as_such():
    unquoted = entry()
    unquoted["evidence"]["supporting_sections"].append(
        {"document_id": "doc:dhhs_policy:old", "section_id": "sec:doc:dhhs_policy:old:_s2", "relevance": "header"}
    )
    report = relocate_golden_sections(
        [unquoted], [section("sec:doc:dhhs_policy:new:_s1", "Nothing relevant.")]
    )

    by_id = {moved["section_id"]: moved for moved in report["moved"]}
    assert by_id["sec:doc:dhhs_policy:old:_s35"]["quotes"][0]["found_in"] == []
    assert by_id["sec:doc:dhhs_policy:old:_s2"]["quotes"] == []


def test_entries_without_quotes_are_not_checked():
    report = relocate_golden_sections(
        [entry(supporting_quotes=[])], [section("sec:doc:dhhs_policy:new:_s1", "text")]
    )

    assert report["moved"] == [] and report["cited_sections"] == 0
