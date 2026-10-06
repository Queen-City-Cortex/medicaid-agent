"""GovInfo extraction preserves identities; rejected refreshes leave the cache alone."""

from io import BytesIO
from pathlib import Path
import json
import urllib.error
import xml.etree.ElementTree as ET

import pytest

from pipeline.federal import ecfr_client as client
from pipeline.federal.parser import parse_part_xml

BODY = "Substantive regulatory requirements. " * 10


def part_xml(title=42, part=440):
    return f'<CFRDOC title="{title}" part="{part}"><DIV8 TYPE="SECTION" N="{part}.1"><HEAD>Basis.</HEAD><P>{BODY}</P></DIV8></CFRDOC>'


def bulk_xml(title=42):
    return f'''<DLPSTEXTCLASS><HEADER><FILEDESC><PUBLICATIONSTMT><IDNO TYPE="title">{title}</IDNO></PUBLICATIONSTMT></FILEDESC></HEADER>
    <TEXT><DIV5 TYPE="PART" N="440"><DIV8 TYPE="SECTION" N="§ 440.1"><HEAD>§ 440.1 Basis.</HEAD><P>{BODY}</P></DIV8></DIV5>
    <DIV5 TYPE="PART" N="441"><DIV8 TYPE="SECTION" N="§ 441.1"><HEAD>§ 441.1 Scope.</HEAD><P>{BODY}</P></DIV8></DIV5></TEXT></DLPSTEXTCLASS>'''


class Response(BytesIO):
    def __init__(self, text, url):
        super().__init__(text.encode())
        self.url = url
        self.headers = {"Last-Modified": "Fri, 02 Oct 2026 22:24:08 GMT"}
    def geturl(self):
        return self.url


@pytest.fixture
def cache(tmp_path, monkeypatch):
    monkeypatch.setattr(client, "ECFR_CACHE_DIR", tmp_path)
    monkeypatch.setattr(client.time, "sleep", lambda _: None)
    client._title_issue_dates.clear()
    client._bulk_titles.clear()
    client._bulk_unavailable.clear()
    return tmp_path


def install_responses(monkeypatch, primary=part_xml(), bulk=bulk_xml()):
    calls = []
    def open_url(req, **kwargs):
        url = req.full_url
        calls.append(url)
        if url.endswith("titles.json"):
            text = json.dumps({"titles": [{"number": 42, "latest_issue_date": "2026-10-02"}]})
        elif "govinfo.gov" in url:
            text = bulk
        elif isinstance(primary, Exception):
            raise primary
        else:
            text = primary
        return Response(text, url)
    monkeypatch.setattr(client.urllib.request, "urlopen", open_url)
    return calls


def test_govinfo_is_fetched_first_and_retains_provenance(cache, monkeypatch):
    calls = install_responses(monkeypatch)
    text = client.fetch_part_xml(42, 440, refresh=True)
    root = ET.fromstring(text)
    assert root.get("source_sha256")
    assert "govinfo.gov" in root.get("retrieval_url")
    assert not any("ecfr.gov" in url for url in calls)
    assert (cache / "title-42-part-440.xml").read_text() == text


def test_one_bulk_fetch_supplies_exact_parts_and_original_section_ids(cache, monkeypatch):
    error = urllib.error.HTTPError("https://ecfr.gov", 406, "Not acceptable", {}, None)
    calls = install_responses(monkeypatch, primary=error)
    one = client.fetch_part_xml(42, 440, refresh=True)
    two = client.fetch_part_xml(42, 441, refresh=True)
    assert [s["section_number"] for s in parse_part_xml(one, 42, 440)] == ["440.1"]
    assert [s["section_number"] for s in parse_part_xml(two, 42, 441)] == ["441.1"]
    assert sum("govinfo.gov" in url for url in calls) == 1
    assert not any("/full/" in url for url in calls)
    assert "govinfo.gov" in ET.fromstring(one).get("retrieval_url")


def test_an_unusable_govinfo_title_falls_back_to_the_api_once_per_title(cache, monkeypatch):
    calls = install_responses(monkeypatch, bulk="<html>Maintenance</html>")
    text = client.fetch_part_xml(42, 440, refresh=True)
    root = ET.fromstring(text)
    assert root.get("issue_date") == "2026-10-02"
    assert "ecfr.gov" in root.get("retrieval_url")
    client.fetch_part_xml(42, 440, refresh=True)
    assert sum("govinfo.gov" in url for url in calls) == 1
    assert sum("/full/" in url for url in calls) == 2


@pytest.mark.parametrize("bad", ["<html>Maintenance</html>", "<broken", part_xml(45), part_xml(part=441), part_xml().replace(BODY, "")])
def test_rejected_primary_and_fallback_preserve_original_bytes_and_mtime(cache, monkeypatch, bad):
    path = cache / "title-42-part-440.xml"
    path.write_text(part_xml())
    before = path.stat().st_mtime_ns
    install_responses(monkeypatch, primary=bad, bulk="<html>Maintenance</html>")
    with pytest.raises(ValueError):
        client.fetch_part_xml(42, 440, refresh=True)
    assert path.read_text() == part_xml()
    assert path.stat().st_mtime_ns == before


@pytest.mark.parametrize("bad", [bulk_xml(45), bulk_xml().replace('N="440"', 'N="444"'), bulk_xml().replace(BODY, ""), bulk_xml().replace('</TEXT>', bulk_xml()[bulk_xml().index('<DIV5'):bulk_xml().index('<DIV5 TYPE="PART" N="441"')] + '</TEXT>')])
def test_wrong_missing_duplicate_or_empty_bulk_parts_fail(cache, monkeypatch, bad):
    install_responses(monkeypatch, primary=ValueError("primary rejected"), bulk=bad)
    with pytest.raises(ValueError):
        client.fetch_part_xml(42, 440, refresh=True)
    assert not (cache / "title-42-part-440.xml").exists()


def test_invalid_fresh_cache_is_not_consumed(cache, monkeypatch):
    path = cache / "title-42-part-440.xml"
    path.write_text("<html>Maintenance</html>")
    calls = install_responses(monkeypatch)
    assert "<DIV8" in client.fetch_part_xml(42, 440)
    assert calls


def test_existing_api_hierarchy_metadata_proves_title():
    fixture = Path(__file__).parent / "fixtures/ecfr-sample.xml"
    client.validate_part_xml(fixture.read_text(), 42, 440)
    with pytest.raises(ValueError, match="Wrong CFR title"):
        client.validate_part_xml(fixture.read_text(), 45, 440)


def test_reserved_section_ranges_retain_their_identity(cache, monkeypatch):
    bulk = bulk_xml().replace('N="§ 440.1"', 'N="§§ 440.204-440.205"')
    install_responses(monkeypatch, primary=ValueError('blocked'), bulk=bulk)
    text = client.fetch_part_xml(42, 440, refresh=True)
    assert parse_part_xml(text, 42, 440)[0]['section_number'] == '440.204-440.205'
