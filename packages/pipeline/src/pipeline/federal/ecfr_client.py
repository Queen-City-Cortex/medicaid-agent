"""Fetch XML from the eCFR API with local file caching."""

import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from rich.console import Console

from pipeline.config import ECFR_API_BASE, ECFR_CACHE_DIR, ECFR_CACHE_MAX_AGE_DAYS

console = Console()

USER_AGENT = "NCMedicaidNavigator/1.0 (+https://queencitycortex.com/crawler-info)"


def _cache_path(title: int, part: int, suffix: str = ".xml") -> Path:
    """Get the local cache file path for a CFR part."""
    return ECFR_CACHE_DIR / f"title-{title}-part-{part}{suffix}"


def _is_cache_fresh(path: Path) -> bool:
    """Check if a cached file exists and is younger than the max age."""
    if not path.exists():
        return False
    mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
    age_days = (datetime.now(timezone.utc) - mtime).days
    return age_days < ECFR_CACHE_MAX_AGE_DAYS


def fetch_part_xml(title: int, part: int, refresh: bool = False) -> str:
    """
    Fetch the full XML for a CFR part from the eCFR API.

    Caches locally to avoid repeated requests. Returns the XML text.
    """
    cache = _cache_path(title, part, ".xml")

    if not refresh and _is_cache_fresh(cache):
        return cache.read_text(encoding="utf-8")

    url = f"{ECFR_API_BASE}/full/current/title-{title}.xml?part={part}"
    console.print(f"  Fetching {url}...")

    ECFR_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as response:
        xml_text = response.read().decode("utf-8")

    cache.write_text(xml_text, encoding="utf-8")

    # Rate limit: 1 request per second
    time.sleep(1)

    return xml_text


def fetch_structure(title: int, part: int, refresh: bool = False) -> str:
    """
    Fetch the structure JSON for a CFR part from the eCFR API.

    Used to get TOC and section titles. Returns the JSON text.
    """
    cache = _cache_path(title, part, ".json")

    if not refresh and _is_cache_fresh(cache):
        return cache.read_text(encoding="utf-8")

    url = f"{ECFR_API_BASE}/structure/current/title-{title}.json?part={part}"
    console.print(f"  Fetching structure {url}...")

    ECFR_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as response:
        json_text = response.read().decode("utf-8")

    cache.write_text(json_text, encoding="utf-8")

    time.sleep(1)

    return json_text
