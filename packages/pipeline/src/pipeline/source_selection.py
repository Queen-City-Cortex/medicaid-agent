"""Corpus selection metadata for source families with variant-heavy archives."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
import re
from typing import Any, Mapping

# Registry rows always carry data-dir-relative paths (the crawler's downloader
# writes them that way), so the default data_dir is never exercised here and
# this module stays config-independent — unlike audit.py/loader.py, which pass
# their own monkeypatchable CRAWLER_DATA_DIR because they handle absolute paths.
from pipeline.crawler_registry import normalize_local_path as _normalize_local_path


FEE_SCHEDULE_HISTORY_WINDOW = 3

_FEE_SCHEDULE_REFERENCE_TITLES = (
    "user guide",
    "external user guide",
)
_FEE_SCHEDULE_NOISE_TERMS = {
    "excel",
    "exel",
    "pdf",
    "xls",
    "xlsx",
    "update",
    "updated",
    "revised",
    "revision",
    "effective",
    "only",
    "applies",
    "with",
    "without",
    "standard",
    "addon",
    "add",
    "on",
}
_FEE_SCHEDULE_FORMAT_RANK = {
    ".xlsx": 0,
    "xlsx": 0,
    ".pdf": 1,
    "pdf": 1,
    ".xls": 2,
    "xls": 2,
}
_MONTHS = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}
_COMPACT_DATE_RE = re.compile(r"\b(20\d{2})(\d{2})(\d{2})\b")
_NUMERIC_DATE_RE = re.compile(r"\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b")
_MONTH_DAY_YEAR_RE = re.compile(
    r"\b("
    r"jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|"
    r"aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?"
    r")\.?(?:\s+(\d{1,2}))?\s*,?\s*(\d{2,4})\b",
    re.IGNORECASE,
)
_FEE_SCHEDULE_DATE_TOKEN_RE = re.compile(
    r"\b(?:"
    r"jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|"
    r"aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?"
    r")\.?(?:\s+\d{1,2})?\s*,?\s*\d{2,4}\b"
    r"|\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b"
    r"|\b20\d{6}\b",
    re.IGNORECASE,
)
_FEE_SCHEDULE_YEAR_TOKEN_RE = re.compile(r"\b(?:19|20)\d{2}\b")
_FEE_SCHEDULE_ACRONYM_REPLACEMENTS: tuple[tuple[str, str], ...] = (
    (r"\bfqhc\b", "federally qualified health center"),
    (r"\bdme\b", "durable medical equipment"),
    (r"\bhit\b", "home infusion therapy"),
    (r"\blea\b", "local education agency"),
    (r"\blhd\b", "local health department"),
    (r"\brhc\b", "rural health clinic"),
    (r"\bfs\b", "fee schedule"),
    (r"\bray\b", "radiological imaging"),
    (r"\bcapc\b", "cap c"),
    (r"\bcapch\b", "cap ch"),
    (r"\bcapda\b", "cap da"),
    (r"\bcapcd\b", "cap cd"),
    (r"\bcap c\b", "cap c"),
    (r"\bcap da\b", "cap da"),
    (r"\bcap cd\b", "cap cd"),
    (r"\bcap ch\b", "cap ch"),
    (r"\bcap choice\b", "cap choice"),
)
_FEE_SCHEDULE_PHRASE_REPLACEMENTS: tuple[tuple[str, str], ...] = (
    ("ambulatory surgical centers", "ambulatory surgical center"),
    ("federally qualified health centers", "federally qualified health center"),
    ("physician services fee schedule", "physician service fee schedule"),
    ("physician fee schedule", "physician service fee schedule"),
    ("independent lab", "laboratory"),
    ("independent diagnostic testing facility services", "independent diagnostic testing facility"),
    ("hearing aid program", "hearing aid"),
    ("local health department", "lhd"),
    ("home health services", "home health"),
    ("fee schedules", "fee schedule"),
)
_FEE_SCHEDULE_BUCKET_RANK = {
    "primary": 0,
    "history": 1,
    "archive": 2,
    "companion": 3,
    "reference": 4,
}
_FEE_SCHEDULE_BACKLOG_PRIORITY_RANK = {
    "critical": 0,
    "high": 1,
    "medium": 2,
}


@dataclass(frozen=True)
class SourceSelectionMetadata:
    corpus_bucket: str | None = None
    variant_group: str | None = None
    variant_date: str | None = None
    retrieval_ready: bool = True


@dataclass(frozen=True)
class FeeScheduleBacklogCandidate:
    title: str | None
    source_url: str | None
    source_format: str | None
    variant_group: str
    variant_date: str | None
    corpus_bucket: str


@dataclass(frozen=True)
class FeeScheduleBacklogGroup:
    priority: str
    variant_group: str
    downloaded_retrieval_ready: int
    discovered_retrieval_ready: int
    downloaded_primary: int
    discovered_primary: int
    downloaded_history: int
    discovered_history: int
    candidates: tuple[FeeScheduleBacklogCandidate, ...]


def _normalize_source_format(source_format: str | None) -> str | None:
    if not source_format:
        return None
    return source_format if source_format.startswith(".") else f".{source_format}"


def _infer_source_format(entry: Mapping[str, Any]) -> str | None:
    explicit = _normalize_source_format(entry.get("source_format"))
    if explicit:
        return explicit

    local_path = str(entry.get("local_path") or "")
    if local_path:
        suffix = Path(local_path).suffix.lower()
        if suffix:
            return suffix

    source_url = str(entry.get("source_url") or "")
    if source_url:
        suffix = Path(source_url.split("?", 1)[0]).suffix.lower()
        if suffix:
            return suffix

    return None


def _normalize_fee_schedule_group(raw_value: str) -> str | None:
    text = raw_value.strip().lower()
    if not text:
        return None

    text = re.sub(r"\([^)]*\)", " ", text)
    text = _FEE_SCHEDULE_DATE_TOKEN_RE.sub(" ", text)
    text = _FEE_SCHEDULE_YEAR_TOKEN_RE.sub(" ", text)

    for pattern, replacement in _FEE_SCHEDULE_ACRONYM_REPLACEMENTS:
        text = re.sub(pattern, replacement, text)

    text = re.sub(r"[^a-z0-9]+", " ", text)
    for source, replacement in _FEE_SCHEDULE_PHRASE_REPLACEMENTS:
        text = text.replace(source, replacement)

    words = [
        word
        for word in text.split()
        if word not in _FEE_SCHEDULE_NOISE_TERMS
    ]

    normalized = " ".join(words)
    normalized = re.sub(r"\s+", " ", normalized).strip(" -_")
    if normalized and "fee schedule" not in normalized and "rate" not in normalized and "rates" not in normalized:
        normalized = f"{normalized} fee schedule"
    return normalized or None


def _extract_text_candidates(entry: Mapping[str, Any]) -> list[str]:
    candidates = [
        str(entry.get("title") or ""),
        Path(str(entry.get("local_path") or "")).stem,
        Path(str(entry.get("source_url") or "")).stem,
        str(entry.get("source_url") or ""),
    ]
    return [candidate for candidate in candidates if candidate.strip()]


def _parse_year(year_text: str) -> int:
    year = int(year_text)
    if year < 100:
        return 2000 + year if year < 50 else 1900 + year
    return year


def _safe_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _extract_variant_date(entry: Mapping[str, Any]) -> str | None:
    candidates: list[date] = []

    for text in _extract_text_candidates(entry):
        for year_text, month_text, day_text in _COMPACT_DATE_RE.findall(text):
            parsed = _safe_date(int(year_text), int(month_text), int(day_text))
            if parsed is not None:
                candidates.append(parsed)

        for month_text, day_text, year_text in _NUMERIC_DATE_RE.findall(text):
            parsed = _safe_date(_parse_year(year_text), int(month_text), int(day_text))
            if parsed is not None:
                candidates.append(parsed)

        for month_name, day_text, year_text in _MONTH_DAY_YEAR_RE.findall(text):
            month = _MONTHS.get(month_name.lower().rstrip("."))
            if month is None:
                continue
            day = int(day_text) if day_text else 1
            parsed = _safe_date(_parse_year(year_text), month, day)
            if parsed is not None:
                candidates.append(parsed)

    if not candidates:
        return None

    return max(candidates).isoformat()


def _extract_variant_group(entry: Mapping[str, Any]) -> str | None:
    for text in _extract_text_candidates(entry):
        normalized = _normalize_fee_schedule_group(text)
        if normalized:
            return normalized
    return None


def _is_reference_entry(entry: Mapping[str, Any]) -> bool:
    title = str(entry.get("title") or "").lower()
    return any(marker in title for marker in _FEE_SCHEDULE_REFERENCE_TITLES)


def _is_archive_source(entry: Mapping[str, Any]) -> bool:
    url = str(entry.get("source_url") or "").lower()
    return (
        "/documents/providers/bulletins/archives/" in url
        or "/fee-schedules/archives/" in url
        or "fee-schedules-archive" in url
        or "files.nc.gov/ncdma/documents/fee-schedules/archives/" in url
    )


def _status_rank(status: str | None) -> int:
    if status == "downloaded":
        return 0
    if status == "discovered":
        return 1
    if status == "removed":
        return 3
    if status == "error":
        return 4
    return 2


def _variant_sort_key(variant_date: str | None, variant_key: str) -> tuple[int, str]:
    return (1 if variant_date is not None else 0, variant_date or variant_key)


def build_source_selection_index(entries: list[Mapping[str, Any]]) -> dict[str, SourceSelectionMetadata]:
    index: dict[str, SourceSelectionMetadata] = {}

    for entry in entries:
        if entry.get("source_type") != "fee_schedule":
            continue

        metadata = SourceSelectionMetadata()
        source_url = str(entry.get("source_url") or "")
        local_path = _normalize_local_path(entry.get("local_path"))
        if source_url:
            index[source_url] = metadata
        if local_path:
            index[local_path] = metadata

    fee_entries: list[dict[str, Any]] = []
    for entry in entries:
        if entry.get("source_type") != "fee_schedule":
            continue

        source_url = str(entry.get("source_url") or "")
        local_path = _normalize_local_path(entry.get("local_path"))
        fee_entries.append(
            {
                "title": entry.get("title"),
                "source_type": "fee_schedule",
                "source_url": source_url,
                "local_path": local_path,
                "source_format": _infer_source_format(entry),
                "status": entry.get("registry_status") or entry.get("status"),
                "variant_group": _extract_variant_group(entry),
                "variant_date": _extract_variant_date(entry),
                "reference_entry": _is_reference_entry(entry),
                "archive_source": _is_archive_source(entry),
            }
        )

    by_group: dict[str, list[dict[str, Any]]] = {}
    for entry in fee_entries:
        group = entry["variant_group"] or "fee_schedule"
        by_group.setdefault(group, []).append(entry)

    for group, group_entries in by_group.items():
        versions: dict[str, list[dict[str, Any]]] = {}
        for entry in group_entries:
            variant_key = entry["variant_date"] or f"undated:{group}"
            versions.setdefault(variant_key, []).append(entry)

        sorted_versions = sorted(
            versions.items(),
            key=lambda item: _variant_sort_key(item[1][0]["variant_date"], item[0]),
            reverse=True,
        )

        variant_rank = 0
        for _, version_entries in sorted_versions:
            chosen = min(
                version_entries,
                key=lambda entry: (
                    1 if entry["reference_entry"] else 0,
                    _FEE_SCHEDULE_FORMAT_RANK.get(entry["source_format"], 9),
                    1 if entry["archive_source"] else 0,
                    _status_rank(entry.get("status")),
                    entry.get("source_url") or "",
                    entry.get("local_path") or "",
                ),
            )

            chosen_bucket = "reference"
            chosen_ready = False
            if not chosen["reference_entry"]:
                if variant_rank == 0:
                    chosen_bucket = "primary"
                    chosen_ready = True
                elif variant_rank < FEE_SCHEDULE_HISTORY_WINDOW:
                    chosen_bucket = "history"
                    chosen_ready = True
                else:
                    chosen_bucket = "archive"
                    chosen_ready = False
                variant_rank += 1

            for entry in version_entries:
                bucket = chosen_bucket if entry is chosen else "reference" if entry["reference_entry"] else "companion"
                retrieval_ready = chosen_ready if entry is chosen else False
                metadata = SourceSelectionMetadata(
                    corpus_bucket=bucket,
                    variant_group=group,
                    variant_date=entry["variant_date"],
                    retrieval_ready=retrieval_ready,
                )
                if entry["source_url"]:
                    index[entry["source_url"]] = metadata
                if entry["local_path"]:
                    index[entry["local_path"]] = metadata

    return index


def resolve_source_selection_metadata(
    entry: Mapping[str, Any],
    selection_index: Mapping[str, SourceSelectionMetadata] | None = None,
) -> SourceSelectionMetadata:
    if entry.get("source_type") != "fee_schedule":
        return SourceSelectionMetadata()

    source_url = str(entry.get("source_url") or "")
    local_path = _normalize_local_path(entry.get("local_path"))

    if selection_index is not None:
        if source_url and source_url in selection_index:
            return selection_index[source_url]
        if local_path and local_path in selection_index:
            return selection_index[local_path]

    return SourceSelectionMetadata(
        corpus_bucket="reference" if _is_reference_entry(entry) else "primary",
        variant_group=_extract_variant_group(entry),
        variant_date=_extract_variant_date(entry),
        retrieval_ready=not _is_reference_entry(entry),
    )


def _candidate_sort_key(candidate: FeeScheduleBacklogCandidate) -> tuple[int, int, int, int, int, int, str, str]:
    if candidate.variant_date:
        try:
            year, month, day = (int(part) for part in candidate.variant_date.split("-", 2))
            date_key = (0, -year, -month, -day)
        except ValueError:
            date_key = (0, 0, 0, 0)
    else:
        date_key = (1, 0, 0, 0)
    return (
        _FEE_SCHEDULE_BUCKET_RANK.get(candidate.corpus_bucket, 99),
        *date_key,
        _FEE_SCHEDULE_FORMAT_RANK.get(candidate.source_format, 9),
        candidate.title or "",
        candidate.source_url or "",
    )


def _group_priority(
    *,
    downloaded_retrieval_ready: int,
    discovered_primary: int,
    discovered_history: int,
) -> str:
    if downloaded_retrieval_ready == 0:
        return "critical"
    if discovered_primary > 0:
        return "high"
    if discovered_history > 0:
        return "medium"
    return "medium"


def build_fee_schedule_backlog_report(
    entries: list[Mapping[str, Any]],
    *,
    group_limit: int = 25,
    candidate_limit: int = 50,
) -> dict[str, Any]:
    fee_entries = [entry for entry in entries if entry.get("source_type") == "fee_schedule"]
    selection_index = build_source_selection_index(fee_entries)

    enriched_entries: list[dict[str, Any]] = []
    for entry in fee_entries:
        selection = resolve_source_selection_metadata(entry, selection_index)
        enriched_entries.append(
            {
                "title": entry.get("title"),
                "source_url": entry.get("source_url"),
                "source_format": _infer_source_format(entry),
                "status": entry.get("registry_status") or entry.get("status"),
                "variant_group": selection.variant_group or "fee_schedule",
                "variant_date": selection.variant_date,
                "corpus_bucket": selection.corpus_bucket or "archive",
                "retrieval_ready": selection.retrieval_ready,
            }
        )

    summary = {
        "documents_total": len(enriched_entries),
        "discovered_total": sum(entry["status"] == "discovered" for entry in enriched_entries),
        "downloaded_total": sum(entry["status"] == "downloaded" for entry in enriched_entries),
        "discovered_retrieval_ready": sum(
            entry["status"] == "discovered" and entry["retrieval_ready"]
            for entry in enriched_entries
        ),
        "downloaded_retrieval_ready": sum(
            entry["status"] == "downloaded" and entry["retrieval_ready"]
            for entry in enriched_entries
        ),
    }
    summary["discovered_non_retrieval_ready"] = summary["discovered_total"] - summary["discovered_retrieval_ready"]

    group_stats: dict[str, dict[str, Any]] = {}
    for entry in enriched_entries:
        stats = group_stats.setdefault(
            entry["variant_group"],
            {
                "downloaded_retrieval_ready": 0,
                "discovered_retrieval_ready": 0,
                "downloaded_primary": 0,
                "discovered_primary": 0,
                "downloaded_history": 0,
                "discovered_history": 0,
                "candidates": [],
            },
        )
        if entry["status"] == "downloaded" and entry["retrieval_ready"]:
            stats["downloaded_retrieval_ready"] += 1
        if entry["status"] == "discovered" and entry["retrieval_ready"]:
            stats["discovered_retrieval_ready"] += 1
            stats["candidates"].append(
                FeeScheduleBacklogCandidate(
                    title=entry["title"],
                    source_url=entry["source_url"],
                    source_format=entry["source_format"],
                    variant_group=entry["variant_group"],
                    variant_date=entry["variant_date"],
                    corpus_bucket=entry["corpus_bucket"],
                )
            )
        if entry["status"] == "downloaded" and entry["corpus_bucket"] == "primary":
            stats["downloaded_primary"] += 1
        if entry["status"] == "discovered" and entry["corpus_bucket"] == "primary":
            stats["discovered_primary"] += 1
        if entry["status"] == "downloaded" and entry["corpus_bucket"] == "history":
            stats["downloaded_history"] += 1
        if entry["status"] == "discovered" and entry["corpus_bucket"] == "history":
            stats["discovered_history"] += 1

    groups: list[FeeScheduleBacklogGroup] = []
    for variant_group, stats in group_stats.items():
        if stats["discovered_retrieval_ready"] == 0:
            continue
        priority = _group_priority(
            downloaded_retrieval_ready=stats["downloaded_retrieval_ready"],
            discovered_primary=stats["discovered_primary"],
            discovered_history=stats["discovered_history"],
        )
        candidates = tuple(sorted(stats["candidates"], key=_candidate_sort_key)[:3])
        groups.append(
            FeeScheduleBacklogGroup(
                priority=priority,
                variant_group=variant_group,
                downloaded_retrieval_ready=stats["downloaded_retrieval_ready"],
                discovered_retrieval_ready=stats["discovered_retrieval_ready"],
                downloaded_primary=stats["downloaded_primary"],
                discovered_primary=stats["discovered_primary"],
                downloaded_history=stats["downloaded_history"],
                discovered_history=stats["discovered_history"],
                candidates=candidates,
            )
        )

    groups.sort(
        key=lambda group: (
            _FEE_SCHEDULE_BACKLOG_PRIORITY_RANK.get(group.priority, 99),
            -(group.discovered_primary + group.discovered_history),
            group.variant_group,
        )
    )

    top_candidates = sorted(
        (
            candidate
            for group in groups
            for candidate in group.candidates
        ),
        key=_candidate_sort_key,
    )[:candidate_limit]

    priority_counts = {
        "critical": sum(group.priority == "critical" for group in groups),
        "high": sum(group.priority == "high" for group in groups),
        "medium": sum(group.priority == "medium" for group in groups),
    }

    return {
        "summary": {
            **summary,
            "groups_with_discovered_retrieval_ready": len(groups),
            "groups_missing_downloaded_retrieval_ready": priority_counts["critical"],
            "groups_with_new_primary_candidates": priority_counts["high"],
            "groups_with_history_candidates_only": priority_counts["medium"],
        },
        "groups": [
            {
                "priority": group.priority,
                "variant_group": group.variant_group,
                "downloaded_retrieval_ready": group.downloaded_retrieval_ready,
                "discovered_retrieval_ready": group.discovered_retrieval_ready,
                "downloaded_primary": group.downloaded_primary,
                "discovered_primary": group.discovered_primary,
                "downloaded_history": group.downloaded_history,
                "discovered_history": group.discovered_history,
                "candidates": [
                    {
                        "title": candidate.title,
                        "source_url": candidate.source_url,
                        "source_format": candidate.source_format,
                        "variant_group": candidate.variant_group,
                        "variant_date": candidate.variant_date,
                        "corpus_bucket": candidate.corpus_bucket,
                    }
                    for candidate in group.candidates
                ],
            }
            for group in groups[:group_limit]
        ],
        "top_candidates": [
            {
                "title": candidate.title,
                "source_url": candidate.source_url,
                "source_format": candidate.source_format,
                "variant_group": candidate.variant_group,
                "variant_date": candidate.variant_date,
                "corpus_bucket": candidate.corpus_bucket,
            }
            for candidate in top_candidates
        ],
    }


def render_fee_schedule_backlog_markdown(report: Mapping[str, Any]) -> str:
    summary = report["summary"]
    lines = [
        "# Fee Schedule Backlog",
        "",
        f"- Total fee schedules tracked: {summary['documents_total']}",
        f"- Discovered-only fee schedules: {summary['discovered_total']}",
        f"- Discovered retrieval-ready candidates: {summary['discovered_retrieval_ready']}",
        f"- Discovered archive/companion/reference items: {summary['discovered_non_retrieval_ready']}",
        f"- Groups missing any downloaded retrieval-ready coverage: {summary['groups_missing_downloaded_retrieval_ready']}",
        f"- Groups with newer primary candidates waiting to download: {summary['groups_with_new_primary_candidates']}",
        f"- Groups with only additional history candidates waiting: {summary['groups_with_history_candidates_only']}",
        "",
        "| Priority | Variant Group | Downloaded Ready | Discovered Ready | Next Candidates |",
        "| --- | --- | ---: | ---: | --- |",
    ]

    for group in report["groups"]:
        candidates = ", ".join(
            f"{candidate['corpus_bucket']} {candidate.get('variant_date') or 'undated'} {candidate.get('title') or '(untitled)'}"
            for candidate in group["candidates"]
        ) or "none"
        lines.append(
            "| {priority} | {variant_group} | {downloaded_retrieval_ready} | {discovered_retrieval_ready} | {candidates} |".format(
                priority=group["priority"],
                variant_group=group["variant_group"],
                downloaded_retrieval_ready=group["downloaded_retrieval_ready"],
                discovered_retrieval_ready=group["discovered_retrieval_ready"],
                candidates=candidates,
            )
        )

    return "\n".join(lines) + "\n"
