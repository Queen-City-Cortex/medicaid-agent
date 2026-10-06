"""Fetch Social Security Act titles from GovInfo's Statute Compilations.

The compilations are the Office of the Legislative Counsel's text of the Act
as amended, numbered by SSA section (1902, 1905). They replaced the
uscode.house.gov subchapter pages, which carried editorial notes as statute
text and answered maintenance pages in October 2026. The USC mapping below is
kept for resolving "42 U.S.C. 1396a" citations back to SSA numbers.
"""

import hashlib
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

from rich.console import Console

from pipeline.config import ECFR_CACHE_DIR, SSA_CACHE_MAX_AGE_DAYS
from pipeline.federal.ecfr_client import _atomic_write, _download
from pipeline.federal.uslm_parser import USLM, compilation_metadata, parse_statute_compilation

console = Console()

# GovInfo Statute Compilation packages: Title XIX (Medicaid) and Title XXI (CHIP).
STATUTE_PACKAGES = {19: "COMPS-8765", 21: "COMPS-8770"}
STATUTE_TITLE_NAMES = {19: "XIX", 21: "XXI"}
# Sections a compiled title must carry with substantive text before it is
# accepted as a response or a cache.
REQUIRED_STATUTE_SECTIONS = {
    19: {"1902", "1905", "1915"},
    21: {"2101", "2103", "2110"},
}


def statute_package_url(title_num: int) -> str:
    """The USLM XML file inside the GovInfo package."""
    package = STATUTE_PACKAGES[title_num]
    return f"https://www.govinfo.gov/content/pkg/{package}/uslm/{package}.xml"


def statute_source_url(title_num: int) -> str:
    """The package's landing page; the statute Document's ``source_url``."""
    return f"https://www.govinfo.gov/app/details/{STATUTE_PACKAGES[title_num]}"


def statute_cache_path(title_num: int) -> Path:
    return ECFR_CACHE_DIR / f"{STATUTE_PACKAGES[title_num]}.xml"


# SSA section number → USC section number mapping.
#
# Verified against the source credits in the USC HTML itself — each section's
# credit line names its SSA section, e.g. "(Aug. 14, 1935, ch. 531, title XIX,
# §1945, as added ...)". Do NOT assume the suffix sequence is contiguous:
# SSA 1944 is 1396w-3a (not w-4), and 1396w-7 belongs to no SSA section at all
# (a freestanding Pub. L. 117-328 provision, like 1396b-1 and 1396w-9).
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


def validate_statute_xml(text: str, title_num: int) -> None:
    """Require the compiled title's anchor sections before accepting a response or a cache."""
    try:
        root = ET.fromstring(text)
    except ET.ParseError as error:
        raise ValueError("Invalid statute XML") from error
    if root.tag != f"{{{USLM}}}statuteCompilation":
        raise ValueError("Expected a GovInfo statute compilation, not HTML")
    short_titles = [
        (node.text or "").strip().upper()
        for node in root.iter(f"{{{USLM}}}containsShortTitle")
    ]
    if f"TITLE {STATUTE_TITLE_NAMES[title_num]} OF THE SOCIAL SECURITY ACT" not in short_titles:
        raise ValueError(f"Statute compilation is not SSA Title {STATUTE_TITLE_NAMES[title_num]}")
    substantive = {
        section["section_number"]
        for section in parse_statute_compilation(text, title_num)
        if len(section["content_text"].strip()) >= 100
    }
    required = REQUIRED_STATUTE_SECTIONS[title_num]
    if not required <= substantive:
        raise ValueError(
            f"Statute compilation for Title {STATUTE_TITLE_NAMES[title_num]} lacks required "
            "statutory text: " + ", ".join(sorted(required - substantive))
        )


def fetch_statute_xml(title_num: int, refresh: bool = False) -> str:
    """Fetch one compiled SSA title from GovInfo, keeping a validated cache."""
    cache = statute_cache_path(title_num)
    if not refresh and cache.exists():
        age_days = (time.time() - cache.stat().st_mtime) / 86_400
        if 0 <= age_days < SSA_CACHE_MAX_AGE_DAYS:
            text = cache.read_text(encoding="utf-8")
            try:
                validate_statute_xml(text, title_num)
            except ValueError:
                console.print("  [yellow]Invalid statute cache; fetching the compilation again[/yellow]")
            else:
                return text

    url = statute_package_url(title_num)
    console.print(f"  Fetching SSA Title {STATUTE_TITLE_NAMES[title_num]}: {url}")
    text, _ = _download(url, timeout=120)
    # A rejected response leaves the previous bytes and modification time alone.
    validate_statute_xml(text, title_num)
    _atomic_write(cache, text)
    time.sleep(1)
    return text


def statute_provenance(title_num: int) -> dict:
    """What was ingested: the package, its currency statement and the cached file's hash."""
    cache = statute_cache_path(title_num)
    payload = cache.read_bytes()
    return {
        "package": STATUTE_PACKAGES[title_num],
        "retrieval_url": statute_package_url(title_num),
        "source_sha256": hashlib.sha256(payload).hexdigest(),
        "fetched_at": datetime.fromtimestamp(cache.stat().st_mtime, timezone.utc).isoformat(),
        **compilation_metadata(payload.decode("utf-8")),
    }
