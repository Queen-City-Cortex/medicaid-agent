"""Fetch Social Security Act text from uscode.house.gov.

SSA.gov blocks automated access (403). The U.S. Code version at
uscode.house.gov has identical substantive text. SSA section numbers
(1902, 1905) map to USC sections (42 USC 1396a, 1396d).
"""

import time
import urllib.request
from pathlib import Path

from rich.console import Console

from pipeline.config import ECFR_CACHE_DIR, SSA_CACHE_MAX_AGE_DAYS

console = Console()

USER_AGENT = "NCMedicaidNavigator/1.0 (+https://queencitycortex.com/crawler-info)"

# USC URLs for Medicaid (Subchapter XIX) and CHIP (Subchapter XXI)
USC_URLS = {
    19: "https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title42-chapter7-subchapter19&edition=prelim",
    21: "https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title42-chapter7-subchapter21&edition=prelim",
}

# SSA section number → USC section number mapping.
#
# Verified against the source credits in the USC HTML itself — each section's
# credit line names its SSA section, e.g. "(Aug. 14, 1935, ch. 531, title XIX,
# §1945, as added ...)". Do NOT assume the suffix sequence is contiguous:
# SSA 1944 is 1396w-3a (not w-4), and 1396w-7 belongs to no SSA section at all
# (see FREESTANDING_USC_SECTIONS below).
SSA_TO_USC = {
    # Title XIX — Medicaid
    "1900": "1396",
    "1901": "1396-1",
    "1902": "1396a",
    "1903": "1396b",
    "1904": "1396c",
    "1905": "1396d",
    "1906": "1396e",
    "1906A": "1396e-1",
    "1907": "1396f",
    "1908": "1396g",
    "1908A": "1396g-1",
    "1909": "1396h",
    "1910": "1396i",
    "1911": "1396j",
    "1912": "1396k",
    "1913": "1396l",
    "1914": "1396m",
    "1915": "1396n",
    "1916": "1396o",
    "1916A": "1396o-1",
    "1917": "1396p",
    "1918": "1396q",
    "1919": "1396r",
    "1920": "1396r-1",
    "1920A": "1396r-1a",
    "1920B": "1396r-1b",
    "1920C": "1396r-1c",
    "1921": "1396r-2",
    "1922": "1396r-3",
    "1923": "1396r-4",
    "1924": "1396r-5",
    "1925": "1396r-6",
    "1926": "1396r-7",
    "1927": "1396r-8",
    "1928": "1396s",
    "1929": "1396t",
    "1930": "1396u",
    "1931": "1396u-1",
    "1932": "1396u-2",
    "1933": "1396u-3",
    "1934": "1396u-4",
    "1935": "1396u-5",
    "1936": "1396u-6",
    "1937": "1396u-7",
    "1938": "1396u-8",
    "1939": "1396v",
    "1940": "1396w",
    "1941": "1396w-1",
    "1942": "1396w-2",
    "1943": "1396w-3",
    "1944": "1396w-3a",
    "1945": "1396w-4",
    "1945A": "1396w-4a",
    "1946": "1396w-5",
    "1947": "1396w-6",
    "1948": "1396w-8",
    # Title XXI — CHIP
    "2101": "1397aa",
    "2102": "1397bb",
    "2103": "1397cc",
    "2104": "1397dd",
    "2105": "1397ee",
    "2106": "1397ff",
    "2107": "1397gg",
    "2108": "1397hh",
    "2109": "1397ii",
    "2110": "1397jj",
    "2111": "1397kk",
    "2112": "1397ll",
    "2113": "1397mm",
}

# Reverse mapping for resolving USC references back to SSA numbers
USC_TO_SSA = {v: k for k, v in SSA_TO_USC.items()}

# USC sections in chapter 7 subchapters XIX/XXI that are NOT part of the
# Social Security Act: their source credits cite only a standalone Public Law
# (no "Aug. 14, 1935, ch. 531" act credit), so they have no SSA section number
# and MUST NOT be given an entry in SSA_TO_USC. They are skipped by ingest-ssa
# by design; ingest them as freestanding USC documents if they're ever needed.
FREESTANDING_USC_SECTIONS = {
    "1396b-1",  # Pub. L. 111-148 §2702 — payment adjustment, health care-acquired conditions
    "1396w-7",  # Pub. L. 117-328 div. FF §5124 — crisis response services continuum
    "1396w-9",  # Pub. L. 119-75 div. J §6104 — maternity/labor/delivery cost studies
}


def _cache_path(title_num: int) -> Path:
    return ECFR_CACHE_DIR / f"usc-title42-subchapter{title_num}.html"


def validate_usc_subchapter(html: str, title_num: int) -> None:
    """Require statutory text before accepting either a response or a cache."""
    from pipeline.federal.ssa_parser import parse_usc_subchapter

    required = {
        19: {"1902", "1905", "1915"},
        21: {"2101", "2103", "2110"},
    }[title_num]
    sections = parse_usc_subchapter(html, title_num)
    substantive = {
        section["section_number"]
        for section in sections
        if len(section["content_text"].strip()) >= 100
    }
    if not required <= substantive:
        raise ValueError(
            f"USC subchapter {title_num} response lacks required statutory text: "
            + ", ".join(sorted(required - substantive))
        )


def fetch_usc_subchapter(title_num: int, refresh: bool = False) -> str:
    """Fetch the full USC subchapter HTML from uscode.house.gov."""
    cache = _cache_path(title_num)
    cache_age_days = (
        (time.time() - cache.stat().st_mtime) / 86_400
        if cache.exists()
        else None
    )
    if (
        not refresh
        and cache_age_days is not None
        and cache_age_days < SSA_CACHE_MAX_AGE_DAYS
    ):
        html = cache.read_text(encoding="utf-8")
        try:
            validate_usc_subchapter(html, title_num)
        except ValueError:
            console.print("  [yellow]Invalid USC cache; fetching statutory text again[/yellow]")
        else:
            return html

    url = USC_URLS[title_num]
    console.print(f"  Fetching USC Subchapter {title_num}: {url}")
    ECFR_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as response:
        html = response.read().decode("utf-8")

    validate_usc_subchapter(html, title_num)
    cache.write_text(html, encoding="utf-8")
    time.sleep(2)  # Be polite to government servers
    return html
