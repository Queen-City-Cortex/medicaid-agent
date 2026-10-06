"""GovInfo compilations are validated before they replace a cache, and the
USC mapping survives the HTML parser's deletion."""

import hashlib
import re
from io import BytesIO
from pathlib import Path

import pytest

from pipeline.federal import ecfr_client
from pipeline.federal import ssa_client
from pipeline.federal.ssa_client import SSA_TO_USC, USC_TO_SSA

FIXTURES = Path(__file__).parent / "fixtures" / "uslm"
COMPILATIONS = {
    19: (FIXTURES / "COMPS-8765.trimmed.xml").read_text(),
    21: (FIXTURES / "COMPS-8770.trimmed.xml").read_text(),
}


class Response(BytesIO):
    def __init__(self, text, url="https://www.govinfo.gov/"):
        super().__init__(text.encode())
        self.url = url
        self.headers = {}

    def geturl(self):
        return self.url


@pytest.fixture
def cache(tmp_path, monkeypatch):
    monkeypatch.setattr(ssa_client, "ECFR_CACHE_DIR", tmp_path)
    monkeypatch.setattr(ssa_client.time, "sleep", lambda _: None)
    return tmp_path


def respond_with(monkeypatch, text):
    calls = []

    def open_url(req, **kwargs):
        calls.append(req.full_url)
        return Response(text, req.full_url)

    monkeypatch.setattr(ecfr_client.urllib.request, "urlopen", open_url)
    return calls


class TestSsaToUscMapping:
    def test_mapping_matches_usc_source_credits(self):
        # Verified against the source-credit lines in the USC HTML
        # ("...ch. 531, title XIX, §1944, as added..."). The suffix sequence
        # is NOT contiguous: 1944 is w-3a, and w-7 is a freestanding
        # provision that belongs to no SSA section.
        assert SSA_TO_USC["1900"] == "1396"
        assert SSA_TO_USC["1901"] == "1396-1"
        assert SSA_TO_USC["1943"] == "1396w-3"
        assert SSA_TO_USC["1944"] == "1396w-3a"   # PDMP requirements
        assert SSA_TO_USC["1945"] == "1396w-4"    # health homes
        assert SSA_TO_USC["1948"] == "1396w-8"
        assert "1396w-7" not in USC_TO_SSA  # freestanding provision, not SSA

    def test_reverse_mapping_has_no_collisions(self):
        assert len(USC_TO_SSA) == len(SSA_TO_USC)


@pytest.mark.parametrize("title_num", [19, 21])
def test_valid_compilation_is_fetched_from_govinfo_and_cached(cache, monkeypatch, title_num):
    text = COMPILATIONS[title_num]
    calls = respond_with(monkeypatch, text)
    assert ssa_client.fetch_statute_xml(title_num, refresh=True) == text
    package = ssa_client.STATUTE_PACKAGES[title_num]
    assert calls == [f"https://www.govinfo.gov/content/pkg/{package}/uslm/{package}.xml"]
    assert (cache / f"{package}.xml").read_text() == text


@pytest.mark.parametrize("title_num", [19, 21])
def test_maintenance_response_does_not_overwrite_existing_statutes(cache, monkeypatch, title_num):
    path = ssa_client.statute_cache_path(title_num)
    original = COMPILATIONS[title_num]
    path.write_text(original)
    before = path.stat().st_mtime_ns
    respond_with(monkeypatch, "<html><title>Under Maintenance</title></html>")
    with pytest.raises(ValueError, match="statute compilation, not HTML"):
        ssa_client.fetch_statute_xml(title_num, refresh=True)
    assert path.read_text() == original
    assert path.stat().st_mtime_ns == before


def test_fresh_valid_cache_is_served_without_a_request(cache, monkeypatch):
    ssa_client.statute_cache_path(19).write_text(COMPILATIONS[19])
    calls = respond_with(monkeypatch, "unused")
    assert ssa_client.fetch_statute_xml(19) == COMPILATIONS[19]
    assert calls == []


def test_poisoned_fresh_cache_recovers_when_the_compilation_returns(cache, monkeypatch):
    path = ssa_client.statute_cache_path(19)
    path.write_text("<title>Under Maintenance</title>")
    respond_with(monkeypatch, COMPILATIONS[19])
    assert ssa_client.fetch_statute_xml(19) == COMPILATIONS[19]
    assert path.read_text() == COMPILATIONS[19]


def test_wrong_title_and_missing_anchor_text_are_rejected():
    with pytest.raises(ValueError, match="not SSA Title XIX"):
        ssa_client.validate_statute_xml(COMPILATIONS[21], 19)
    hollow = re.sub(
        r'<section identifier="/us/sComp/74/271/tXIX/s1902".*?</section>', "", COMPILATIONS[19], flags=re.S
    )
    with pytest.raises(ValueError, match="lacks required statutory text: 1902"):
        ssa_client.validate_statute_xml(hollow, 19)
    with pytest.raises(ValueError, match="Invalid statute XML"):
        ssa_client.validate_statute_xml("<statuteCompilation", 19)


def test_provenance_records_package_hash_and_currency(cache):
    path = ssa_client.statute_cache_path(21)
    path.write_text(COMPILATIONS[21])
    provenance = ssa_client.statute_provenance(21)
    assert provenance["package"] == "COMPS-8770"
    assert provenance["retrieval_url"] == "https://www.govinfo.gov/content/pkg/COMPS-8770/uslm/COMPS-8770.xml"
    assert provenance["source_sha256"] == hashlib.sha256(path.read_bytes()).hexdigest()
    assert provenance["current_through_public_law"] == "119–75"
    assert provenance["processed_date"] == "2026-02-20"
    assert provenance["fetched_at"].endswith("+00:00")
