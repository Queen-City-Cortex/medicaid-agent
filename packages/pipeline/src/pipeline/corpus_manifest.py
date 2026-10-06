"""Shared manifest loader for corpus inventory metadata."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path


MANIFEST_PATH = Path(__file__).resolve().parents[4] / "corpus-manifest.json"


@dataclass(frozen=True)
class SourceFamilyManifest:
    source_type: str
    directory_name: str
    authority_tier: str
    answer_role: str
    required_for_answering: bool
    freshness_expectation: str
    discovery_interval_hours: int
    freshness_sla_days: int
    allowed_domains: tuple[str, ...]
    allowed_file_formats: tuple[str, ...]
    landing_pages: tuple[str, ...]
    seed_urls: tuple[str, ...]
    # Set on a family whose source stopped receiving documents: the ISO date of
    # the last day it covers. Such a family is an archive: its documents load
    # with status "archived", never as the primary copy, and are not embedded.
    as_of_cutoff: str | None = None


@dataclass(frozen=True)
class CorpusManifest:
    source_families: tuple[SourceFamilyManifest, ...]
    federal_sources: tuple["FederalSourceManifest", ...]


@dataclass(frozen=True)
class FederalSourceManifest:
    source_type: str
    authority_tier: str
    answer_role: str
    required_for_answering: bool
    freshness_expectation: str
    refresh_interval_hours: int
    freshness_sla_days: int
    source_url: str


def _as_of_cutoff(raw_family: dict) -> str | None:
    cutoff = raw_family.get("as_of_cutoff")
    if cutoff is None:
        return None
    try:
        date.fromisoformat(cutoff)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"Invalid as_of_cutoff in corpus manifest: {raw_family['source_type']}"
        ) from exc
    return cutoff


def load_corpus_manifest() -> CorpusManifest:
    payload = json.loads(MANIFEST_PATH.read_text())
    families = []
    seen_source_types: set[str] = set()

    for raw_family in payload.get("source_families", []):
        source_type = raw_family["source_type"]
        if source_type in seen_source_types:
            raise ValueError(f"Duplicate source_type in corpus manifest: {source_type}")
        seen_source_types.add(source_type)

        families.append(
            SourceFamilyManifest(
                source_type=source_type,
                directory_name=raw_family["directory_name"],
                authority_tier=raw_family["authority_tier"],
                answer_role=raw_family["answer_role"],
                required_for_answering=bool(raw_family["required_for_answering"]),
                freshness_expectation=raw_family["freshness_expectation"],
                discovery_interval_hours=int(raw_family["discovery_interval_hours"]),
                freshness_sla_days=int(raw_family["freshness_sla_days"]),
                allowed_domains=tuple(raw_family["allowed_domains"]),
                allowed_file_formats=tuple(raw_family["allowed_file_formats"]),
                landing_pages=tuple(raw_family.get("landing_pages", [])),
                seed_urls=tuple(raw_family.get("seed_urls", [])),
                as_of_cutoff=_as_of_cutoff(raw_family),
            )
        )

    if not families:
        raise ValueError("Corpus manifest must declare at least one source family")

    federal_sources = tuple(
        FederalSourceManifest(
            source_type=raw_source["source_type"],
            authority_tier=raw_source["authority_tier"],
            answer_role=raw_source["answer_role"],
            required_for_answering=bool(raw_source["required_for_answering"]),
            freshness_expectation=raw_source["freshness_expectation"],
            refresh_interval_hours=int(raw_source["refresh_interval_hours"]),
            freshness_sla_days=int(raw_source["freshness_sla_days"]),
            source_url=raw_source["source_url"],
        )
        for raw_source in payload.get("federal_sources", [])
    )
    if not federal_sources:
        raise ValueError("Corpus manifest must declare federal_sources")
    for source in federal_sources:
        if source.refresh_interval_hours < 1 or source.freshness_sla_days < 1:
            raise ValueError(
                f"Invalid federal freshness metadata: {source.source_type}"
            )

    return CorpusManifest(
        source_families=tuple(families),
        federal_sources=federal_sources,
    )


CORPUS_MANIFEST = load_corpus_manifest()
SOURCE_FAMILY_MAP = {
    family.source_type: family
    for family in CORPUS_MANIFEST.source_families
}


# Families kept as an archive; see SourceFamilyManifest.as_of_cutoff.
ARCHIVE_SOURCE_TYPES = frozenset(
    family.source_type
    for family in CORPUS_MANIFEST.source_families
    if family.as_of_cutoff
)


def get_source_family(source_type: str) -> SourceFamilyManifest:
    try:
        return SOURCE_FAMILY_MAP[source_type]
    except KeyError as exc:
        raise KeyError(f"Unknown source family: {source_type}") from exc
