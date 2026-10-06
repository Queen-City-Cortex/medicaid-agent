"""Year-stamped editions of one table: which registry rows a newer edition supersedes.

The agency's Archived tag is the primary signal and is left alone. This is the
backstop for the year the agency publishes a new table and has not yet tagged
the old one, and for a registry that holds no listing tags at all.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Any, Iterable

from pipeline.crawler_registry import PAYLOAD_RETAINED_STATUSES

# Measured on the DHHS index only (income, reserve and eligibility tables).
# Other families stamp years on titles for other reasons.
EDITION_SOURCE_TYPES = frozenset({"dhhs_policy"})

# A year standing alone. A digit, hyphen or slash on either side makes it part
# of a form number, a notice number or a date (DHB-2025, 2013-306, 9/10/2026).
_YEAR_RE = re.compile(r"(?<![\d/-])(?:19|20)\d\d(?![\d/-])")
# "August 10, 2020": a publication date, not an edition year.
_DATED_RE = re.compile(r"\b[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+(?:19|20)\d\d\b")
_NOTICE_RE = re.compile(r"\b(?:change\s+notice|letter|listserv)\b", re.IGNORECASE)
_POLICY_NUMBER_RE = re.compile(r"^\s*((?:MA|DMA|DHB|DSS)-\d+)\b", re.IGNORECASE)


@dataclass(frozen=True)
class SupersededEdition:
    """An older edition and the newest edition of the same table."""

    group: str
    year: int
    by_year: int
    by_title: str
    by_source_url: str
    by_local_path: str


def edition_key(title: str, *, today: date | None = None) -> tuple[str, int, str | None] | None:
    """(table stem, edition year, leading policy number), or None if not an edition.

    The stem is the title without its year and leading policy number, so
    "MA-2252 2023 NON-MAGI ..." and "2026 NON-MAGI ..." are one table. Every
    other digit stays in the stem: two titles that differ by a letter or form
    number are different documents.
    """
    if _NOTICE_RE.search(title) or _DATED_RE.search(title):
        return None
    years = _YEAR_RE.findall(title)
    if len(years) != 1:
        return None
    year = int(years[0])
    if year > (today or date.today()).year:
        return None
    number = _POLICY_NUMBER_RE.match(title)
    stem = _YEAR_RE.sub(" ", _POLICY_NUMBER_RE.sub(" ", title)).lower().replace("&", " and ")
    stem = " ".join(re.findall(r"[a-z0-9]+", stem))
    if not stem:
        return None
    return stem, year, number.group(1).upper() if number else None


def build_superseded_editions(
    rows: Iterable[dict[str, Any]],
    *,
    delisted_urls: frozenset[str] = frozenset(),
    today: date | None = None,
) -> dict[str, SupersededEdition]:
    """Map the source URL of each older edition to the edition that supersedes it.

    Only rows the registry says could load take part: a payload on disk, a
    retained registry status, still on the index. That is a first filter: the
    loader excludes documents for more reasons, so it marks an older edition
    only after the newer one has loaded. Editions of the same year are
    alternates and neither supersedes the other. A stem whose members carry
    two different policy numbers is two tables and is left alone.
    """
    groups: dict[tuple[str, str], list[tuple[int, str | None, dict[str, Any]]]] = {}
    for row in rows:
        source_type = row.get("source_type")
        source_url = row.get("source_url")
        if (
            source_type not in EDITION_SOURCE_TYPES
            or not source_url
            or not row.get("local_path")
            or row.get("status") not in PAYLOAD_RETAINED_STATUSES
            or source_url in delisted_urls
        ):
            continue
        key = edition_key(row.get("title") or "", today=today)
        if key is None:
            continue
        stem, year, number = key
        groups.setdefault((source_type, stem), []).append((year, number, row))

    superseded: dict[str, SupersededEdition] = {}
    for (_, stem), members in groups.items():
        if len({number for _, number, _ in members if number}) > 1:
            continue
        newest_year = max(year for year, _, _ in members)
        newest = min(
            (row for year, _, row in members if year == newest_year),
            key=lambda row: row["source_url"],
        )
        for year, _, row in members:
            if year < newest_year:
                superseded[row["source_url"]] = SupersededEdition(
                    group=stem,
                    year=year,
                    by_year=newest_year,
                    by_title=newest.get("title") or "",
                    by_source_url=newest["source_url"],
                    by_local_path=newest["local_path"],
                )
    return superseded
