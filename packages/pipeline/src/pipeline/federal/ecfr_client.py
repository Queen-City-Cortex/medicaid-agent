"""Fetch validated eCFR parts, with the official current GovInfo XML fallback."""

import hashlib
import json
import tempfile
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

from rich.console import Console

from pipeline.config import ECFR_API_BASE, ECFR_CACHE_DIR, ECFR_CACHE_MAX_AGE_DAYS
from pipeline.federal.parser import parse_part_xml

console = Console()
USER_AGENT = "NCMedicaidNavigator/1.0 (+https://queencitycortex.com/crawler-info)"
MAX_RESPONSE_BYTES = 64 * 1024 * 1024
_title_issue_dates: dict[int, str] = {}
_bulk_titles: dict[int, tuple[ET.Element, dict]] = {}
_bulk_only: set[int] = set()


def _download(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        payload = response.read(MAX_RESPONSE_BYTES + 1)
        if len(payload) > MAX_RESPONSE_BYTES:
            raise ValueError("Federal response exceeds the validated size limit")
        provenance = {
            "retrieval_url": response.geturl(),
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "source_sha256": hashlib.sha256(payload).hexdigest(),
            "source_last_modified": response.headers.get("Last-Modified", ""),
        }
    return payload.decode("utf-8"), provenance


def _get_title_issue_date(title: int) -> str:
    if title not in _title_issue_dates:
        text, _ = _download(f"{ECFR_API_BASE}/titles.json", timeout=30)
        for item in json.loads(text).get("titles", []):
            if item.get("number") == title:
                date = item["latest_issue_date"]
                datetime.strptime(date, "%Y-%m-%d")
                _title_issue_dates[title] = date
                break
        else:
            raise ValueError(f"Title {title} not found in eCFR titles list")
    return _title_issue_dates[title]


def _cache_path(title: int, part: int, suffix: str = ".xml") -> Path:
    return ECFR_CACHE_DIR / f"title-{title}-part-{part}{suffix}"


def _is_cache_fresh(path: Path) -> bool:
    if not path.exists():
        return False
    age = time.time() - path.stat().st_mtime
    return 0 <= age < ECFR_CACHE_MAX_AGE_DAYS * 86400


def validate_part_xml(text: str, title: int, part: int) -> ET.Element:
    try:
        root = ET.fromstring(text)
    except ET.ParseError as error:
        raise ValueError("Invalid federal XML") from error
    if root.tag != "CFRDOC":
        raise ValueError("Expected an eCFR part document, not HTML or whole-title XML")
    declared_title = root.get("title")
    if declared_title is not None and declared_title != str(title):
        raise ValueError("Wrong CFR title")
    if root.get("part") not in (None, str(part)):
        raise ValueError("Wrong CFR part")
    proven_title = declared_title == str(title)
    for section in root.iter("DIV8"):
        if section.get("TYPE") != "SECTION":
            continue
        metadata = section.get("hierarchy_metadata")
        if metadata:
            citation = json.loads(metadata).get("citation", "")
            if not citation.startswith(f"{title} CFR "):
                raise ValueError("Wrong CFR title in section metadata")
            proven_title = True
    sections = parse_part_xml(text, title, part)
    numbers = [row["section_number"] for row in sections]
    if not proven_title or not numbers or any(
        not number.startswith(f"{part}.") for number in numbers
    ) or len(numbers) != len(set(numbers)):
        raise ValueError("Missing, duplicate or wrong-title/part federal sections")
    if not any(len(row["content_text"].strip()) >= 100 for row in sections):
        raise ValueError("Federal part lacks substantive section text")
    return root


def _bulk_part(title, part):
    if title not in _bulk_titles:
        url = f"https://www.govinfo.gov/bulkdata/ECFR/title-{title}/ECFR-title{title}.xml"
        text, provenance = _download(url, timeout=120)
        try:
            root = ET.fromstring(text)
        except ET.ParseError as error:
            raise ValueError("Invalid GovInfo title XML") from error
        declared = root.find("./HEADER/FILEDESC/PUBLICATIONSTMT/IDNO[@TYPE='title']")
        if root.tag != "DLPSTEXTCLASS" or declared is None or (declared.text or "").strip() != str(title):
            raise ValueError("Wrong or missing GovInfo CFR title")
        _bulk_titles[title] = root, provenance
    root, provenance = _bulk_titles[title]
    parts = [node for node in root.iter("DIV5") if node.get("TYPE") == "PART" and node.get("N") == str(part)]
    if len(parts) != 1:
        raise ValueError(f"Expected exactly one GovInfo CFR part {title}/{part}")
    # Work on a copy: normalization must not change the retained title tree.
    selected = ET.fromstring(ET.tostring(parts[0], encoding="unicode"))
    for section in selected.iter("DIV8"):
        if section.get("TYPE") == "SECTION":
            section.set("N", (section.get("N") or "").lstrip("§").strip())
    document = ET.Element("CFRDOC", title=str(title), part=str(part), **provenance)
    document.append(selected)
    text = ET.tostring(document, encoding="unicode")
    validate_part_xml(text, title, part)
    return text


def _atomic_write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as output:
            temporary = Path(output.name)
            output.write(text)
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def fetch_part_xml(title: int, part: int, refresh: bool = False) -> str:
    cache = _cache_path(title, part)
    if not refresh and _is_cache_fresh(cache):
        text = cache.read_text(encoding="utf-8")
        try:
            validate_part_xml(text, title, part)
        except ValueError:
            console.print("  [yellow]Invalid CFR cache; fetching official content again[/yellow]")
        else:
            return text
    if title in _bulk_only:
        text = _bulk_part(title, part)
    else:
        try:
            date = _get_title_issue_date(title)
            url = f"{ECFR_API_BASE}/full/{date}/title-{title}.xml?part={part}"
            console.print(f"  Fetching {url}...")
            raw, provenance = _download(url)
            root = validate_part_xml(raw, title, part)
            root.attrib.update(provenance, title=str(title), part=str(part), issue_date=date)
            text = ET.tostring(root, encoding="unicode")
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as error:
            console.print(f"  eCFR access/content failed ({type(error).__name__}); trying current GovInfo XML")
            text = _bulk_part(title, part)
            _bulk_only.add(title)
    # Neither a failed fallback nor rejected content can poison a prior cache.
    _atomic_write(cache, text)
    time.sleep(1)
    return text
