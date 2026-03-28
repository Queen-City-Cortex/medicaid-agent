"""Fetch Social Security Act text from ssa.gov."""

import time
import urllib.request
from pathlib import Path

from rich.console import Console

from pipeline.config import ECFR_CACHE_DIR

console = Console()

USER_AGENT = "NCMedicaidNavigator/1.0 (+https://queencitycortex.com/crawler-info)"

SSA_TITLES = {
    19: "https://www.ssa.gov/OP_Home/ssact/title19/title19.htm",
    21: "https://www.ssa.gov/OP_Home/ssact/title21/title21.htm",
}


def _cache_path(title_num: int) -> Path:
    return ECFR_CACHE_DIR / f"ssa-title-{title_num}.html"


def fetch_ssa_title_index(title_num: int, refresh: bool = False) -> str:
    """Fetch the SSA title index page listing all sections."""
    cache = _cache_path(title_num)
    if not refresh and cache.exists():
        return cache.read_text(encoding="utf-8")

    url = SSA_TITLES[title_num]
    console.print(f"  Fetching SSA Title {title_num} index: {url}")
    ECFR_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as response:
        html = response.read().decode("utf-8")

    cache.write_text(html, encoding="utf-8")
    time.sleep(1)
    return html


def fetch_ssa_section(url: str, section_num: str, title_num: int, refresh: bool = False) -> str:
    """Fetch a single SSA section page."""
    cache = ECFR_CACHE_DIR / f"ssa-title-{title_num}-sec-{section_num}.html"
    if not refresh and cache.exists():
        return cache.read_text(encoding="utf-8")

    console.print(f"    Fetching Section {section_num}...")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as response:
        html = response.read().decode("utf-8")

    cache.write_text(html, encoding="utf-8")
    time.sleep(1)
    return html
