"""North Carolina General Statutes pages: parse, dispatch and load shape."""

import hashlib
import html
import json
from pathlib import Path
import re

import pytest

from pipeline.corpus_manifest import SOURCE_FAMILY_MAP
from pipeline.graph.loader import load_document
from pipeline.parse import converter
from pipeline.parse.nc_statute import parse_nc_statute_html
from tests.fakes import RecordingGraphWriter

FIXTURES = Path(__file__).parent / "fixtures" / "nc-statutes"
PAGES = {
    "108A-70.9A": ("82859ad2cb4bbfc94bd0f68c2d8870a5ba8d37545d16250a5fa2684c672c8abf", "a b c c1 d e e1 f"),
    "108A-79": ("9280380459cce0ea18291e26c3a59dc819455e1cc8f284b1d4484a05009b3bcd", "a b c d e f g h i j j1 k l"),
    "108D-14": ("c61c8e66fec011e5171fd82b5d32532fe971558d709a6dc39590a497d266cd4c", "a b c d e f g"),
    "108D-15": ("eb4ed1c36b69d0185dd594209c9c9836a7e06ddefe4029b35ffc88c46821ada9", "a b c d e f g h i j k l m"),
}


def _page(citation: str) -> Path:
    return FIXTURES / f"GS_{citation}.html"


def _published_text(citation: str) -> str:
    """The page's words with tags removed, independent of the parser."""
    body = _page(citation).read_text(encoding="utf-8").split("</head>", 1)[1]
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", body)).split())


@pytest.mark.parametrize("citation", PAGES)
def test_page_parses_into_cited_section_lettered_children_and_history(citation):
    sha256, letters = PAGES[citation]
    assert hashlib.sha256(_page(citation).read_bytes()).hexdigest() == sha256

    parsed = parse_nc_statute_html(_page(citation))
    payload = parsed["payload"]
    top, *children, history = payload["synthetic_sections"]

    assert parsed["answer_ready"] and parsed["quality_flags"] == []
    assert (top["section_number"], top["level"]) == (citation, 1)
    assert payload["statute_citation"] == citation
    assert payload["document_title"] == f"N.C.G.S. {citation} - {top['title']}"
    assert [child["section_number"] for child in children] == [f"{citation}({letter})" for letter in letters.split()]
    for child, letter in zip(children, letters.split()):
        assert child["level"] == 2
        assert child["content_text"].startswith(f"({letter}) ")
    assert (history["section_number"], history["title"]) == (None, "History")
    assert history["content_text"] == payload["history_note"]
    assert re.fullmatch(r"\(\d{4}.*\.\)", history["content_text"], re.S)
    assert _published_text(citation).endswith(history["content_text"])
    assert history["content_text"] not in children[-1]["content_text"]
    # No date or currency claim is invented, and no markup or CSS survives.
    assert parsed["source_modified_date"] is None
    everything = parsed["markdown"] + json.dumps(payload)
    assert not re.search(r"<\w+|font-family|\{margin|&nbsp;|&sect;|\\t", everything)


# Each time limit as the committed pages state it, in the child a citation of
# that subsection lands on, and in no other child.
@pytest.mark.parametrize(
    ("citation", "subsection", "figure"),
    [
        ("108A-70.9A", "(d)", "shall request a hearing within 30 days of the mailing of the notice"),
        ("108A-79", "(c)", "notice of appeal must be given within 60 days from the date of the action"),
        ("108D-14", "(a)", "no later than 60 days after the mailing date of the notice of adverse benefit determination"),
        ("108D-15", "(d)", "with OAH by no later than 120 days after the mailing date of the notice of resolution"),
    ],
)
def test_time_limit_is_in_the_cited_subsection(citation, subsection, figure):
    sections = parse_nc_statute_html(_page(citation))["payload"]["synthetic_sections"]
    holders = [s["section_number"] for s in sections if figure in s["content_text"]]
    assert holders == [f"{citation}{subsection}"]


def test_effective_until_is_body_text_not_a_currency_flag():
    parsed = parse_nc_statute_html(_page("108A-79"))
    by_number = {s["section_number"]: s for s in parsed["payload"]["synthetic_sections"]}
    assert "no action shall become effective until 10 workdays" in by_number["108A-79(b)"]["content_text"]
    assert parsed["answer_ready"] and parsed["quality_flags"] == []


def test_appeal_deadline_sentence_is_kept_as_published_in_subsection_d():
    parsed = parse_nc_statute_html(_page("108A-70.9A"))
    by_number = {s["section_number"]: s for s in parsed["payload"]["synthetic_sections"]}
    subsection = by_number["108A-70.9A(d)"]
    sentence = next(
        s for s in re.split(r"(?<=\.) ", subsection["content_text"])
        if s.startswith("The recipient shall request a hearing within")
    )
    assert sentence.startswith("The recipient shall request a hearing within 30 days of the mailing of the notice")
    assert sentence in _published_text("108A-70.9A")
    # Numbered items stay inside their lettered parent.
    assert "\n(1) " in by_number["108A-70.9A(a)"]["content_text"]
    assert "108A-70.9A(a)(1)" not in by_number
    # The Part heading is context on the top section, not a section.
    assert by_number["108A-70.9A"]["content_text"].startswith("Part 6A.")
    assert parsed["payload"]["statute_context"].startswith("Part 6A.")


def test_unseen_page_shapes_fail_closed(tmp_path):
    page = tmp_path / "GS_1-1.html"
    page.write_text("<body><p>&sect; 1-1. &nbsp;(Effective until January 1, 2099) Short title.</p><p>Text.  (1999-1, s. 1.)</p>"
                    "<p>&sect; 1-1. &nbsp;(Effective January 1, 2099) Short title.</p><p>Text.  (1999-1, s. 1.)</p></body>")
    dual = parse_nc_statute_html(page)
    assert {"nc_statute_multiple_versions", "nc_statute_not_current_signal"} <= set(dual["quality_flags"])
    assert not dual["answer_ready"]

    page.write_text("<body><p>&sect; 1-1. &nbsp;Short title.</p><p>Repealed by Session Laws 2001-1, s. 1.</p></body>")
    assert "nc_statute_not_current_signal" in parse_nc_statute_html(page)["quality_flags"]


def test_converter_uses_the_statute_branch_for_the_family_only():
    statute = converter.parse_supported_file(_page("108D-14"), None, "nc_statute")
    assert statute["payload"]["statute_citation"] == "108D-14"
    # Any other family keeps the <article> contract, which these pages lack.
    assert converter.parse_supported_file(_page("108D-14"), None, "state_plan")["section_count"] == 0


def _v6_cache(monkeypatch, tmp_path, source_type: str) -> tuple[Path, Path, dict]:
    """A valid version 6 sidecar, as the generic parsers wrote it."""
    monkeypatch.setattr(converter, "PARSED_DATA_DIR", tmp_path / "parsed")
    source = tmp_path / "GS_108D-14.html"
    source.write_bytes(_page("108D-14").read_bytes())
    json_path, md_path, meta_path = converter.parsed_output_paths(source, source_type)
    json_path.write_text('{"name": "evidence"}')
    md_path.write_text("Evidence")
    meta = {
        "source_file_hash": f"sha256:{converter.file_sha256(source)}",
        "parse_status": "parsed",
        "answer_ready": True,
        "parse_cache_version": 6,
        "section_count": 3,
        "quality_flags": [],
        "attempt_count_total": 2,
        "artifacts": {
            "json": {"sha256": f"sha256:{converter.file_sha256(json_path)}"},
            "markdown": {"sha256": f"sha256:{converter.file_sha256(md_path)}"},
        },
    }
    meta_path.write_text(json.dumps(meta))
    return source, meta_path, meta


def test_v6_sidecar_of_another_family_is_upgraded_in_place_without_reparsing(monkeypatch, tmp_path):
    assert converter.PARSE_CACHE_VERSION == 7
    source, meta_path, before = _v6_cache(monkeypatch, tmp_path, "state_plan")

    assert converter.should_parse(source, meta_path, "state_plan") is False

    after = json.loads(meta_path.read_text())
    assert after.pop("parse_cache_version") == 7
    assert after.pop("cache_migrated_from_version") == 6
    assert after.pop("cache_migrated_at")
    assert after.pop("attempt_count_generation") == 0
    # Every field the version 6 parse wrote is carried over unchanged.
    assert after == {key: value for key, value in before.items() if key != "parse_cache_version"}
    assert "statute_citation" not in after


def test_v6_sidecar_is_never_taken_for_a_parsed_statute_page(monkeypatch, tmp_path):
    source, meta_path, before = _v6_cache(monkeypatch, tmp_path, "nc_statute")

    assert converter.should_parse(source, meta_path, "nc_statute") is True
    assert json.loads(meta_path.read_text()) == before


def test_statute_loads_with_citation_key_children_and_no_effective_date(monkeypatch, tmp_path):
    path = tmp_path / "GS_108A-70.9A.json"
    path.write_text(json.dumps(parse_nc_statute_html(_page("108A-70.9A"))["payload"]))
    writer = RecordingGraphWriter()
    monkeypatch.setattr("pipeline.graph.loader.graph_writer", writer)
    url = "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_108A/GS_108A-70.9A.html"
    context = {"meta": {}, "source_file_path": _page("108A-70.9A"),
               "crawler_meta": {"title": None, "source_url": url, "status": "downloaded"},
               "document_id": "doc:nc-statute", "exclusion_reason": None}

    load_document(path, "nc_statute", load_context=context)

    bundle, = writer.received("upsert_document_bundle")
    document = bundle.document
    assert document.document_type == "nc_statute"
    assert (document.authority_tier, document.answer_role) == ("authoritative", "appeals")
    assert not SOURCE_FAMILY_MAP["nc_statute"].required_for_answering
    assert document.policy_number == "108A-70.9A"
    assert document.title == "N.C.G.S. 108A-70.9A - Definitions; Medicaid recipient appeals"
    assert document.effective_date is None and document.source_modified_date is None
    sections = {section.section_number: section for section in bundle.sections if section.section_number}
    top = sections["108A-70.9A"]
    assert top.parent_id is None
    assert all(s.parent_id == top.id for n, s in sections.items() if n != "108A-70.9A")
    assert sections["108A-70.9A(d)"].id == "sec:doc:nc-statute:108A-70.9A(d)"
    history, = [s for s in bundle.sections if s.title == "History"]
    assert history.parent_id == top.id
