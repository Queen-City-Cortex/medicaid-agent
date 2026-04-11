"""Shared manifest loader for corpus inventory metadata."""

from __future__ import annotations

import json
from dataclasses import dataclass
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
    allowed_domains: tuple[str, ...]
    allowed_file_formats: tuple[str, ...]
    landing_pages: tuple[str, ...]
    seed_urls: tuple[str, ...]


@dataclass(frozen=True)
class CorpusManifest:
    source_families: tuple[SourceFamilyManifest, ...]


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
                allowed_domains=tuple(raw_family["allowed_domains"]),
                allowed_file_formats=tuple(raw_family["allowed_file_formats"]),
                landing_pages=tuple(raw_family.get("landing_pages", [])),
                seed_urls=tuple(raw_family.get("seed_urls", [])),
            )
        )

    if not families:
        raise ValueError("Corpus manifest must declare at least one source family")

    return CorpusManifest(source_families=tuple(families))


CORPUS_MANIFEST = load_corpus_manifest()
SOURCE_FAMILY_MAP = {
    family.source_type: family
    for family in CORPUS_MANIFEST.source_families
}


def get_source_family(source_type: str) -> SourceFamilyManifest:
    try:
        return SOURCE_FAMILY_MAP[source_type]
    except KeyError as exc:
        raise KeyError(f"Unknown source family: {source_type}") from exc
