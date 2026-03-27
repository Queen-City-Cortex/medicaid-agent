"""Fetch XML from the eCFR API with local file caching."""

import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from rich.console import Console

from pipeline.config import ECFR_API_BASE, ECFR_CACHE_DIR, ECFR_CACHE_MAX_AGE_DAYS

console = Console()

USER_AGENT = "NCMedicaidNavigator/1.0 (+https://queencitycortex.com/crawler-info)"

# In-process cache for title issue dates (avoids repeated API calls per session)
_title_issue_dates: dict[int, str] = {}


def _get_title_issue_date(title: int) -> str:
    """
    Return the latest_issue_date for a CFR title.

    The eCFR full-text XML endpoint requires an explicit date rather than the
    word "current".  The structure and versions endpoints do accept "current",
    so we look up the date once via the titles list and reuse it.
    """
    if title in _title_issue_dates:
        return _title_issue_dates[title]

    url = f"{ECFR_API_BASE}/titles.json"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as response:
        data = json.loads(response.read())

    for t in data.get("titles", []):
        if t.get("number") == title:
            date = t["latest_issue_date"]
            _title_issue_dates[title] = date
            return date

    raise ValueError(f"Title {title} not found in eCFR titles list")


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

    The eCFR full-text endpoint requires an explicit issue date rather than the
    literal string "current".  We resolve the date via the titles API and cache
    the result locally to avoid repeated requests.  Returns the XML text.
    """
    cache = _cache_path(title, part, ".xml")

    if not refresh and _is_cache_fresh(cache):
        return cache.read_text(encoding="utf-8")

    issue_date = _get_title_issue_date(title)
    url = f"{ECFR_API_BASE}/full/{issue_date}/title-{title}.xml?part={part}"
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
    The structure endpoint accepts "current" so no date lookup is needed.
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
