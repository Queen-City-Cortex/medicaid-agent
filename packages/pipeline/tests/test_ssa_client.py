"""Reject successful HTTP maintenance responses without poisoning valid caches."""

from io import BytesIO

import pytest

from pipeline.federal import ssa_client


def statutory_html(title_num):
    numbers = {19: ["1396a", "1396d", "1396n"], 21: ["1397aa", "1397cc", "1397jj"]}
    return "".join(
        f'<h3 class="section-head">&sect;{number}. Statutory section</h3>'
        + "<p>" + "Statutory provision. " * 20 + "</p>"
        for number in numbers[title_num]
    )


@pytest.fixture
def cache(tmp_path, monkeypatch):
    monkeypatch.setattr(ssa_client, "ECFR_CACHE_DIR", tmp_path)
    monkeypatch.setattr(ssa_client.time, "sleep", lambda _: None)
    return tmp_path


@pytest.mark.parametrize("title_num", [19, 21])
def test_maintenance_response_does_not_overwrite_existing_statutes(cache, monkeypatch, title_num):
    path = cache / f"usc-title42-subchapter{title_num}.html"
    original = statutory_html(title_num)
    path.write_text(original)
    before = path.stat().st_mtime_ns
    monkeypatch.setattr(ssa_client.urllib.request, "urlopen", lambda *a, **k: BytesIO(b"<html><title>Under Maintenance</title></html>"))
    with pytest.raises(ValueError, match="lacks required statutory text"):
        ssa_client.fetch_usc_subchapter(title_num, refresh=True)
    assert path.read_text() == original
    assert path.stat().st_mtime_ns == before


@pytest.mark.parametrize("title_num", [19, 21])
def test_valid_statutory_response_can_replace_cache(cache, monkeypatch, title_num):
    html = statutory_html(title_num)
    monkeypatch.setattr(ssa_client.urllib.request, "urlopen", lambda *a, **k: BytesIO(html.encode()))
    assert ssa_client.fetch_usc_subchapter(title_num, refresh=True) == html
    assert (cache / f"usc-title42-subchapter{title_num}.html").read_text() == html


def test_poisoned_fresh_cache_cannot_be_ingested(cache):
    (cache / "usc-title42-subchapter19.html").write_text("<title>Under Maintenance</title>")
    with pytest.raises(ValueError, match="lacks required statutory text"):
        ssa_client.fetch_usc_subchapter(19)


def test_wrong_subchapter_and_empty_headings_are_rejected():
    with pytest.raises(ValueError, match="lacks required statutory text"):
        ssa_client.validate_usc_subchapter(statutory_html(21), 19)
    with pytest.raises(ValueError, match="lacks required statutory text"):
        ssa_client.validate_usc_subchapter(statutory_html(19).replace("Statutory provision. " * 20, ""), 19)
